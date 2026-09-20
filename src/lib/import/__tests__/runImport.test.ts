import { describe, it, expect } from "vitest";
import { buildImportPlan } from "../runImport";
import { autoGuessMapping } from "../mapping";
import { scraperRows, FAKE_API_KEY, FAKE_BEARER } from "./fixtures";

describe("buildImportPlan (end-to-end on the scraper fixture)", () => {
  const plan = buildImportPlan(scraperRows, {
    mapping: autoGuessMapping([
      "name",
      "website",
      "email",
      "phone",
      "city",
      "address",
    ]),
    contactTypeId: null,
  });

  it("redacts a non-zero number of secrets", () => {
    // parent api_key + subtask authorization + error token = 3 secrets.
    expect(plan.redactedSecretCount).toBeGreaterThan(0);
    expect(plan.redactedSecretCount).toBe(3);
  });

  it("stores ZERO secret values anywhere in the plan or provenance rows", () => {
    const everything = JSON.stringify(plan);
    expect(everything).not.toContain(FAKE_API_KEY);
    expect(everything).not.toContain(FAKE_BEARER);
    // Redacted provenance rows must also be clean.
    const rawSerialized = JSON.stringify(plan.redactedRows);
    expect(rawSerialized).not.toContain(FAKE_API_KEY);
    expect(rawSerialized).not.toContain(FAKE_BEARER);
    expect(rawSerialized).toContain("[REDACTED]");
  });

  it("dedupes same-domain organizations into one", () => {
    const brightfuture = plan.orgs.filter(
      (o) => o.domain === "brightfuture.sg"
    );
    expect(brightfuture).toHaveLength(1);
    // Two subtask businesses collapsed into one org.
    expect(brightfuture[0].mergedCount).toBe(2);
    // Both role-inbox contacts (info@ and admissions@) attach to it.
    expect(brightfuture[0].contacts.length).toBeGreaterThanOrEqual(2);
  });

  it("flags role inboxes and leaves named addresses unflagged", () => {
    const contacts = plan.orgs.flatMap((o) => o.contacts);
    const info = contacts.find((c) => c.email === "info@brightfuture.sg");
    const admissions = contacts.find(
      (c) => c.email === "admissions@brightfuture.sg"
    );
    const jane = contacts.find(
      (c) => c.email === "jane.doe@acme-educators.com"
    );
    expect(info?.isRoleInbox).toBe(true);
    expect(admissions?.isRoleInbox).toBe(true);
    expect(jane?.isRoleInbox).toBe(false);
    expect(jane?.emailDomain).toBe("acme-educators.com");
    expect(jane?.fullName).toBe("Jane Doe");
  });

  it("produces the expected org and contact counts", () => {
    // Bright Future (deduped) + Acme = 2 orgs.
    expect(plan.orgCount).toBe(2);
    // info@, admissions@ (Bright Future) + jane.doe@ (Acme) = 3 contacts.
    expect(plan.contactCount).toBe(3);
    expect(plan.rowCount).toBe(3);
  });
});
