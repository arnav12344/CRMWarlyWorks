/**
 * Template merge/personalization engine.
 *
 * Renders `{{variable}}` placeholders in a subject/body against a contact's
 * merge fields (firstName, orgName, city, contactType, ...) and supports
 * inserting reusable proof-point snippets via `{{snippet:label}}`.
 *
 * Design rule: a MISSING variable must NEVER crash the render. Instead it is
 * replaced with a visible, human-readable placeholder such as `[firstName?]`
 * so the sender immediately notices the gap in the preview.
 */

/** Values available to a template, keyed by variable name. */
export type MergeContext = Record<string, string | null | undefined>;

/** A snippet available for `{{snippet:label}}` insertion. */
export interface MergeSnippet {
  label: string;
  body: string;
}

/** Matches `{{ name }}` / `{{snippet:label}}` including surrounding spaces. */
const TOKEN_RE = /\{\{\s*([^}]+?)\s*\}\}/g;

/** Build a visible placeholder for a missing/unknown variable. */
export function missingPlaceholder(name: string): string {
  return `[${name}?]`;
}

/** The default merge fields we surface for a contact. */
export const DEFAULT_MERGE_FIELDS = [
  "firstName",
  "lastName",
  "fullName",
  "orgName",
  "city",
  "country",
  "contactType",
  "title",
  "email",
] as const;

export interface RenderResult {
  text: string;
  /** Variable names referenced by the template that had no value. */
  missing: string[];
  /** Snippet labels referenced by the template that were not found. */
  missingSnippets: string[];
}

/**
 * Render a single string, resolving `{{var}}` and `{{snippet:label}}` tokens.
 * Never throws: unknown vars/snippets become visible placeholders.
 */
export function renderString(
  template: string,
  context: MergeContext,
  snippets: MergeSnippet[] = []
): RenderResult {
  const missing = new Set<string>();
  const missingSnippets = new Set<string>();
  const snippetByLabel = new Map(
    snippets.map((s) => [s.label.toLowerCase(), s.body])
  );

  const text = (template ?? "").replace(TOKEN_RE, (_match, rawToken: string) => {
    const token = rawToken.trim();

    if (token.toLowerCase().startsWith("snippet:")) {
      const label = token.slice("snippet:".length).trim();
      const body = snippetByLabel.get(label.toLowerCase());
      if (body == null) {
        missingSnippets.add(label);
        return `[snippet:${label}?]`;
      }
      return body;
    }

    const value = context[token];
    if (value == null || value === "") {
      missing.add(token);
      return missingPlaceholder(token);
    }
    return value;
  });

  return {
    text,
    missing: [...missing],
    missingSnippets: [...missingSnippets],
  };
}

export interface RenderedEmail {
  subject: string;
  body: string;
  missing: string[];
  missingSnippets: string[];
}

/**
 * Render a full email (subject + body) against a merge context and snippet
 * library. Aggregates the missing variables/snippets across both fields.
 */
export function renderEmail(
  template: { subject?: string | null; body?: string | null },
  context: MergeContext,
  snippets: MergeSnippet[] = []
): RenderedEmail {
  const subject = renderString(template.subject ?? "", context, snippets);
  const body = renderString(template.body ?? "", context, snippets);
  const missing = [...new Set([...subject.missing, ...body.missing])];
  const missingSnippets = [
    ...new Set([...subject.missingSnippets, ...body.missingSnippets]),
  ];
  return {
    subject: subject.text,
    body: body.text,
    missing,
    missingSnippets,
  };
}

/** Fields describing a contact well enough to build a merge context. */
export interface ContactLike {
  firstName?: string | null;
  lastName?: string | null;
  fullName?: string | null;
  title?: string | null;
  email?: string | null;
  organization?: { name?: string | null; city?: string | null; country?: string | null } | null;
  contactTypeName?: string | null;
}

/**
 * Build a merge context from a contact record. Derives `firstName` from a
 * full name when the discrete field is absent so seeded/imported rows still
 * personalize nicely.
 */
export function buildMergeContext(contact: ContactLike): MergeContext {
  const fullName =
    contact.fullName ||
    [contact.firstName, contact.lastName].filter(Boolean).join(" ") ||
    null;
  const firstName =
    contact.firstName || (fullName ? fullName.split(/\s+/)[0] : null);

  return {
    firstName,
    lastName: contact.lastName,
    fullName,
    title: contact.title,
    email: contact.email,
    orgName: contact.organization?.name,
    city: contact.organization?.city,
    country: contact.organization?.country,
    contactType: contact.contactTypeName,
  };
}

/** Extract the distinct variable names referenced by a template string. */
export function extractVariables(template: string): string[] {
  const found = new Set<string>();
  let m: RegExpExecArray | null;
  const re = new RegExp(TOKEN_RE.source, "g");
  while ((m = re.exec(template ?? "")) != null) {
    const token = m[1].trim();
    if (!token.toLowerCase().startsWith("snippet:")) {
      found.add(token);
    }
  }
  return [...found];
}
