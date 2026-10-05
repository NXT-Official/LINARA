/**
 * Landing-page content from the LINARA Sanity Studio (`landingPage` singleton).
 *
 * Pure module: no network, no React, no state of its own. `landing.actions.ts`
 * holds the one loader that fetches.
 * Editors control copy and section visibility. The wordmark, section order,
 * every link destination and the icon set stay in code, so published content
 * can never send a visitor off-site or inject markup (React escapes all text).
 */

export const LANDING_DOCUMENT_ID = "landingPage";
/** Bump when LANDING_FALLBACK changes; logged when the fallback is served. */
export const LANDING_FALLBACK_VERSION = "2026-10-04";

/** Code-owned icon set for the kitchen cards. Unknown values fall back per card. */
export const LANDING_ICONS = [
  "book-open",
  "clock",
  "receipt",
  "calendar",
  "wallet",
  "users",
  "shield-check",
  "sparkles",
] as const;
export type LandingIcon = (typeof LANDING_ICONS)[number];

export interface LandingSeo {
  title: string;
  description: string;
  socialDescription: string;
}
export interface LandingFeatureCard {
  _key: string;
  icon: LandingIcon;
  title: string;
  body: string;
}
export interface LandingLens {
  _key: string;
  title: string;
  body: string;
}
export interface LandingContent {
  seo: LandingSeo;
  header: { ctaLabel: string };
  hero: {
    kicker: string;
    headlineLine1: string;
    headlineLine2: string;
    description: string;
    ctaLabel: string;
  };
  kitchen: { hidden: boolean; heading: string; body: string; cards: LandingFeatureCard[] };
  lenses: { hidden: boolean; heading: string; body: string; items: LandingLens[] };
  account: {
    hidden: boolean;
    badge: string;
    heading: string;
    body: string;
    complianceTitle: string;
    complianceBody: string;
  };
  footer: { copyright: string; privacyLabel: string; termsLabel: string };
}

/**
 * The public page as it was before the CMS (LINARA src/routes/index.tsx,
 * nicoleDev 2026-10-04). With this content the page renders byte-identical
 * markup — pinned by landing-view.test.tsx against __fixtures__/landing.pre-cms.html.
 * Wage and statutory-contribution wording is unchanged and needs owner review
 * before any edit.
 *
 * This copy is in the client bundle, all of it, the compliance line included:
 * landing-loader.ts imports it so the homepage still renders offline in the
 * helper app's WebView (owner ruling, 2026-10-05; the live site on `main`
 * already serves the same text). Hiding a section in the Studio therefore
 * hides it on the Studio-driven page only. Withdrawing a claim everywhere
 * means changing it here.
 */
export const LANDING_FALLBACK: LandingContent = {
  seo: {
    title: "Linara — Home, made clear.",
    description:
      "Linara helps families and household helpers coordinate the day with calm, shared clarity.",
    socialDescription: "A calm, shared home management app for families and helpers.",
  },
  header: { ctaLabel: "Open Manager Pass" },
  hero: {
    kicker: "Home, made clear.",
    headlineLine1: "Clarity over control.",
    headlineLine2: "Dignity by design.",
    description:
      "An operating system for the Filipino household where a family and the people who help run it manage work, pay, and care together, on fair terms.",
    ctaLabel: "Start Household Pass",
  },
  kitchen: {
    hidden: false,
    heading: "A restaurant kitchen for the home",
    body: "We translate proven restaurant management structures into collaborative tools that eliminate friction, ambiguity, and overwork.",
    cards: [
      {
        _key: "standards",
        icon: "book-open",
        title: "House Standards (SOPs)",
        body: "Define standards once—like laundry instructions or child allergy guidelines. The operating manual stays in the home, ending continuous retraining.",
      },
      {
        _key: "after-hours",
        icon: "clock",
        title: "After-Hours Ledger",
        body: "Off-shift tasks automatically register rest-owed minutes to the ledger. Work is balanced transparently without the need to calculate hourly OT.",
      },
      {
        _key: "pantry",
        icon: "receipt",
        title: "Pantry-to-Palengke",
        body: "Low pantry stocks automatically populate the grocery checklist. The buyer gets clear budgets, actual cost inputs, and silent receipt-photo uploads.",
      },
    ],
  },
  lenses: {
    hidden: false,
    heading: "One source of truth, two lenses",
    body: "Our app provides different interfaces tailored specifically to each user’s job and environment.",
    items: [
      {
        _key: "manager",
        title: "The Manager's Pass",
        body: "A read-mostly, at-a-glance dashboard showing status bars, active boards, and money dials. Built for busy parents who can't watch the house all day.",
      },
      {
        _key: "worker",
        title: "The Worker's Station",
        body: "A high-contrast mobile screen displaying a single focal card. No open chat channels—instead, work is tracked as secure, silent tickets.",
      },
    ],
  },
  account: {
    hidden: false,
    badge: "Her Own Account",
    heading: "Her login, her pay record",
    body: "The helper sets her own password — the household never holds it. Her payslips, vale balance, and rest owed live in her own app, showing the same numbers the family sees.",
    complianceTitle: "Built around Batas Kasambahay",
    complianceBody:
      "Wages checked against the regional minimum, with the SSS, PhilHealth, and Pag-IBIG split worked out on every payslip.",
  },
  footer: {
    copyright: "© 2026 Linara Home. Built for dignity, clarity, and household harmony.",
    privacyLabel: "Privacy",
    termsLabel: "Terms",
  },
};

