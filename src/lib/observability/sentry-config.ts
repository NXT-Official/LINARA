/**
 * Everything about Sentry that can be decided without Sentry: when it's on,
 * what each deploy is called, and what has to be taken out of an error, log,
 * breadcrumb or span before it leaves. No Sentry import here, so
 * vite.config.ts can read the build rules and the tests run in plain Node.
 */

/** linara-web in the naax-linara org. A DSN is public by design. */
export const LINARA_WEB_DSN =
  "https://53f092679e0f92f60403893d6a97fa4e@o4512240981311488.ingest.us.sentry.io/4512241040031744";

export type SentryBuildConfig = { dsn: string; environment: string; release: string };

/**
 * What vite.config.ts bakes into the bundles. Reporting is on only in a
 * Vercel build or with an explicit SENTRY_DSN, so a developer's machine, CI
 * and the test run never report (Mila's dev server and test suite both
 * filled its Sentry with noise). SENTRY_DSN=off turns a Vercel build off.
 */
export function resolveSentryBuildConfig(
  env: Record<string, string | undefined>,
  mode: string,
): SentryBuildConfig {
  const dsn =
    env.SENTRY_DSN === "off" ? "" : env.SENTRY_DSN || (env.VERCEL === "1" ? LINARA_WEB_DSN : "");
  const ref = env.VERCEL_GIT_COMMIT_REF;
  const environment =
    env.SENTRY_ENVIRONMENT || (ref === "main" ? "production" : ref ? ref.toLowerCase() : mode);
  return { dsn, environment, release: env.VERCEL_GIT_COMMIT_SHA || "" };
}

/** What a removed value is replaced with (Sentry's own marker). */
export const FILTERED = "[Filtered]";

// Longer strings are cut before scrubbing: a few of the patterns below take
// time that grows with the square of the length (50,000 characters took 2s,
// inside the SDK on the page's main thread).
const MAX_SCRUBBED_LENGTH = 2_000;

/**
 * The text up to the limit. A cut inside a word drops the whole word: half
 * an email, phone number or token no longer matches its mask, so its first
 * half would go out as it is ("maria.sant…"). Same cut as the mobile app
 * and the Studio.
 */
function cutForScrubbing(text: string): string {
  if (text.length <= MAX_SCRUBBED_LENGTH) return text;
  let end = MAX_SCRUBBED_LENGTH;
  if (!/\s/.test(text.charAt(end))) {
    while (end > 0 && !/\s/.test(text.charAt(end - 1))) end -= 1;
  }
  return `${text.slice(0, end)}…`;
}

/**
 * The app's own search params (validateSearch in src/routes): which tab,
 * view, day or sign-up step is open. Every other value goes, so a token,
 * an id or a Supabase filter can't leak by being missing from a denylist.
 */
