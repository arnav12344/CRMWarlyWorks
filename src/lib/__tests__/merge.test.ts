import { describe, it, expect } from "vitest";
import {
  renderString,
  renderEmail,
  buildMergeContext,
  extractVariables,
  missingPlaceholder,
} from "../merge";

describe("renderString", () => {
  it("substitutes present variables", () => {
    const r = renderString("Hi {{firstName}} from {{orgName}}", {
      firstName: "Wei",
      orgName: "Rosyth School",
    });
    expect(r.text).toBe("Hi Wei from Rosyth School");
    expect(r.missing).toEqual([]);
  });

  it("renders a visible placeholder for missing variables, never crashes", () => {
    const r = renderString("Hi {{firstName}}, from {{city}}", {
      firstName: "Wei",
    });
    expect(r.text).toBe(`Hi Wei, from ${missingPlaceholder("city")}`);
    expect(r.missing).toContain("city");
  });

  it("treats empty-string values as missing", () => {
    const r = renderString("Hello {{firstName}}", { firstName: "" });
    expect(r.missing).toContain("firstName");
    expect(r.text).toContain("[firstName?]");
  });

  it("tolerates whitespace inside tokens", () => {
    const r = renderString("Hello {{  firstName  }}", { firstName: "Wei" });
    expect(r.text).toBe("Hello Wei");
  });

  it("inserts snippets by label (case-insensitive)", () => {
    const r = renderString(
      "Intro. {{snippet:PSLE Proof}} Regards.",
      {},
      [{ label: "PSLE Proof", body: "Our PSLE English users improved 1.5 grades." }]
    );
    expect(r.text).toContain("improved 1.5 grades");
    expect(r.missingSnippets).toEqual([]);
  });

  it("shows a visible placeholder for a missing snippet", () => {
    const r = renderString("{{snippet:Nope}}", {}, []);
    expect(r.text).toBe("[snippet:Nope?]");
    expect(r.missingSnippets).toContain("Nope");
  });
});

describe("renderEmail", () => {
  it("renders subject + body and aggregates missing vars", () => {
    const r = renderEmail(
      { subject: "For {{orgName}}", body: "Hi {{firstName}}, re {{city}}" },
      { orgName: "Rosyth", firstName: "Wei" }
    );
    expect(r.subject).toBe("For Rosyth");
    expect(r.body).toContain("Hi Wei");
    expect(r.missing).toContain("city");
  });
});

describe("buildMergeContext", () => {
  it("derives firstName from fullName when discrete field is absent", () => {
    const ctx = buildMergeContext({
      fullName: "Wei Ling Tan",
      organization: { name: "Rosyth School", city: "Singapore" },
      contactTypeName: "Schools",
    });
    expect(ctx.firstName).toBe("Wei");
    expect(ctx.orgName).toBe("Rosyth School");
    expect(ctx.city).toBe("Singapore");
    expect(ctx.contactType).toBe("Schools");
  });
});

describe("extractVariables", () => {
  it("lists distinct variables and ignores snippet tokens", () => {
    const vars = extractVariables("{{firstName}} {{orgName}} {{firstName}} {{snippet:X}}");
    expect(vars.sort()).toEqual(["firstName", "orgName"]);
  });
});
