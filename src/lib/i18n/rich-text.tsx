import { Fragment, type ReactNode } from "react";

import { textParts } from "./instance";

/**
 * A translated sentence with a styled piece inside it (a bold amount, a
 * link): the piece goes where the language puts its {placeholder}.
 * `t(key, plainVars)` fills the plain values first; the rich ones are left
 * as {name} for this to place.
 *
 *   richText(t("pay.aboutAmount"), { amount: <strong>{fmtPeso(n)}</strong> })
 */
export function richText(text: string, parts: Record<string, ReactNode>): ReactNode[] {
  return textParts(text).map((part, i) =>
    typeof part === "string" ? (
      part
    ) : (
      // A part that's there but empty (a spinner when nothing is loading)
      // renders nothing; only a name nobody passed shows as {name}.
      <Fragment key={i}>{part.name in parts ? parts[part.name] : `{${part.name}}`}</Fragment>
    ),
  );
}
