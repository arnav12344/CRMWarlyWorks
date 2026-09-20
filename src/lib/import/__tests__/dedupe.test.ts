import { describe, it, expect } from "vitest";
import {
  computeDedupeKey,
  dedupeOrganizations,
  normalizeDomain,
} from "../dedupe";

describe("dedupe", () => {
  it("normalizes domains from urls and emails", () => {
    expect(normalizeDomain("https://www.brightfuture.sg/contact")).toBe(
      "brightfuture.sg"
    );
    expect(normalizeDomain("http://brightfuture.sg")).toBe("brightfuture.sg");
    expect(normalizeDomain("info@brightfuture.sg")).toBe("brightfuture.sg");
    expect(normalizeDomain("not a domain")).toBeUndefined();
  });

  it("prefers domain key, falls back to name+city", () => {
    expect(computeDedupeKey({ website: "https://acme.com" })).toBe("domain:acme.com");
    expect(computeDedupeKey({ name: "Acme", city: "Singapore" })).toBe(
      "name:acme|city:singapore"
    );
    expect(computeDedupeKey({})).toBeNull();
  });

  it("merges same-domain organizations from multiple scraper subtask rows", () => {
    const candidates = [
      {
        name: "Bright Future Learning",
        website: "https://www.brightfuture.sg/contact",
        city: "Singapore",
        phone: "+65 6123 4567",
      },
      {
        name: "Bright Future Learning (Jurong)",
        website: "http://brightfuture.sg",
        email: "admissions@brightfuture.sg",
        city: "Jurong",
      },
    ];
    const result = dedupeOrganizations(candidates);
    expect(result).toHaveLength(1);
    expect(result[0].dedupeKey).toBe("domain:brightfuture.sg");
    expect(result[0].mergedCount).toBe(2);
    // First-seen name wins; the email gap is filled by the second row.
    expect(result[0].record.name).toBe("Bright Future Learning");
    expect(result[0].record.email).toBe("admissions@brightfuture.sg");
    expect(result[0].record.phone).toBe("+65 6123 4567");
  });

  it("keeps distinct domains separate", () => {
    const result = dedupeOrganizations([
      { name: "A", website: "https://a.com" },
      { name: "B", website: "https://b.com" },
    ]);
    expect(result).toHaveLength(2);
  });
});
