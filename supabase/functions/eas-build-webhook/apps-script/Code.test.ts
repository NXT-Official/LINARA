import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { beforeEach, describe, expect, it } from "vitest";

// Runs the real Code.gs against a fake of the team's build Doc (header, a MILA
// table, a LINARA table, both with a Mobile row). Only the Google services it
// calls (PropertiesService, DocumentApp, LockService) are faked.
const source = readFileSync(path.join(import.meta.dirname, "Code.gs"), "utf8");

type Fn = (...args: unknown[]) => unknown;
function loadScript(): Record<string, Fn> {
  const ctx: Record<string, unknown> = {};
  vm.runInNewContext(source, ctx);
  return ctx as Record<string, Fn>;
}

const ATTR = {
  LINK_URL: "LINK_URL",
  FONT_SIZE: "FONT_SIZE",
  FONT_FAMILY: "FONT_FAMILY",
  BOLD: "BOLD",
};
type Attrs = Record<string, unknown>;

// One run of text with whole-range styling: enough to see what Code.gs set.
class FakeText {
  attrs: Attrs = {};
  link: string | null = null;
  linkRange: [number, number] | null = null;
  color: string | null = null;
  underline: boolean | null = null;
  constructor(
    public text: string,
    attrs: Attrs = {},
  ) {
    this.attrs = { ...attrs };
  }
  private check(start: number, end: number) {
    // Apps Script throws for an offset past the last character.
    if (start < 0 || end >= this.text.length || start > end) {
      throw new Error(`Index (${end}) must be less than the content length (${this.text.length}).`);
    }
  }
  getText() {
    return this.text;
  }
  setText(t: string) {
    this.text = t;
  }
  getAttributes(offset: number) {
    if (offset >= this.text.length) throw new Error("offset out of range");
    return { ...this.attrs, [ATTR.LINK_URL]: this.link };
  }
  setAttributes(start: number, end: number, a: Attrs) {
    this.check(start, end);
    for (const [k, v] of Object.entries(a)) if (v !== null) this.attrs[k] = v;
  }
  setLinkUrl(start: number, end: number, url: string | null) {
    this.check(start, end);
    this.link = url;
    this.linkRange = url ? [start, end] : null;
  }
  setForegroundColor(start: number, end: number, c: string) {
    this.check(start, end);
    this.color = c;
  }
  setUnderline(start: number, end: number, u: boolean) {
    this.check(start, end);
    this.underline = u;
  }
}

class FakeParagraph {
  parent: FakeCell | FakeBody | null = null;
  t: FakeText;
  constructor(text: string, attrs: Attrs = {}) {
    this.t = new FakeText(text, attrs);
  }
  getType() {
    return "PARAGRAPH";
  }
  asParagraph() {
    return this;
  }
  getText() {
    return this.t.text;
  }
  editAsText() {
    return this.t;
  }
  removeFromParent() {
    const kids = this.parent!.children;
    kids.splice(kids.indexOf(this), 1);
  }
}

class FakeCell {
  children: FakeParagraph[];
  constructor(lines: string[], attrs: Attrs) {
    this.children = lines.map((l) => {
      const p = new FakeParagraph(l, attrs);
      p.parent = this;
      return p;
    });
  }
  getNumChildren() {
    return this.children.length;
  }
  getChild(i: number) {
    return this.children[i];
  }
  getText() {
    return this.children.map((c) => c.getText()).join("\n");
  }
}

class FakeTable {
  rows: FakeCell[][];
  constructor(rows: (string | string[])[][], attrs: Attrs) {
    this.rows = rows.map((r) => r.map((c) => new FakeCell(Array.isArray(c) ? c : [c], attrs)));
  }
  getType() {
    return "TABLE";
  }
  asTable() {
    return this;
  }
  getNumRows() {
    return this.rows.length;
  }
  getRow(i: number) {
    const cells = this.rows[i];
    return { getNumCells: () => cells.length, getCell: (j: number) => cells[j] };
  }
  cell(r: number, c: number) {
    return this.rows[r][c];
  }
}

class FakeBody {
  constructor(public children: (FakeParagraph | FakeTable)[]) {}
  getNumChildren() {
    return this.children.length;
  }
  getChild(i: number) {
    return this.children[i];
  }
}

