/**
 * Linara EAS build log: puts each finished build the eas-build-webhook Edge
 * Function forwards into the Doc's build table, in place. It finds the
 * paragraph that reads exactly SECTION (default "LINARA"), the first table
 * after it, and the row whose first cell reads ROW (default "Mobile"), then
 * replaces that row's Link, Notes and Date Updated cells. Not deployed with
 * the Edge Function; paste into the Doc's Apps Script (setup in README.md).
 *
 * Script properties (Project Settings > Script properties):
 *   TOKEN    same value as the EAS_LOG_APPS_SCRIPT_TOKEN Supabase secret
 *   DOC_ID   the Google Doc's id (the part of its URL between /d/ and /edit)
 *   SECTION  optional, default LINARA
 *   ROW      optional, default Mobile
 *
 * Apps Script cannot read request headers, so the Edge Function checks Expo's
 * signature and this script checks the shared TOKEN sent in the body.
 *
 * Only a finished build changes the row: a failed or canceled one leaves the
 * last working link in place. A build that finished before the one already in
 * the row (a late EAS retry) is skipped too.
 */

var TIME_ZONE = 'Asia/Manila';
var DONE_PREFIX = 'build:';
var LAST_KEY = 'LAST_COMPLETED_AT';
// Script properties hold up to 500 KB; keep the newest ids only.
var MAX_REMEMBERED = 300;
var LINK_COLOR = '#1155cc';

