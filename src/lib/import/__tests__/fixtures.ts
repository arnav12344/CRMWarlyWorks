/**
 * A fixture resembling the messy Google-Maps-style scraper export.
 *
 * Row 1 is a PARENT job row (a scraper task) with metadata but no business.
 * Rows 2 & 3 are per-city SUBTASK rows whose `data` column carries the real
 * businesses inside nested JSON, and whose `metadata` / `error` columns contain
 * a FAKE api_key and a bearer token that MUST be redacted and never stored.
 *
 * Notably, "Bright Future Learning" appears in BOTH subtask rows with the same
 * website domain, so dedupe must collapse it into a single organization.
 */

/** A fake secret used ONLY to prove redaction. It must never survive import. */
export const FAKE_API_KEY = "FAKE-not-a-real-key-000011112222333344445555";
export const FAKE_BEARER = "Bearer FAKE-not-a-real-token-00001111222233334444";

export const scraperRows: Record<string, unknown>[] = [
  // Parent job row: describes the scraper task, no business payload.
  {
    task_id: "job-001",
    kind: "parent",
    query: "tuition centres singapore",
    metadata: JSON.stringify({
      requested_by: "ops",
      credentials: { api_key: FAKE_API_KEY },
    }),
    data: "",
    error: "",
  },
  // Subtask row for city A: one business + a secret in metadata.
  {
    task_id: "job-001-a",
    kind: "subtask",
    city: "Singapore",
    metadata: JSON.stringify({ authorization: FAKE_BEARER, page: 1 }),
    data: JSON.stringify({
      results: [
        {
          name: "Bright Future Learning",
          website: "https://www.brightfuture.sg/contact",
          phone: "+65 6123 4567",
          email: "info@brightfuture.sg",
          address: "1 Orchard Rd, Singapore",
          city: "Singapore",
          categories: ["Tuition centre", "Education"],
        },
      ],
    }),
    error: "",
  },
  // Subtask row for city B: same business (same domain) + a NEW named contact,
  // and a secret buried inside the `error` blob.
  {
    task_id: "job-001-b",
    kind: "subtask",
    city: "Jurong",
    metadata: JSON.stringify({ page: 2 }),
    data: JSON.stringify({
      results: [
        {
          name: "Bright Future Learning (Jurong)",
          website: "http://brightfuture.sg",
          email: "admissions@brightfuture.sg",
          city: "Jurong",
        },
        {
          business_name: "Acme Educators Pte Ltd",
          url: "https://acme-educators.com",
          contact_email: "jane.doe@acme-educators.com",
          contact_person: "Jane Doe",
          job_title: "Principal",
          phone: "+65 6999 0000",
        },
      ],
    }),
    // Even error payloads can leak secrets from a failed authed request.
    error: JSON.stringify({
      message: "rate limited",
      debug: { token: FAKE_API_KEY },
    }),
  },
];