const SMALL = { [ATTR.FONT_SIZE]: 8, [ATTR.FONT_FAMILY]: "Arial" };
const HEADER = ["Type", "Link", "Notes", "Date Updated"];
const OLD_MOBILE =
  "https://expo.dev/accounts/naaxtechs-team/projects/linara-mobile/builds/687022cf";

function teamDoc() {
  const mila = new FakeTable(
    [
      ["Type", "Link", "Notes", "Date Updated (Keep first and last entries)"],
      [
        "Web App, Landing Page",
        "https://mila-umber.vercel.app/dashboard",
        "(Web app + first page)",
        "10/5/2026",
      ],
      [
        "Mobile",
        "https://expo.dev/accounts/naaxtechs-team/projects/mila-mobile/builds/aa8ac428",
        "",
        "10/5/2026",
      ],
    ],
    SMALL,
  );
  const linara = new FakeTable(
    [
      HEADER,
      [
        "Web App, Landing Page",
        ["https://linara-delta.vercel.app/", "https://linara-git-staging.vercel.app/"],
        "(Web app)",
        "11/3/2026",
      ],
      ["Admin", "https://linara-admin-git-staging.vercel.app/", "", "11/3/2026"],
      ["Mobile", OLD_MOBILE, "", "10/5/2026"],
      ["Sanity CMS", "https://linara-studio.sanity.studio", "Version 0.1", "10/5/2026"],
    ],
    SMALL,
  );
  const body = new FakeBody([
    new FakeParagraph("NAAX TECHNOLOGIES CORP."),
    new FakeParagraph("LATEST BUILD AND URL LIST"),
    new FakeParagraph("PROJECTS: MILA, LINARA"),
    new FakeParagraph("MILA"),
    mila,
    new FakeParagraph(""),
    new FakeParagraph("LINARA"),
    linara,
  ]);
  body.children.forEach((c) => {
    if (c instanceof FakeParagraph) c.parent = body;
  });
  return { body, mila, linara };
}

class FakeDoc {
  saves = 0;
  constructor(public body: FakeBody) {}
  getBody() {
    return this.body;
  }
  saveAndClose() {
    this.saves++;
  }
}

class FakeProps {
  store = new Map<string, string>();
  getProperty(k: string) {
    return this.store.has(k) ? this.store.get(k)! : null;
  }
  setProperty(k: string, v: string) {
    this.store.set(k, v);
  }
  deleteProperty(k: string) {
    this.store.delete(k);
  }
  getProperties() {
    return Object.fromEntries(this.store);
  }
}

const DETAILS = "https://expo.dev/accounts/naaxtechs-team/projects/linara-mobile/builds/147a3212";
const BUILD = {
  id: "147a3212-49fd-446f-b4e3-a6519acf264a",
  platform: "android",
  status: "finished",
  profile: "preview",
  appVersion: "1.0.2",
  appBuildVersion: "12",
  gitCommitHash: "564b61ebdd403d28b5dc616a12ce160b91585b5b",
  gitCommitMessage: "Add home screen\n\nlonger body",
  detailsUrl: DETAILS,
  buildUrl: "https://expo.dev/artifacts/eas/abc.apk",
  errorMessage: "",
  completedAt: "2026-11-04T06:15:00.000Z",
};
const NOTES = "Preview · Android · v1.0.2 (12) · 564b61e Add home screen";

let script: Record<string, Fn>;
let props: FakeProps;
let doc: FakeDoc;
let tables: { mila: FakeTable; linara: FakeTable };
let lock: { held: boolean; acquirable: boolean; tryLock: Fn; releaseLock: Fn };
let deps: Record<string, unknown>;

type Result = {
  ok: boolean;
  duplicate?: boolean;
  updated?: boolean;
  skipped?: string;
  error?: string;
};
const call = (body: unknown) =>
  script.handleBuildPost_(
    { postData: { contents: typeof body === "string" ? body : JSON.stringify(body) } },
    deps,
  ) as Result;
const send = (build: Record<string, unknown>) => call({ token: "apps-token", build });

