import { currentT } from "./current-t";
import type { MessageKey } from "./instance";

/**
 * A label table whose text is looked up each time it is read, in the reader's
 * language. `LABEL[kind]` keeps working at every call site, and shows the new
 * language as soon as a screen re-renders after a language change.
 */
export function lazyMessages<K extends string>(keys: Record<K, MessageKey>): Record<K, string> {
  const table = {} as Record<K, string>;
  for (const k of Object.keys(keys) as K[]) {
    Object.defineProperty(table, k, {
      enumerable: true,
      get: () => currentT()(keys[k]),
    });
  }
  return table;
}