const READABLE_PARAMS: ReadonlySet<string> = new Set([
  "day",
  "for",
  "mode",
  "sent",
  "step",
  "tab",
  "view",
]);
const PLAIN_VALUE = /^[A-Za-z0-9_-]{1,32}$/;
const PLAIN_KEY = /^[A-Za-z0-9_.[\]-]{1,64}$/;
const EMAIL = /[A-Za-z0-9._%+-]+(?:@|%40)[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
// scheme://authority, the rest of the address after it.
const ABSOLUTE_URL = /^([a-z][a-z0-9+.-]*:\/\/)([^/?#]*)(.*)$/i;

function readableValue(raw: string): boolean {
  try {
    return PLAIN_VALUE.test(decodeURIComponent(raw.replace(/\+/g, " ")));
  } catch {
    return false;
  }
}

function scrubQuery(query: string): string {
  const pairs: string[] = [];
  for (const pair of query.split("&")) {
    if (pair === "") continue;
    const eq = pair.indexOf("=");
    const rawKey = eq === -1 ? pair : pair.slice(0, eq);
    const key = PLAIN_KEY.test(rawKey) ? rawKey : FILTERED;
    if (eq === -1) {
      pairs.push(key);
      continue;
    }
    const value = pair.slice(eq + 1);
    const keep = READABLE_PARAMS.has(key) && readableValue(value);
    pairs.push(`${key}=${keep ? value : FILTERED}`);
  }
  return pairs.length > 0 ? `?${pairs.join("&")}` : "";
}

function scrubAddress(url: string): string {
  const hashAt = url.indexOf("#");
  const withoutFragment = hashAt === -1 ? url : url.slice(0, hashAt);
  const queryAt = withoutFragment.indexOf("?");
  let head = queryAt === -1 ? withoutFragment : withoutFragment.slice(0, queryAt);
  const query = queryAt === -1 ? "" : scrubQuery(withoutFragment.slice(queryAt + 1));

  const absolute = ABSOLUTE_URL.exec(head);
  if (absolute) {
    const [, scheme = "", authority = "", path = ""] = absolute;
    // user:password@host -- only the host stays.
    head = `${scheme}${authority.slice(authority.lastIndexOf("@") + 1)}${path.replace(EMAIL, "[email]")}`;
  } else {
    head = head.replace(EMAIL, "[email]");
  }
  return `${head}${query}`;
}

/**
 * An address as it may be sent: no fragment (a password-recovery link
 * carries `#access_token=` there), no credentials, every query key kept but
 * every value filtered except the app's own few plain ones. Works on full
 * and relative addresses, and never throws.
 */
export function scrubUrl(url: string): string {
  try {
    return scrubAddress(cutForScrubbing(url));
  } catch {
    return FILTERED;
  }
}

const URL_IN_TEXT = /\b[a-z][a-z0-9+.-]*:\/\/[^\s"'<>)\]]+/gi;
const JWT = /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*/g;
const BEARER = /(Bearer\s+)[A-Za-z0-9._~+/=-]+/gi;
// Philippine mobile numbers: 09XX XXX XXXX, or 63 9XX... after a "+".
const PH_MOBILE = /\b(?:63|0)9\d{2}[\s-]?\d{3}[\s-]?\d{4}\b/g;
// A helper's device push token, which push.ts can log back from Expo.
const EXPO_PUSH_TOKEN = /(Expo(?:nent)?PushToken\[)[^\]]*\]/g;

// An element as Sentry names it in a click breadcrumb or a web-vital span
// (INP, LCP, CLS): a label like "Remove Carmen Ortiz" or an avatar's alt
// text is a person's name.
const ELEMENT_TEXT = /\[(aria-label|alt|title|name)="[^"]*"\]/g;
// A double-quoted value in an error message. Postgres quotes both names
// (relation "helpers") and values (invalid input syntax for type uuid:
// "Lorna Bautista"); a name is letters, digits, "_" and "." up to 63.
const QUOTED = /"([^"\n]*)"/g;
const IDENTIFIER = /^[A-Za-z0-9_.]{1,63}$/;

/** Free text (an error or log message) with addresses scrubbed and contact details and tokens masked. */
export function scrubText(text: string): string {
  return cutForScrubbing(text)
    .replace(ELEMENT_TEXT, "[$1]")
    .replace(URL_IN_TEXT, (url) => scrubUrl(url))
    .replace(JWT, "[token]")
    .replace(BEARER, "$1[token]")
    .replace(EXPO_PUSH_TOKEN, "$1token]")
    .replace(EMAIL, "[email]")
    .replace(PH_MOBILE, "[phone]")
    .replace(QUOTED, (quoted, inner: string) =>
      inner === "" || IDENTIFIER.test(inner) ? quoted : `"${FILTERED}"`,
    );
}

// Written at sign-in and cleared at sign-out by use-session.ts; the mobile
// app's WebView reads the same key (AGENTS.md), so it doesn't move. The
// household id isn't used: a login that ends in needs_bootstrap leaves the
// previous account's behind, so it can name the wrong household.
const USER_ID_KEY = "linara_manager_user_id";

/** Who is signed in, by opaque id only. */
export type Identity = { id: string | null };

/**
 * The signed-in manager, read when something is sent rather than kept on
 * Sentry's scope, so a sign-in or sign-out never has to tell Sentry. Never
 * throws: a browser that refuses storage just means nobody.
 */
export function userFromStorage(storage: Pick<Storage, "getItem"> | null | undefined): Identity {
  try {
    const id = storage?.getItem(USER_ID_KEY)?.trim();
    return { id: id ? id : null };
  } catch {
    return { id: null };
  }
}

export type Surface = "web" | "mobile-webview";

/**
 * Inside LINARA_MOBILE's WebView (app/manager.tsx) the user agent carries
 * "LinaraApp" -- the same test the app's own inMobileApp() makes.
 */
export function surfaceFor(userAgent: string | undefined): Surface {
  return userAgent?.includes("LinaraApp") ? "mobile-webview" : "web";
}

/**
 * Sentry's `dataCollection` with every category about people turned off.
 * Unset, v11 collects all of them: IP-based user info, cookies, headers,
 * request and response bodies, query strings and local variables.
 * `frameContextLines` (our own source around a stack frame) keeps its default.
 * src: https://docs.sentry.io/platforms/javascript/guides/tanstackstart-react/migration/v10-to-v11/ · 11.6.0 · 2026-10-12
 */
export const COLLECT_NO_PERSONAL_DATA = {
  userInfo: false,
  cookies: false,
  httpHeaders: false,
  httpBodies: [],
  urlQueryParams: false,
  graphQL: { document: false, variables: false },
  genAI: { inputs: false, outputs: false },
  databaseQueryData: false,
  queues: false,
  stackFrameVariables: false,
};

// The shapes below are the parts of Sentry's event, breadcrumb, span and log
// that get scrubbed; Sentry's own types fit them, so this file needs no
// Sentry import. Each scrubber changes what it's given, as Sentry's hooks do.

export type BreadcrumbLike = {
  category?: string;
  message?: string;
  data?: Record<string, unknown>;
};

export type EventLike = {
  message?: string;
  transaction?: string;
  request?: {
    url?: string;
    query_string?: unknown;
    headers?: unknown;
    cookies?: unknown;
    data?: unknown;
    env?: unknown;
  };
  exception?: { values?: Array<{ value?: string }> };
  breadcrumbs?: BreadcrumbLike[];
  extra?: unknown;
  user?: { id?: string | number };
  tags?: Record<string, unknown>;
};

export type SpanLike = {
  name?: string;
  attributes?: Record<string, unknown>;
  links?: unknown;
};

export type LogLike = { message?: unknown; attributes?: Record<string, unknown> };

/** A string that is itself an address (or part of one) rather than prose. */
function scrubString(value: string): string {
  return /^[/?#]/.test(value) ? scrubUrl(value) : scrubText(value);
}

const MAX_DEPTH = 5;

function scrubValue(value: unknown, depth: number): unknown {
  if (typeof value === "string") return scrubString(value);
  if (typeof value !== "object" || value === null) return value;
  // Past the limit nothing unscrubbed goes through.
  if (depth >= MAX_DEPTH) return FILTERED;
  if (Array.isArray(value)) return value.map((item) => scrubValue(item, depth + 1));
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, scrubValue(item, depth + 1)]),
  );
}

