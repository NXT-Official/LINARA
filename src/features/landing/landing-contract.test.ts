import { describe, expect, it } from "vitest";

import {
  LANDING_FALLBACK,
  LANDING_ICONS,
  LANDING_QUERY,
  normalizeLandingContent,
} from "@/features/landing/landing-content";

/**
 * The site's own half of the contract with the LINARA Studio schema.
 *
 * The Studio repo pins its schema to LANDING_QUERY, but it reads this repo by
 * relative path, so a renamed field here would leave this repo's CI green and
 * an editor's change would silently stop showing up. This list is every field
 * the homepage reads. Changing the query means changing the list on purpose,
 * and then the Studio schema (LINARA_STUDIO/schemaTypes/landingPage.ts).
 */
const LEAF_FIELDS = [
  "seo.title",
  "seo.description",
  "seo.socialDescription",
  "header.ctaLabel",
  "hero.kicker",
  "hero.headlineLine1",
  "hero.headlineLine2",
  "hero.description",
  "hero.ctaLabel",
  "kitchen.hidden",
  "kitchen.heading",
  "kitchen.body",
  "kitchen.cards[].icon",
  "kitchen.cards[].title",
  "kitchen.cards[].body",
  "lenses.hidden",
  "lenses.heading",
  "lenses.body",
  "lenses.items[].title",
  "lenses.items[].body",
  "account.hidden",
  "account.badge",
  "account.heading",
  "account.body",
  "account.complianceTitle",
  "account.complianceBody",
  "footer.copyright",
  "footer.privacyLabel",
  "footer.termsLabel",
];
/** Sanity's own list-item keys: read for React keys, never shown. */
const KEY_FIELDS = ["kitchen.cards[]._key", "lenses.items[]._key"];
const FIELDS = [...LEAF_FIELDS, ...KEY_FIELDS];
const HIDDEN_FLAGS = FIELDS.filter((path) => path.endsWith(".hidden"));
/** Everything a visitor could read or that keys a list: all but the flags. */
const COPY_FIELDS = FIELDS.filter((path) => !HIDDEN_FLAGS.includes(path));

/**
 * Every leaf path a GROQ query's projection selects, e.g. `kitchen.cards[].icon`.
 * Strict on purpose: syntax it does not know (an alias, a spread, a
 * dereference) throws instead of being skipped, so the contract cannot quietly
 * stop covering part of the query.
 */
function projectedPaths(query: string): string[] {
  const filterEnd = "][0]";
  const open = query.indexOf(`${filterEnd}{`);
  if (open === -1) throw new Error("No `[0]{…}` projection in the query");
  const tokens = query.slice(open + filterEnd.length).match(/\w+(?:\[\])?|\S/g) ?? [];
  const paths: string[] = [];
  let at = 0;

  const projection = (prefix: string) => {
    if (tokens[at] !== "{") throw new Error(`Expected "{" but found "${tokens[at]}"`);
    do {
      at += 1;
      const name = tokens[at] ?? "";
      if (!/^[A-Za-z_]\w*(?:\[\])?$/.test(name)) {
        throw new Error(`Unsupported GROQ in the projection: "${name}"`);
      }
      at += 1;
      const path = prefix ? `${prefix}.${name}` : name;
      if (tokens[at] === "{") projection(path);
      else paths.push(path);
    } while (tokens[at] === ",");
    if (tokens[at] !== "}") throw new Error(`Unsupported GROQ after "${tokens[at - 1]}"`);
    at += 1;
  };

  projection("");
  if (at !== tokens.length) throw new Error(`Unexpected "${tokens[at]}" after the projection`);
  return paths;
}

type Doc = Record<string, unknown>;

/** Items given to each list: two, so an item is shown to keep its own values. */
const ITEMS = 2;
const itemsOf = (path: string) => (path.includes("[]") ? ITEMS : 1);

/** Valid icons the normalizer would not pick by itself for these cards. */
const SENTINEL_ICONS = LANDING_ICONS.filter(
  (icon) =>
    icon !== "sparkles" &&
    !LANDING_FALLBACK.kitchen.cards.slice(0, ITEMS).some((card) => card.icon === icon),
);

/** A valid value for a copy field, found nowhere else in the document. */
function sentinel(path: string, item: number): string {
  if (path.endsWith(".icon")) return SENTINEL_ICONS[item];
  const id = `${FIELDS.indexOf(path)}-${item}`;
  return path.endsWith("._key") ? `key-${id}` : `#${id}`;
}

/** Writes `value` at `path`; a `name[]` segment addresses list item `item`. */
function put(doc: Doc, path: string, item: number, value: unknown): void {
  const segments = path.split(".");
  const leaf = segments.pop() ?? "";
  if (leaf.endsWith("[]")) throw new Error(`A list of plain values is not supported: ${path}`);
  let node = doc;
  for (const segment of segments) {
    if (segment.endsWith("[]")) {
      const list = (node[segment.slice(0, -2)] ??= []) as Doc[];
      node = list[item] ??= {};
    } else {
      node = (node[segment] ??= {}) as Doc;
    }
  }
  node[leaf] = value;
}

