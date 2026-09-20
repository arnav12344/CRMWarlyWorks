import { describe, it, expect } from "vitest";
import {
  extractRow,
  flattenScraperRows,
  tryParseJson,
} from "../extractNestedJson";
import { scraperRows, FAKE_API_KEY } from "./fixtures";

describe("extractNestedJson", () => {
  it("parses JSON strings and ignores non-JSON", () => {
    expect(tryParseJson('{"a":1}')).toEqual({ a: 1 });
    expect(tryParseJson("[1,2]")).toEqual([1, 2]);
    expect(tryParseJson("just text")).toBeUndefined();
    expect(tryParseJson("")).toBeUndefined();
  });

  it("pulls a business out of a nested `data` JSON blob", () => {
    const row = scraperRows[1];
    const { businesses, hadNestedJson } = extractRow(row);
    expect(hadNestedJson).toBe(true);
    expect(businesses).toHaveLength(1);
    expect(businesses[0].name).toBe("Bright Future Learning");
    expect(businesses[0].website).toBe("https://www.brightfuture.sg/contact");
    expect(businesses[0].email).toBe("info@brightfuture.sg");
  });

  it("pulls multiple businesses and normalizes aliased field names", () => {
    const row = scraperRows[2];
    const { businesses } = extractRow(row);
    // Bright Future (Jurong) + Acme Educators
    expect(businesses).toHaveLength(2);
    const acme = businesses.find((b) => b.name === "Acme Educators Pte Ltd");
    expect(acme).toBeDefined();
    expect(acme?.website).toBe("https://acme-educators.com"); // from `url`
    expect(acme?.email).toBe("jane.doe@acme-educators.com"); // from `contact_email`
    expect(acme?.fullName).toBe("Jane Doe"); // from `contact_person`
    expect(acme?.title).toBe("Principal"); // from `job_title`
  });

  it("flattens parent + subtask rows into per-business candidates", () => {
    const { candidates, rowsWithNestedJson } = flattenScraperRows(scraperRows);
    // Parent job row yields nothing; three businesses come from the subtasks.
    const names = candidates.map((c) => c.name);
    expect(names).toContain("Bright Future Learning");
    expect(names).toContain("Bright Future Learning (Jurong)");
    expect(names).toContain("Acme Educators Pte Ltd");
    expect(candidates).toHaveLength(3);
    // All three rows had JSON columns (parent metadata + two subtasks).
    expect(rowsWithNestedJson).toBe(3);
  });

  it("never surfaces a secret value from any JSON column", () => {
    const { candidates } = flattenScraperRows(scraperRows);
    const serialized = JSON.stringify(candidates);
    expect(serialized).not.toContain(FAKE_API_KEY);
  });
});
