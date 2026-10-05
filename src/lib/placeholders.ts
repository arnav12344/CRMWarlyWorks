/**
 * Unfilled fields in an email's subject/body. The send engine refuses to send
 * while any are present (src/lib/outreach.ts), and Ready to send flags them.
 *
 *  - [firstName?], [snippet:Proof?]   a merge field this lead has no value for (src/lib/merge.ts)
 *  - {{firstName}}, {{orgName|there}} a merge field that was never filled in
 *  - {firstName}, <<School>>          a mistyped merge field
 *  - [School name], [link]            a fill-in-the-blank left over from a template
 *
 * Only what you wrote is checked: the signature and the quoted thread are
 * added at send time and never pass through here.
 */
const UNFILLED_RE = /\{\{[^{}\n]{0,200}\}\}|\{[^{}\n]{1,200}\}|<<[^<>\n]{1,200}>>|\[[^[\]\n]{1,200}\]/g;

/** A bracket is only a fill-in if it has words in it: "[1]" or "[ ]" is left alone. */
const HAS_LETTER_RE = /\p{L}/u;

export function findPlaceholders(...texts: Array<string | null | undefined>): string[] {
  const found = new Set<string>();
  for (const t of texts) {
    for (const m of (t ?? "").match(UNFILLED_RE) ?? []) {
      if (m.startsWith("[") && !HAS_LETTER_RE.test(m)) continue;
      found.add(m);
    }
  }
  return [...found];
}
