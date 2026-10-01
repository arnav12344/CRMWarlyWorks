/**
 * Email signature helpers (pure, no I/O).
 *
 * Gmail never adds your signature to mail sent by another app over SMTP, so
 * the CRM appends it itself. "Import from Gmail" reads a recent email you sent
 * from Gmail on the web: Gmail wraps the signature in
 * `<div class="gmail_signature">`, which `extractGmailSignature` pulls out.
 * Storage + the IMAP import live in ./signatureStore.
 */
import { escapeHtml, htmlToText, textToHtml, type Signature } from "./compose";

export type { Signature };

/** Max stored signature HTML (Gmail's own limit is 10,000 characters). */
export const MAX_SIGNATURE_HTML = 20_000;
export const MAX_SIGNATURE_TEXT = 2_000;

const SIG_OPEN = /<div\b[^>]*\bclass\s*=\s*(["'])(?:(?!\1).)*\bgmail_signature\b(?:(?!\1).)*\1[^>]*>/gi;

/** How many <blockquote> elements are open at `index` (i.e. quoted history). */
function blockquoteDepth(html: string, index: number): number {
  const before = html.slice(0, index);
  const opens = before.match(/<blockquote\b/gi)?.length ?? 0;
  const closes = before.match(/<\/blockquote\s*>/gi)?.length ?? 0;
  return opens - closes;
}

/** The full `<div …>…</div>` element starting at `start`, balancing nested divs. */
function balancedDiv(html: string, start: number): string | null {
  const tag = /<(\/?)div\b[^>]*>/gi;
  tag.lastIndex = start;
  let depth = 0;
  for (let m = tag.exec(html); m; m = tag.exec(html)) {
    depth += m[1] ? -1 : 1;
    if (depth === 0) return html.slice(start, m.index + m[0].length);
  }
  return null;
}

/**
 * The sender's own Gmail signature block from a sent email's HTML, or null.
 * Signatures inside quoted history (blockquotes) belong to other people or
 * older emails and are skipped.
 */
export function extractGmailSignature(html: string | null | undefined): string | null {
  const source = html ?? "";
  SIG_OPEN.lastIndex = 0;
  for (let m = SIG_OPEN.exec(source); m; m = SIG_OPEN.exec(source)) {
    if (blockquoteDepth(source, m.index) > 0) continue;
    const block = balancedDiv(source, m.index);
    if (block && htmlToText(block).trim()) return block;
  }
  return null;
}

/** Elements removed together with everything inside them. */
const DROP_WITH_CONTENT = /<(script|style|iframe|object|embed|svg|math|template|noscript|form|select|textarea|button|head|title)\b[\s\S]*?<\/\1\s*>/gi;
/** Elements removed (their content, if any, is kept). */
const DROP_TAG = /<\/?(?:script|style|iframe|object|embed|svg|math|template|noscript|form|select|textarea|button|input|meta|link|base|frame|frameset|applet|html|body|head|title)\b[^>]*>/gi;

/**
 * Make imported signature HTML safe to store, preview and send: no scripts,
 * event handlers, forms or javascript:/data: URLs, and no embedded (cid:)
 * images, which can't be reused outside the original email.
 * Returns the cleaned HTML and whether an embedded image was dropped.
 */
export function sanitizeSignatureHtml(html: string): { html: string; droppedEmbeddedImages: boolean } {
  let s = (html ?? "").replace(/<!--[\s\S]*?-->/g, "");
  s = s.replace(DROP_WITH_CONTENT, "").replace(DROP_TAG, "");
  // Attribute clean-up, applied inside tags only (never to the visible text).
  s = s.replace(/<[a-z][^>]*>/gi, (tag) =>
    tag
      // Event handlers and inline scripting hooks.
      .replace(/\s+on[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
      .replace(/\s+(?:srcdoc|formaction|xlink:href)\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
      // Dangerous URL schemes in href/src (data: images are allowed).
      .replace(
        /(\s(?:href|src|background|action)\s*=\s*)(["']?)\s*(javascript|vbscript|data)\s*:([^"'\s>]*)/gi,
        (match, attr: string, quote: string, scheme: string, rest: string) =>
          scheme.toLowerCase() === "data" && /^image\/(png|jpe?g|gif|webp);/i.test(rest) ? match : `${attr}${quote}#`
      )
      // CSS expressions / script URLs inside style attributes.
      .replace(/\sstyle\s*=\s*(["'])((?:(?!\1).)*)\1/gi, (match, _q: string, css: string) =>
        /expression\s*\(|javascript\s*:|url\s*\(\s*["']?\s*javascript/i.test(css) ? "" : match
      )
  );
  let dropped = false;
  s = s.replace(/<img\b[^>]*\bsrc\s*=\s*(["']?)\s*cid:[^>]*>/gi, () => {
    dropped = true;
    return "";
  });
  return { html: s.trim(), droppedEmbeddedImages: dropped };
}

/** A signature from imported (already sanitized) HTML. */
export function signatureFromHtml(html: string): Signature {
  return { html: html.trim(), text: htmlToText(html).slice(0, MAX_SIGNATURE_TEXT) };
}

/** A signature typed as plain text in Settings. Empty text → null. */
export function signatureFromText(text: string): Signature | null {
  const clean = (text ?? "").replace(/\r\n?/g, "\n").trim().slice(0, MAX_SIGNATURE_TEXT);
  if (!clean) return null;
  return {
    html: `<div dir="ltr" class="gmail_signature" data-smartmail="gmail_signature">${textToHtml(clean)}</div>`,
    text: clean,
  };
}

/** Wrap signature HTML into a tiny document for a sandboxed preview iframe. */
export function signaturePreviewDoc(html: string): string {
  return (
    `<!doctype html><html><head><meta charset="utf-8"><style>` +
    `body{margin:12px;font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#222}img{max-width:100%;height:auto}` +
    `</style></head><body>${html || `<p style="color:#888">${escapeHtml("No signature")}</p>`}</body></html>`
  );
}
