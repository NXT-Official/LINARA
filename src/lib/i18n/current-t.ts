import { tFor, type Translate } from "./instance";
import { readLocale } from "./locale-cookie";

/**
 * `t` in the reader's language, for text made outside a component: server
 * function errors, hook messages, toasts. On the server it reads the request's
 * cookie, in the browser `document.cookie`. In a component, use `useT()`.
 */
export function currentT(): Translate {
  return tFor(readLocale());
}