/**
 * GROQ projection: only rendered fields, nothing else leaves Sanity.
 * `defined(kitchen)` keeps a sibling product's `landingPage` out: MILA shares
 * this Sanity organization, the env var names, the dataset name and the
 * document id, so a mis-set SANITY_PROJECT_ID would otherwise put its copy here.
 */
export const LANDING_QUERY = `*[_id == "${LANDING_DOCUMENT_ID}" && defined(kitchen)][0]{
  seo{title, description, socialDescription},
  header{ctaLabel},
  hero{kicker, headlineLine1, headlineLine2, description, ctaLabel},
  kitchen{hidden, heading, body, cards[]{_key, icon, title, body}},
  lenses{hidden, heading, body, items[]{_key, title, body}},
  account{hidden, badge, heading, body, complianceTitle, complianceBody},
  footer{copyright, privacyLabel, termsLabel}
}`;

// ---------------------------------------------------------------------------
// Normalizer: every field validated on its own, falling back on its own.
// A hidden section is the exception: it keeps its flag and no copy at all.

type Raw = Record<string, unknown>;
const isObj = (v: unknown): v is Raw => !!v && typeof v === "object" && !Array.isArray(v);
const obj = (v: unknown): Raw => (isObj(v) ? v : {});

function text(value: unknown, fallback: string, max = 400): string {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  return trimmed && trimmed.length <= max ? trimmed : fallback;
}
const flag = (value: unknown, fallback: boolean) => (typeof value === "boolean" ? value : fallback);

function key(value: unknown, index: number): string {
  return typeof value === "string" && /^[\w-]{1,64}$/.test(value) ? value : `item-${index}`;
}
const isIcon = (v: unknown): v is LandingIcon =>
  typeof v === "string" && (LANDING_ICONS as readonly string[]).includes(v);

/**
 * A list is used only if it has 1..max valid items; otherwise the whole
 * fallback list is kept (a half-valid list would mis-pair titles and bodies).
 */
function list<T>(
  value: unknown,
  max: number,
  parse: (item: Raw, i: number) => T | null,
  fallback: T[],
): T[] {
  if (!Array.isArray(value) || value.length === 0) return fallback;
  const parsed = value.slice(0, max).map((item, i) => parse(obj(item), i));
  return parsed.every((p): p is T => p !== null) ? parsed : fallback;
}

const required = (value: unknown, max = 400): string | null =>
  typeof value === "string" && value.trim() && value.trim().length <= max ? value.trim() : null;