// The LINARA Mobile row: [type, link, notes, date].
const mobileRow = () => tables.linara.rows[3];
const snapshot = (t: FakeTable) =>
  JSON.stringify(
    t.rows.map((r) => r.map((c) => c.children.map((p) => [p.t.text, p.t.link, p.t.attrs]))),
  );

beforeEach(() => {
  script = loadScript();
  props = new FakeProps();
  props.setProperty("TOKEN", "apps-token");
  props.setProperty("DOC_ID", "doc-1");
  const d = teamDoc();
  doc = new FakeDoc(d.body);
  tables = { mila: d.mila, linara: d.linara };
  lock = {
    held: false,
    acquirable: true,
    tryLock() {
      if (!lock.acquirable) return false;
      lock.held = true;
      return true;
    },
    releaseLock() {
      lock.held = false;
    },
  };
  deps = {
    props,
    openDoc: (id: string) => {
      if (id !== "doc-1") throw new Error("No item with the given ID could be found.");
      return doc;
    },
    lock,
    formatDate: (dt: Date) => `${dt.getUTCMonth() + 1}/${dt.getUTCDate()}/${dt.getUTCFullYear()}`,
    now: () => new Date("2026-12-25T00:00:00.000Z"),
    attribute: ATTR,
  };
});

describe("Code.gs: who may write", () => {
  it.each([
    ["no postData", undefined],
    ["empty body", ""],
    ["not JSON", "{oops"],
    ["JSON null", "null"],
  ])("rejects %s", (_n, body) => {
    const before = snapshot(tables.linara);
    const res = body === undefined ? (script.handleBuildPost_({}, deps) as Result) : call(body);
    expect(res.ok).toBe(false);
    expect(snapshot(tables.linara)).toBe(before);
  });

  it.each([
    ["missing token", { build: BUILD }],
    ["wrong token", { token: "nope", build: BUILD }],
    ["token one char off", { token: "apps-tokem", build: BUILD }],
    ["token as a number", { token: 123, build: BUILD }],
    ["token prefix", { token: "apps", build: BUILD }],
  ])("rejects %s", (_n, body) => {
    const before = snapshot(tables.linara);
    expect(call(body)).toEqual({ ok: false, error: "Unauthorized" });
    expect(snapshot(tables.linara)).toBe(before);
  });

  it("rejects everyone, even an empty token, when TOKEN is not set", () => {
    props.deleteProperty("TOKEN");
    expect(call({ token: "", build: BUILD }).ok).toBe(false);
    props.setProperty("TOKEN", "");
    expect(call({ token: "", build: BUILD }).ok).toBe(false);
    expect(mobileRow()[1].getText()).toBe(OLD_MOBILE);
  });

  it.each([
    ["no build", { token: "apps-token" }],
    ["no id", { token: "apps-token", build: { ...BUILD, id: undefined } }],
    ["bad id", { token: "apps-token", build: { ...BUILD, id: "../../etc" } }],
  ])("rejects %s", (_n, body) => {
    expect(call(body).ok).toBe(false);
    expect(mobileRow()[1].getText()).toBe(OLD_MOBILE);
  });

  it("reports an unset DOC_ID", () => {
    props.deleteProperty("DOC_ID");
    expect(send(BUILD)).toEqual({ ok: false, error: "DOC_ID is not set" });
  });
});