/** Reads what `put` wrote, from a document or from normalized content. */
function read(source: unknown, path: string, item: number): unknown {
  let node = source;
  for (const segment of path.split(".")) {
    const record = node as Doc;
    node = segment.endsWith("[]")
      ? (record[segment.slice(0, -2)] as unknown[])[item]
      : record[segment];
  }
  return node;
}

/**
 * A Studio document with every copy field set to its sentinel and every
 * section shown, except the one whose flag is `hiddenFlag`.
 */
function sentinelDocument(hiddenFlag?: string): Doc {
  const doc: Doc = {};
  for (const path of COPY_FIELDS) {
    for (let item = 0; item < itemsOf(path); item += 1) put(doc, path, item, sentinel(path, item));
  }
  for (const flag of HIDDEN_FLAGS) put(doc, flag, 0, flag === hiddenFlag);
  return doc;
}

/** A hidden section as it must be served: its flag, empty text, empty lists. */
function bare(section: string): Doc {
  const served: Doc = {};
  for (const path of FIELDS) {
    const [owner, field] = path.split(".");
    if (owner !== section) continue;
    if (field.endsWith("[]")) served[field.slice(0, -2)] = [];
    else served[field] = field === "hidden" ? true : "";
  }
  return served;
}

describe("projectedPaths (the contract's GROQ reader)", () => {
  it("reads nested and list projections, keys included", () => {
    expect(projectedPaths('*[_id == "x"][0]{a{b, c[]{_key, d}}, e}')).toEqual([
      "a.b",
      "a.c[]._key",
      "a.c[].d",
      "e",
    ]);
  });

  it.each([
    ["an alias", '*[_id == "x"][0]{a, "b": c}'],
    ["a spread", '*[_id == "x"][0]{..., a}'],
    ["a dereference", '*[_id == "x"][0]{a->{b}}'],
    ["a trailing comma", '*[_id == "x"][0]{a, b,}'],
    ["an unclosed projection", '*[_id == "x"][0]{a{b}'],
    ["text after the projection", '*[_id == "x"][0]{a}.a'],
    ["no projection", '*[_id == "x"][0]'],
  ])("refuses %s instead of skipping it", (_name, query) => {
    expect(() => projectedPaths(query)).toThrow();
  });
});

describe("landing contract: field list ↔ LANDING_QUERY ↔ normalizer", () => {
  const selected = projectedPaths(LANDING_QUERY);

  it("names each field once, in the list and in the query", () => {
    expect(new Set(FIELDS).size).toBe(FIELDS.length);
    expect(new Set(selected).size).toBe(selected.length);
  });

  it("every listed field is selected by the query", () => {
    expect(FIELDS.filter((path) => !selected.includes(path))).toEqual([]);
  });

  it("the query selects nothing that is not listed", () => {
    expect(selected.filter((path) => !FIELDS.includes(path))).toEqual([]);
  });

  it("gives every copy field its own valid sentinel", () => {
    expect(HIDDEN_FLAGS).toEqual(["kitchen.hidden", "lenses.hidden", "account.hidden"]);
    expect(SENTINEL_ICONS.length).toBeGreaterThanOrEqual(ITEMS);
    const values: string[] = [];
    for (const path of COPY_FIELDS) {
      for (let item = 0; item < itemsOf(path); item += 1) values.push(sentinel(path, item));
    }
    expect(new Set(values).size).toBe(values.length);
  });

  // Field mapping is checked with every section shown: a hidden section
  // carries no copy to map (the tests below).
  it("normalizing returns each listed field from the place the query puts it", () => {
    const doc = sentinelDocument();
    const content = normalizeLandingContent(doc);
    for (const path of COPY_FIELDS) {
      for (let item = 0; item < itemsOf(path); item += 1) {
        expect(read(content, path, item), `${path}, item ${item}`).toBe(sentinel(path, item));
      }
    }
    for (const flag of HIDDEN_FLAGS) expect(read(content, flag, 0), flag).toBe(false);
    // And nothing else: a field the page reads but the list misses would
    // surface here as checked-in copy the document never set.
    expect(content).toEqual(doc);
  });

  it.each(HIDDEN_FLAGS)("%s is read from its own section, which then carries no copy", (flag) => {
    const section = flag.split(".")[0];
    const doc = sentinelDocument(flag);
    const content = normalizeLandingContent(doc);
    // What the page source would hold: loader data is serialized for hydration.
    const wire = JSON.stringify(content);

    for (const other of HIDDEN_FLAGS) expect(read(content, other, 0), other).toBe(other === flag);
    for (const path of COPY_FIELDS) {
      for (let item = 0; item < itemsOf(path); item += 1) {
        const value = sentinel(path, item);
        const where = `${path}, item ${item}`;
        if (path.startsWith(`${section}.`)) {
          expect(wire, where).not.toContain(JSON.stringify(value));
        } else {
          expect(read(content, path, item), where).toBe(value);
        }
      }
    }
    // Exactly the document, with the hidden section reduced to its flag.
    expect(content).toEqual({ ...doc, [section]: bare(section) });
  });
});