function doPost(e) {
  var result = handleBuildPost_(e, {
    props: PropertiesService.getScriptProperties(),
    openDoc: function (id) { return DocumentApp.openById(id); },
    lock: LockService.getScriptLock(),
    formatDate: function (d) { return Utilities.formatDate(d, TIME_ZONE, 'M/d/yyyy'); },
    now: function () { return new Date(); },
    attribute: DocumentApp.Attribute,
  });
  return ContentService.createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

function handleBuildPost_(e, deps) {
  var payload;
  try {
    payload = JSON.parse(e && e.postData ? e.postData.contents : '');
  } catch (err) {
    return { ok: false, error: 'Body is not JSON' };
  }
  if (!payload || typeof payload !== 'object') return { ok: false, error: 'Body is not JSON' };

  var expected = deps.props.getProperty('TOKEN');
  if (!expected || typeof payload.token !== 'string' || !sameText_(payload.token, expected)) {
    return { ok: false, error: 'Unauthorized' };
  }

  var build = payload.build;
  if (!build || typeof build.id !== 'string' || !/^[0-9a-f-]{8,64}$/i.test(build.id)) {
    return { ok: false, error: 'Missing build id' };
  }

  var docId = deps.props.getProperty('DOC_ID');
  if (!docId) return { ok: false, error: 'DOC_ID is not set' };

  // Two deliveries of one build (EAS retries) must not both write.
  if (!deps.lock.tryLock(20000)) return { ok: false, error: 'Busy, try again' };
  try {
    if (deps.props.getProperty(DONE_PREFIX + build.id)) return { ok: true, duplicate: true };

    var result = { ok: true, duplicate: false };
    var completed = new Date(str_(build.completedAt));
    var completedMs = isNaN(completed.getTime()) ? null : completed.getTime();
    var lastMs = Number(deps.props.getProperty(LAST_KEY) || 0);

    if (str_(build.status) !== 'finished' || !safeUrl_(build.detailsUrl)) {
      result.skipped = 'status';
    } else if (completedMs !== null && completedMs < lastMs) {
      result.skipped = 'older';
    } else {
      updateRow_(deps.openDoc(docId), build, deps, completedMs === null ? deps.now() : completed);
      if (completedMs !== null) deps.props.setProperty(LAST_KEY, String(completedMs));
      result.updated = true;
    }

    deps.props.setProperty(DONE_PREFIX + build.id, String(Date.now()));
    forgetOldest_(deps.props);
    return result;
  } catch (err) {
    return { ok: false, error: String(err && err.message ? err.message : err) };
  } finally {
    deps.lock.releaseLock();
  }
}

function sameText_(a, b) {
  if (a.length !== b.length) return false;
  var diff = 0;
  for (var i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function str_(v) {
  return typeof v === 'string' ? v : '';
}

function cap_(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

function norm_(s) {
  return String(s || '').replace(/\s+/g, ' ').trim().toLowerCase();
}

// Only Expo's own https links become clickable.
function safeUrl_(v) {
  var s = str_(v);
  return /^https:\/\/([a-z0-9-]+\.)*expo\.dev(\/|$)/i.test(s) ? s : '';
}

function platformLabel_(p) {
  if (p === 'android') return 'Android';
  if (p === 'ios') return 'iOS';
  return p ? cap_(p) : 'Unknown platform';
}

/** "Preview · Android · v1.0.2 (12) · 564b61e Add home screen" */
function notesText_(build) {
  var version = str_(build.appVersion) || '?';
  if (str_(build.appBuildVersion)) version += ' (' + build.appBuildVersion + ')';
  var parts = [cap_(str_(build.profile) || 'build'), platformLabel_(str_(build.platform)), 'v' + version];
  var commit = [str_(build.gitCommitHash).slice(0, 7), str_(build.gitCommitMessage).split('\n')[0]]
    .filter(String).join(' ');
  if (commit) parts.push(commit);
  return parts.join(' · ');
}

function typeName_(el) {
  return el && el.getType ? String(el.getType()) : '';
}

/** The first table after the paragraph that reads exactly `section`. */
function findTable_(body, section) {
  var want = norm_(section);
  var n = body.getNumChildren();
  for (var i = 0; i < n; i++) {
    var el = body.getChild(i);
    if (typeName_(el) !== 'PARAGRAPH' || norm_(el.asParagraph().getText()) !== want) continue;
    for (var j = i + 1; j < n; j++) {
      var next = body.getChild(j);
      if (typeName_(next) === 'TABLE') return next.asTable();
    }
  }
  return null;
}

/** Column indexes by header text, falling back to Type | Link | Notes | Date. */
function columns_(table) {
  var cols = { link: 1, notes: 2, date: 3 };
  var header = table.getRow(0);
  for (var c = 0; c < header.getNumCells(); c++) {
    var h = norm_(header.getCell(c).getText());
    if (h.indexOf('link') === 0) cols.link = c;
    else if (h.indexOf('note') === 0) cols.notes = c;
    else if (h.indexOf('date') === 0) cols.date = c;
  }
  return cols;
}

/**
 * Replaces a cell's contents with one line of text, keeping the font of what
 * was there (or of `fallback`, the row's Type cell, when it was empty), and
 * links the whole line when `url` is given.
 */
function firstAttrs_(cell) {
  var text = cell.getChild(0).asParagraph().editAsText();
  return text.getText().length ? text.getAttributes(0) : null;
}

function setCell_(cell, value, url, deps, fallback) {
  while (cell.getNumChildren() > 1) cell.getChild(cell.getNumChildren() - 1).removeFromParent();
  var text = cell.getChild(0).asParagraph().editAsText();
  var attrs = firstAttrs_(cell) || fallback || null;
  text.setText(value);
  if (!value.length) return;
  var end = value.length - 1;
  if (attrs) {
    attrs[deps.attribute.LINK_URL] = null;
    text.setAttributes(0, end, attrs);
  }
  text.setLinkUrl(0, end, url || null);
  if (url) {
    text.setForegroundColor(0, end, LINK_COLOR);
    text.setUnderline(0, end, true);
  } else if (attrs) {
    text.setUnderline(0, end, false);
  }
}

function updateRow_(doc, build, deps, when) {
  var section = deps.props.getProperty('SECTION') || 'LINARA';
  var rowName = deps.props.getProperty('ROW') || 'Mobile';
  var table = findTable_(doc.getBody(), section);
  if (!table) throw new Error('No table under a "' + section + '" heading in the Doc');

  var cols = columns_(table);
  var row = null;
  for (var r = 1; r < table.getNumRows(); r++) {
    if (norm_(table.getRow(r).getCell(0).getText()) === norm_(rowName)) {
      row = table.getRow(r);
      break;
    }
  }
  if (!row) throw new Error('No "' + rowName + '" row in the ' + section + ' table');
  var needed = Math.max(cols.link, cols.notes, cols.date) + 1;
  if (row.getNumCells() < needed) throw new Error('The ' + rowName + ' row has too few columns');

  var url = safeUrl_(build.detailsUrl);
  var fallback = firstAttrs_(row.getCell(0));
  setCell_(row.getCell(cols.link), url, url, deps, fallback);
  setCell_(row.getCell(cols.notes), notesText_(build), null, deps, fallback);
  setCell_(row.getCell(cols.date), deps.formatDate(when), null, deps, fallback);
  doc.saveAndClose();
}

function forgetOldest_(props) {
  var all = props.getProperties();
  var done = Object.keys(all).filter(function (k) { return k.indexOf(DONE_PREFIX) === 0; });
  if (done.length <= MAX_REMEMBERED) return;
  done.sort(function (a, b) { return Number(all[a]) - Number(all[b]); });
  for (var i = 0; i < done.length - MAX_REMEMBERED; i++) props.deleteProperty(done[i]);
}