describe("Code.gs: updating the LINARA Mobile row", () => {
  it("replaces Link, Notes and Date, and nothing else in the Doc", () => {
    const milaBefore = snapshot(tables.mila);
    const otherRowsBefore = JSON.stringify(
      [1, 2, 4].map((r) => tables.linara.rows[r].map((c) => c.getText())),
    );

    expect(send(BUILD)).toEqual({ ok: true, duplicate: false, updated: true });

    const [type, link, notes, date] = mobileRow();
    expect(type.getText()).toBe("Mobile");
    expect(link.getText()).toBe(DETAILS);
    expect(notes.getText()).toBe(NOTES);
    expect(date.getText()).toBe("11/4/2026");
    expect(snapshot(tables.mila)).toBe(milaBefore);
    expect(
      JSON.stringify([1, 2, 4].map((r) => tables.linara.rows[r].map((c) => c.getText()))),
    ).toBe(otherRowsBefore);
    expect(doc.saves).toBe(1);
  });

  it("links the whole URL, styled as a link, in the table's font", () => {
    send(BUILD);
    const t = mobileRow()[1].children[0].t;
    expect(t.link).toBe(DETAILS);
    expect(t.linkRange).toEqual([0, DETAILS.length - 1]);
    expect(t.color).toBe("#1155cc");
    expect(t.underline).toBe(true);
    expect(t.attrs[ATTR.FONT_SIZE]).toBe(8);
  });

  it("an empty Notes cell gets the row's font, not the Doc default, and no link", () => {
    mobileRow()[2].children[0].t = new FakeText("", {});
    send(BUILD);
    const t = mobileRow()[2].children[0].t;
    expect(t.text).toBe(NOTES);
    expect(t.attrs[ATTR.FONT_SIZE]).toBe(8);
    expect(t.link).toBeNull();
  });

  it("a Notes cell that held a link loses it", () => {
    mobileRow()[2].children[0].t.link = "https://old.example";
    send(BUILD);
    expect(mobileRow()[2].children[0].t.link).toBeNull();
  });

  it("collapses a multi-line Link cell to the one new link", () => {
    const cell = mobileRow()[1];
    const extra = new FakeParagraph("https://second-line.example");
    extra.parent = cell;
    cell.children.push(extra);
    send(BUILD);
    expect(cell.children).toHaveLength(1);
    expect(cell.getText()).toBe(DETAILS);
  });

  it("the next build replaces the previous one", () => {
    send(BUILD);
    const next = {
      ...BUILD,
      id: "247a3212-49fd-446f-b4e3-a6519acf264a",
      appBuildVersion: "13",
      detailsUrl: DETAILS + "-next",
      completedAt: "2026-11-05T01:00:00.000Z",
    };
    expect(send(next).updated).toBe(true);
    expect(mobileRow()[1].getText()).toBe(DETAILS + "-next");
    expect(mobileRow()[2].getText()).toContain("v1.0.2 (13)");
    expect(mobileRow()[3].getText()).toBe("11/5/2026");
  });

  it("finds the row and columns by text: case, spacing, and column order", () => {
    tables.linara.rows[0] = ["Type", "Date Updated", "Notes", "Link"].map(
      (h) => new FakeCell([h], SMALL),
    );
    mobileRow()[0].children[0].t.text = "  mobile ";
    send(BUILD);
    const [, date, notes, link] = mobileRow();
    expect(link.getText()).toBe(DETAILS);
    expect(notes.getText()).toBe(NOTES);
    expect(date.getText()).toBe("11/4/2026");
  });

  it("SECTION and ROW properties point it at another table", () => {
    props.setProperty("SECTION", "MILA");
    send(BUILD);
    expect(tables.mila.rows[2][1].getText()).toBe(DETAILS);
    expect(mobileRow()[1].getText()).toBe(OLD_MOBILE);
  });

  it("uses today when completedAt is missing or not a date", () => {
    expect(send({ ...BUILD, completedAt: "soon" }).updated).toBe(true);
    expect(mobileRow()[3].getText()).toBe("12/25/2026");
  });

  it("survives wrong-typed fields", () => {
    expect(
      send({ id: BUILD.id, status: "finished", detailsUrl: DETAILS, appVersion: 5 }).updated,
    ).toBe(true);
    expect(mobileRow()[2].getText()).toBe("Build · Unknown platform · v?");
  });
});

describe("Code.gs: builds that must not change the row", () => {
  it.each(["errored", "canceled", "in-progress", ""])(
    "a %s build keeps the last working link",
    (status) => {
      const before = snapshot(tables.linara);
      expect(send({ ...BUILD, status, detailsUrl: DETAILS })).toEqual({
        ok: true,
        duplicate: false,
        skipped: "status",
      });
      expect(snapshot(tables.linara)).toBe(before);
    },
  );

  it.each(["javascript:alert(1)", "https://expo.dev.evil.example/x", ""])(
    "a build whose link is not Expo's (%s) is skipped, never written",
    (detailsUrl) => {
      const before = snapshot(tables.linara);
      expect(send({ ...BUILD, detailsUrl }).skipped).toBe("status");
      expect(snapshot(tables.linara)).toBe(before);
    },
  );

  it("a late retry of an older build does not overwrite a newer one", () => {
    const newer = {
      ...BUILD,
      id: "247a3212-49fd-446f-b4e3-a6519acf264a",
      detailsUrl: DETAILS + "-new",
      completedAt: "2026-11-05T00:00:00.000Z",
    };
    send(newer);
    expect(send(BUILD)).toEqual({ ok: true, duplicate: false, skipped: "older" });
    expect(mobileRow()[1].getText()).toBe(DETAILS + "-new");
  });
});