const ADDRESS_KEYS = new Set(["url", "from", "to"]);

/**
 * Something logged to the console, as it may be sent: an error-shaped value
 * (anything with a string `message`, Supabase's errors included) as its
 * name and message only, anything else as "{}". An object's other fields,
 * like a Postgres error's `details` ("Failing row contains (Maria Santos,
 * 34-1234567-8, ...)"), names and ID numbers that no pattern can spot.
 */
function describeLogged(value: unknown): string {
  const parsed = typeof value === "string" && /^[{[]/.test(value) ? parseJson(value) : value;
  if (typeof parsed !== "object" || parsed === null || !("message" in parsed)) return "{}";
  const { message } = parsed;
  if (typeof message !== "string") return "{}";
  const name = "name" in parsed && typeof parsed.name === "string" ? `${parsed.name}: ` : "";
  return `${name}${scrubText(message)}`;
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

// console.log's substitutions. With one in the first argument Sentry makes
// no template and the line is every argument joined, values included.
// src: https://unpkg.com/@sentry/core@11.6.0/build/esm/logs/utils.js · 11.6.0 · 2026-10-12
const PRINTF_TOKEN = /%[sdifocO]/;

/** "Insert failed: %o" and its values as "Insert failed: {}". */
function textBeforeToken(text: string, at: number): string {
  return [scrubText(text.slice(0, at)).trimEnd(), "{}"].filter(Boolean).join(" ");
}

/**
 * A console call's arguments as one line: the first, when it's text the app
 * wrote, scrubbed; every value after it through describeLogged. A string
 * after the first is a value too ("Failed for", name) and becomes "{}".
 */
function consoleLine(args: readonly unknown[]): string {
  const [first, ...rest] = args;
  if (typeof first === "string") {
    const token = PRINTF_TOKEN.exec(first);
    if (token) return textBeforeToken(first, token.index);
  }
  const head = typeof first === "string" ? scrubText(first) : describeLogged(first);
  return [head, ...rest.map(describeLogged)].join(" ");
}

export function scrubBreadcrumb(crumb: BreadcrumbLike): void {
  const logged = crumb.category === "console" ? crumb.data?.arguments : undefined;
  if (Array.isArray(logged)) {
    // Rebuilt from what was logged; the values themselves never go.
    crumb.message = consoleLine(logged);
    delete crumb.data?.arguments;
  } else if (typeof crumb.message === "string") {
    crumb.message = scrubText(crumb.message);
  }
  if (!crumb.data) return;
  for (const [key, value] of Object.entries(crumb.data)) {
    crumb.data[key] =
      ADDRESS_KEYS.has(key) && typeof value === "string" ? scrubUrl(value) : scrubValue(value, 0);
  }
}

export function scrubEvent(event: EventLike): void {
  if (event.request) {
    if (typeof event.request.url === "string") event.request.url = scrubUrl(event.request.url);
    delete event.request.query_string;
    delete event.request.headers;
    delete event.request.cookies;
    delete event.request.data;
    delete event.request.env;
  }
  if (typeof event.message === "string") event.message = scrubText(event.message);
  if (typeof event.transaction === "string") event.transaction = scrubUrl(event.transaction);
  for (const exception of event.exception?.values ?? []) {
    if (typeof exception.value === "string") exception.value = scrubText(exception.value);
  }
  event.breadcrumbs?.forEach(scrubBreadcrumb);
  // A thrown plain object lands here whole (extra.__serialized__).
  delete event.extra;
  if (event.user) event.user = event.user.id != null ? { id: event.user.id } : undefined;
}

const HEADER_ATTRIBUTE = /^http\.(request|response)\.header\./;

// A fetch span's fragment arrives without its "#", so nothing would know
// to drop it; its query arrives without its "?".
const FRAGMENT_ATTRIBUTES = new Set(["url.fragment", "http.fragment"]);
const QUERY_ATTRIBUTES = new Set(["url.query", "http.query"]);

function scrubQueryAttribute(value: unknown): unknown {
  if (typeof value !== "string") return FILTERED;
  const query = scrubUrl(value.startsWith("?") ? value : `?${value}`);
  return value.startsWith("?") ? query : query.slice(1);
}

function scrubAttributes(attributes: Record<string, unknown>): void {
  for (const [key, value] of Object.entries(attributes)) {
    if (HEADER_ATTRIBUTE.test(key) || FRAGMENT_ATTRIBUTES.has(key)) {
      delete attributes[key];
      continue;
    }
    const scrub = QUERY_ATTRIBUTES.has(key)
      ? scrubQueryAttribute
      : (raw: unknown) => scrubValue(raw, 0);
    // Sentry's typed form is { value, unit? }.
    attributes[key] =
      typeof value === "object" && value !== null && "value" in value
        ? { ...value, value: scrub(value.value) }
        : scrub(value);
  }
}

export function scrubSpan(span: SpanLike): void {
  if (typeof span.name === "string") span.name = scrubText(span.name);
  if (span.attributes) scrubAttributes(span.attributes);
}

/** An attribute's value, whether raw or in Sentry's typed { value } form. */
function attributeValue(attribute: unknown): unknown {
  return typeof attribute === "object" && attribute !== null && "value" in attribute
    ? attribute.value
    : attribute;
}

const PARAMETER_PREFIX = "sentry.message.parameter.";

/** Of a console log's attributes, only Sentry's own, ours, and the user id. */
function keptFromConsole(key: string): boolean {
  return (
    (key.startsWith("sentry.") && !key.startsWith(PARAMETER_PREFIX)) ||
    key.startsWith("linara.") ||
    key === "user.id"
  );
}

/**
 * A console log's line, rebuilt from the template (the app's own text plus
 * a "{}" per value) and never from the values Sentry stringified into it.
 * src: https://unpkg.com/@sentry/core@11.6.0/build/esm/logs/console-integration.js · 11.6.0 · 2026-10-12
 */
function consoleLogLine(message: unknown, attributes: Record<string, unknown>): string {
  const parameters: unknown[] = [];
  while (`${PARAMETER_PREFIX}${parameters.length}` in attributes) {
    parameters.push(attributeValue(attributes[`${PARAMETER_PREFIX}${parameters.length}`]));
  }
  const template = attributeValue(attributes["sentry.message.template"]);
  if (typeof template === "string") {
    const placeholders = " {}".repeat(parameters.length);
    const text =
      parameters.length > 0 && template.endsWith(placeholders)
        ? template.slice(0, -placeholders.length)
        : template;
    return consoleLine([text, ...parameters]);
  }
  // No template: one line of text, or a value logged first (an error, or an
  // object whose keys Sentry copied into the attributes). An object always
  // starts the line with "{"; the app's own lines often start "[useX]".
  const line = String(message);
  const parsed = /^[{[]/.test(line) ? parseJson(line) : undefined;
  if (parsed !== undefined) return describeLogged(parsed);
  if (line.startsWith("{")) return "{}";
  const token = PRINTF_TOKEN.exec(line);
  return token ? textBeforeToken(line, token.index) : scrubText(line);
}

export function scrubLog(log: LogLike): void {
  const attributes = log.attributes ?? {};
  if (attributeValue(attributes["sentry.origin"]) === "auto.log.console") {
    log.message = consoleLogLine(log.message, attributes);
    log.attributes = Object.fromEntries(
      Object.entries(attributes).filter(([key]) => keptFromConsole(key)),
    );
  } else if (typeof log.message === "string") {
    log.message = scrubText(log.message);
  }
  if (log.attributes) scrubAttributes(log.attributes);
}

/** The signed-in manager (id only) on an error, and the surface as a tag. */
export function tagEvent(
  event: Pick<EventLike, "user" | "tags">,
  identity: Identity,
  surface: Surface,
): void {
  event.user = identity.id ? { id: identity.id } : undefined;
  event.tags = {
    ...event.tags,
    "linara.surface": surface,
  };
}

/** The same, as attributes on a log or span (searchable as `user.id:<id>`). */
export function tagAttributes(
  item: { attributes?: Record<string, unknown> },
  identity: Identity,
  surface: Surface,
): void {
  item.attributes = {
    ...item.attributes,
    ...(identity.id ? { "user.id": identity.id } : {}),
    "linara.surface": surface,
  };
}

/** Who to put on what's sent, read at the moment it's sent. */
export type Tagging = () => { identity: Identity; surface: Surface };

/** A span with nothing in it but its timing: what goes when one can't be scrubbed. */
function blankSpan<S extends SpanLike>(span: S): S {
  return Object.assign({}, span, { name: FILTERED, attributes: {}, links: undefined });
}

/**
 * Sentry's four send hooks, scrubbing and (in the browser) tagging. Each
 * fails closed. A throw would otherwise send worse than nothing: Sentry
 * reports a throwing beforeSend with the raw page address (#access_token=
 * and all), and sends a span unmodified when beforeSendSpan throws. A span
 * can't be dropped from here, so it goes out blank instead.
 * src: https://unpkg.com/@sentry/core@11.6.0/build/esm/tracing/spans/beforeSendSpan.js · 11.6.0 · 2026-10-12
 */
export function sendHooks(tagging?: Tagging) {
  return {
    beforeSend<E extends EventLike>(event: E): E | null {
      try {
        scrubEvent(event);
        if (tagging) {
          const { identity, surface } = tagging();
          tagEvent(event, identity, surface);
        }
        return event;
      } catch {
        return null;
      }
    },
    // Spans stream by default in v11, which skips beforeSendTransaction.
    // src: https://docs.sentry.io/platforms/javascript/guides/tanstackstart-react/migration/v10-to-v11/ · 11.6.0 · 2026-10-12
    beforeSendSpan<S extends SpanLike>(span: S): S {
      try {
        scrubSpan(span);
        if (tagging) {
          const { identity, surface } = tagging();
          tagAttributes(span, identity, surface);
        }
        return span;
      } catch {
        return blankSpan(span);
      }
    },
    beforeSendLog<L extends LogLike>(log: L): L | null {
      try {
        scrubLog(log);
        if (tagging) {
          const { identity, surface } = tagging();
          tagAttributes(log, identity, surface);
        }
        return log;
      } catch {
        return null;
      }
    },
    beforeBreadcrumb<B extends BreadcrumbLike>(breadcrumb: B): B | null {
      try {
        scrubBreadcrumb(breadcrumb);
        return breadcrumb;
      } catch {
        return null;
      }
    },
  };
}