export function normalizeLandingContent(raw: unknown): LandingContent {
  const doc = obj(raw);
  const F = LANDING_FALLBACK;
  const seo = obj(doc.seo);
  const header = obj(doc.header);
  const hero = obj(doc.hero);
  const kitchen = obj(doc.kitchen);
  const lenses = obj(doc.lenses);
  const account = obj(doc.account);
  const footer = obj(doc.footer);

  const content: LandingContent = {
    seo: {
      title: text(seo.title, F.seo.title, 70),
      description: text(seo.description, F.seo.description, 160),
      socialDescription: text(seo.socialDescription, F.seo.socialDescription, 200),
    },
    header: { ctaLabel: text(header.ctaLabel, F.header.ctaLabel, 32) },
    hero: {
      kicker: text(hero.kicker, F.hero.kicker, 40),
      headlineLine1: text(hero.headlineLine1, F.hero.headlineLine1, 60),
      headlineLine2: text(hero.headlineLine2, F.hero.headlineLine2, 60),
      description: text(hero.description, F.hero.description, 320),
      ctaLabel: text(hero.ctaLabel, F.hero.ctaLabel, 32),
    },
    kitchen: {
      hidden: flag(kitchen.hidden, F.kitchen.hidden),
      heading: text(kitchen.heading, F.kitchen.heading, 80),
      body: text(kitchen.body, F.kitchen.body, 260),
      cards: list(
        kitchen.cards,
        6,
        (c, i) => {
          const title = required(c.title, 60);
          const body = required(c.body, 280);
          if (!title || !body) return null;
          return {
            _key: key(c._key, i),
            icon: isIcon(c.icon) ? c.icon : (F.kitchen.cards[i]?.icon ?? "sparkles"),
            title,
            body,
          };
        },
        F.kitchen.cards,
      ),
    },
    lenses: {
      hidden: flag(lenses.hidden, F.lenses.hidden),
      heading: text(lenses.heading, F.lenses.heading, 80),
      body: text(lenses.body, F.lenses.body, 260),
      items: list(
        lenses.items,
        4,
        (l, i) => {
          const title = required(l.title, 60);
          const body = required(l.body, 280);
          return title && body ? { _key: key(l._key, i), title, body } : null;
        },
        F.lenses.items,
      ),
    },
    account: {
      hidden: flag(account.hidden, F.account.hidden),
      badge: text(account.badge, F.account.badge, 30),
      heading: text(account.heading, F.account.heading, 80),
      body: text(account.body, F.account.body, 320),
      complianceTitle: text(account.complianceTitle, F.account.complianceTitle, 60),
      complianceBody: text(account.complianceBody, F.account.complianceBody, 240),
    },
    footer: {
      copyright: text(footer.copyright, F.footer.copyright, 120),
      privacyLabel: text(footer.privacyLabel, F.footer.privacyLabel, 20),
      termsLabel: text(footer.termsLabel, F.footer.termsLabel, 20),
    },
  };

  // A hidden section keeps its flag and nothing else. This object is the
  // route's loader data, serialized into the page for hydration, so copy left
  // here would sit in every visitor's page source. Stripped, a hidden section
  // is absent from the server-rendered HTML and from the hydration data.
  // That is all hiding does: LANDING_FALLBACK, hidden sections included, is
  // in the client bundle (see its comment). The view never reads a hidden
  // section.
  if (content.kitchen.hidden) content.kitchen = { hidden: true, heading: "", body: "", cards: [] };
  if (content.lenses.hidden) content.lenses = { hidden: true, heading: "", body: "", items: [] };
  if (content.account.hidden) {
    content.account = {
      hidden: true,
      badge: "",
      heading: "",
      body: "",
      complianceTitle: "",
      complianceBody: "",
    };
  }
  return content;
}

// ---------------------------------------------------------------------------
// Shape check for content that arrives over the network.

/**
 * True when `value` has every field `like` has, each of the same kind. List
 * items are checked against `like`'s first item (LANDING_FALLBACK's lists are
 * never empty).
 */
function sameShape(value: unknown, like: unknown): boolean {
  if (Array.isArray(like)) {
    return Array.isArray(value) && value.every((item) => sameShape(item, like[0]));
  }
  if (isObj(like)) {
    return isObj(value) && Object.keys(like).every((field) => sameShape(value[field], like[field]));
  }
  return typeof value === typeof like;
}

/**
 * True when `value` is content the page can render: every field of
 * LandingContent with its type, and only code-owned icons. Anything less would
 * crash LandingView or landingHead. Hidden sections pass: their lists are
 * empty, not missing.
 */
export function isLandingContent(value: unknown): value is LandingContent {
  return (
    sameShape(value, LANDING_FALLBACK) &&
    (value as LandingContent).kitchen.cards.every((card) => isIcon(card.icon))
  );
}

const LANDING_SOURCES = ["studio", "last-good", "fallback"] as const;
export type LandingSource = (typeof LANDING_SOURCES)[number];

/**
 * What the server function answers with: the copy, and where it came from.
 * - "studio": Sanity, read for this request (or for one it shared the read with).
 * - "last-good": the last good read of the server instance that answered.
 * - "fallback": LANDING_FALLBACK, from an instance with no good read: Sanity
 *   is not configured, or has failed since the instance started. A browser
 *   holding copy of its own keeps it over this (landing-loader.ts).
 */