describe("Code.gs: a Doc that doesn't look as expected", () => {
  const expectFailedAndRetryable = (res: Result, msg: RegExp) => {
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(msg);
    expect(lock.held).toBe(false);
    // Not remembered, so EAS's retry writes it once the Doc is fixed.
    expect(props.getProperty("build:" + BUILD.id)).toBeNull();
  };

  it("no LINARA heading", () => {
    doc.body.children = doc.body.children.filter(
      (c) => !(c instanceof FakeParagraph && c.getText() === "LINARA"),
    );
    expectFailedAndRetryable(send(BUILD), /No table under a "LINARA" heading/);
  });

  it("does not take 'PROJECTS: MILA, LINARA' as the heading", () => {
    doc.body.children = doc.body.children.slice(0, 5);
    expectFailedAndRetryable(send(BUILD), /No table under a "LINARA" heading/);
    expect(tables.mila.rows[2][1].getText()).not.toBe(DETAILS);
  });

  it("a LINARA heading with no table after it", () => {
    doc.body.children = doc.body.children.slice(0, 7);
    expectFailedAndRetryable(send(BUILD), /No table/);
  });

  it("no Mobile row", () => {
    tables.linara.rows.splice(3, 1);
    expectFailedAndRetryable(send(BUILD), /No "Mobile" row/);
  });

  it("the header row is never taken as the Mobile row", () => {
    tables.linara.rows.splice(3, 1);
    tables.linara.rows[0][0] = new FakeCell(["Mobile"], SMALL);
    expectFailedAndRetryable(send(BUILD), /No "Mobile" row/);
  });

  it("a Mobile row with too few cells", () => {
    tables.linara.rows[3] = tables.linara.rows[3].slice(0, 2);
    expectFailedAndRetryable(send(BUILD), /too few columns/);
  });

  it("the Doc can't be opened", () => {
    props.setProperty("DOC_ID", "deleted-doc");
    expectFailedAndRetryable(send(BUILD), /No item/);
    props.setProperty("DOC_ID", "doc-1");
    expect(send(BUILD).updated).toBe(true);
  });
});

describe("Code.gs: retries and concurrency", () => {
  it("writes a build once when EAS delivers it twice", () => {
    expect(send(BUILD).updated).toBe(true);
    mobileRow()[2].children[0].t.text = "hand edit after the build";
    expect(send(BUILD)).toEqual({ ok: true, duplicate: true });
    expect(mobileRow()[2].getText()).toBe("hand edit after the build");
  });

  it("does not write when the lock is busy", () => {
    lock.acquirable = false;
    expect(send(BUILD)).toEqual({ ok: false, error: "Busy, try again" });
    expect(mobileRow()[1].getText()).toBe(OLD_MOBILE);
  });

  it("forgets the oldest ids past 300, keeping TOKEN, DOC_ID and the newest-build marker", () => {
    for (let i = 0; i < 305; i++) props.setProperty(`build:old-${i}`, String(1000 + i));
    send(BUILD);
    const done = [...props.store.keys()].filter((k) => k.startsWith("build:"));
    expect(done).toHaveLength(300);
    expect(props.getProperty("build:old-0")).toBeNull();
    expect(props.getProperty("build:" + BUILD.id)).not.toBeNull();
    expect(props.getProperty("TOKEN")).toBe("apps-token");
    expect(props.getProperty("DOC_ID")).toBe("doc-1");
    expect(props.getProperty("LAST_COMPLETED_AT")).toBe(String(Date.parse(BUILD.completedAt)));
  });
});