export interface LandingReply {
  content: LandingContent;
  source: LandingSource;
}

/** True when `value` is a reply with a known source and content isLandingContent accepts. */
export function isLandingReply(value: unknown): value is LandingReply {
  return (
    isObj(value) &&
    (LANDING_SOURCES as readonly unknown[]).includes(value.source) &&
    isLandingContent(value.content)
  );
}

// ---------------------------------------------------------------------------
// Head tags for the `/` route.

export function landingHead(content: LandingContent | undefined) {
  if (!content) return {};
  return {
    meta: [
      { title: content.seo.title },
      { name: "description", content: content.seo.description },
      { property: "og:title", content: content.seo.title },
      { property: "og:description", content: content.seo.socialDescription },
    ],
  };
}

// ---------------------------------------------------------------------------
// Loader: never throws.

export interface SanityTarget {
  projectId: string;
  dataset: string;
}

/**
 * Reads SANITY_PROJECT_ID / SANITY_DATASET. Values are validated so they can
 * be placed in a URL safely; anything malformed counts as "not configured".
 */
export function sanityTargetFromEnv(env: Record<string, string | undefined>): SanityTarget | null {
  const projectId = env.SANITY_PROJECT_ID?.trim();
  const dataset = env.SANITY_DATASET?.trim();
  if (!projectId || !/^[a-z0-9]{1,32}$/.test(projectId)) return null;
  if (!dataset || !/^[a-z0-9][a-z0-9_-]{0,63}$/.test(dataset)) return null;
  return { projectId, dataset };
}

export const SANITY_API_VERSION = "2026-08-01";

/** Public, read-only CDN query URL. No token: the dataset is public-read. */
export function landingQueryUrl({ projectId, dataset }: SanityTarget): string {
  const url = new URL(
    `https://${projectId}.apicdn.sanity.io/v${SANITY_API_VERSION}/data/query/${dataset}`,
  );
  url.searchParams.set("query", LANDING_QUERY);
  url.searchParams.set("perspective", "published");
  return url.toString();
}

export interface LandingContentLoaderOptions {
  target: SanityTarget | null;
  fetchImpl?: typeof fetch;
  warn?: (message: string) => void;
  /** Milliseconds clock, monotonic by default; tests inject their own. */
  now?: () => number;
  timeoutMs?: number;
}
export type LandingContentLoader = () => Promise<LandingReply>;

/** After a failed read the loader stays off Sanity this long. */
const LANDING_RETRY_AFTER_MS = 30_000;

/**
 * The class name tells a timeout (TimeoutError) from a network failure
 * (TypeError) from bad JSON (SyntaxError). The message is never logged: it
 * can echo request details.
 */
function errorName(error: unknown): string {
  const name = obj(error).name;
  return typeof name === "string" && /^[A-Za-z]{1,40}$/.test(name) ? name : "Error";
}

/**
 * Settles like `work`, or rejects with the signal's reason once it aborts,
 * whichever comes first. A fetch, or a body read, that ignores its abort
 * signal therefore cannot keep anyone waiting past the deadline.
 */
function untilAborted<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(signal.reason);
    if (signal.aborted) onAbort();
    else signal.addEventListener("abort", onAbort, { once: true });
    work.then(resolve, reject).finally(() => signal.removeEventListener("abort", onAbort));
  });
}

/**
 * A loader for one server instance. Its memory lives in this closure, not in
 * module scope, so each instance (and each test) has its own.
 *
 * - A failed read serves the last good Studio copy, so a section an editor hid
 *   or a corrected compliance line does not revert during an outage. Only an
 *   instance that has never had a good read serves LANDING_FALLBACK.
 * - One read at a time. Requests that need Sanity while a read is under way
 *   share it, or, when a good copy is in hand, get that copy at once instead
 *   of waiting. No read keeps anyone past `timeoutMs`.
 * - After a failure it stays off Sanity for LANDING_RETRY_AFTER_MS, so an
 *   outage costs one read and one warning per window, however many requests
 *   arrive. A read reports its failure once: given up at its deadline, it
 *   stays silent when its fetch gives up too, however late.
 * - Reads are numbered, and only the newest may change the memory: a read
 *   that answers after a newer one neither replaces the newer copy nor opens
 *   a quiet period after Sanity has answered.
 * - Unconfigured is the steady state on a site without the CMS: it warns once
 *   and never fetches.
 * - Every reply says where its copy came from (LandingReply): "studio" for a
 *   request that waited for a read that found it, "last-good" for the copy
 *   kept from an earlier read, "fallback" for LANDING_FALLBACK.
 */
export function createLandingContentLoader({
  target,
  fetchImpl = fetch,
  warn = (m) => console.warn(m),
  // Monotonic: a wall-clock correction can neither stall nor cut short the
  // quiet period.
  now = () => performance.now(),
  timeoutMs = 4000,
}: LandingContentLoaderOptions): LandingContentLoader {
  let lastGood: LandingContent | null = null;
  let retryAt = Number.NEGATIVE_INFINITY;
  let warnedUnconfigured = false;
  let newestRead = 0;
  let reportedRead = 0;
  // Resolves true when the read stored fresh Studio copy.
  let reading: Promise<boolean> | null = null;
  const fallbackCopy = `fallback copy v${LANDING_FALLBACK_VERSION}`;
  // Every caller gets its own copy, so one that changes what it was served
  // cannot reach the next response, or LANDING_FALLBACK itself. `fresh`: the
  // read this request waited for stored the copy. The source is worked out
  // with the copy, so a "fallback" reply always carries LANDING_FALLBACK.
  const serve = (fresh = false): LandingReply =>
    lastGood
      ? { content: structuredClone(lastGood), source: fresh ? "studio" : "last-good" }
      : { content: structuredClone(LANDING_FALLBACK), source: "fallback" };

  // Always false, so a failing path can `return failed(...)`: it stored nothing.
  const failed = (read: number, reason: string): false => {
    // Only the newest read reports, and only once. A read can fail twice: at
    // its deadline, and when a fetch that ignored the abort gives up, however
    // much later. A second report would warn again and open a second quiet
    // period, holding back the next read for up to another 30 seconds.
    if (read !== newestRead || read === reportedRead) return false;
    reportedRead = read;
    retryAt = now() + LANDING_RETRY_AFTER_MS;
    const serving = lastGood ? "the last good Studio copy" : fallbackCopy;
    warn(
      `[landing] ${reason}; serving ${serving}. Next attempt in ${LANDING_RETRY_AFTER_MS / 1000}s.`,
    );
    return false;
  };

  const read = async (sanity: SanityTarget): Promise<boolean> => {
    const id = ++newestRead;
    const where = `${sanity.projectId}/${sanity.dataset}`;
    // One signal aborts the fetch and the body read, and bounds the wait.
    const signal = AbortSignal.timeout(timeoutMs);
    // Applies its own result whenever it ends, which for a fetch that ignores
    // its abort can be after the deadline. The read number then keeps it
    // from overwriting a newer read, and from reporting a failure twice.
    const attempt = (async () => {
      try {
        const res = await fetchImpl(landingQueryUrl(sanity), {
          headers: { accept: "application/json" },
          signal,
        });
        // Only the status is logged: upstream bodies can echo request details.
        if (!res.ok) return failed(id, `Sanity responded ${res.status} for ${where}`);
        const body = obj(await res.json());
        if (!body.result) return failed(id, `No published "${LANDING_DOCUMENT_ID}" in ${where}`);
        // Second guard behind the query filter: only LINARA's document has a
        // `kitchen` section, so anything else is another product's page.
        if (!isObj(obj(body.result).kitchen)) {
          return failed(id, `The "${LANDING_DOCUMENT_ID}" in ${where} does not look like LINARA's`);
        }
        if (id !== newestRead) return false;
        lastGood = normalizeLandingContent(body.result);
        return true;
      } catch (error) {
        return failed(id, `Sanity request failed (${errorName(error)}) for ${where}`);
      }
    })();
    try {
      return await untilAborted(attempt, signal);
    } catch (error) {
      return failed(id, `Sanity request failed (${errorName(error)}) for ${where}`);
    }
  };

  return async () => {
    if (!target) {
      if (!warnedUnconfigured) {
        warnedUnconfigured = true;
        warn(`[landing] Sanity is not configured; serving ${fallbackCopy}.`);
      }
      return serve();
    }
    if (now() < retryAt) return serve();
    if (!reading) {
      reading = read(target).finally(() => {
        reading = null;
      });
    } else if (lastGood) {
      return serve();
    }
    return serve(await reading);
  };
}
