import { describe, it, expect } from "vitest";
import { buildImportPlan, parseEmailList, MAX_EMAILS_PER_ORG } from "../runImport";
import { autoGuessMapping } from "../mapping";

// Shape of the Google-Maps scraper "overview" CSV the user imported:
// plural `emails` (comma-separated) + `recommended_emails`, no singular `email`.
const HEADERS = ["place_id", "name", "website", "phone", "emails", "recommended_emails", "owner_name", "categories", "address"];

const rows: Record<string, unknown>[] = [
  {
    place_id: "a",
    name: "I Can Read Sembawang (Sun Plaza)",
    website: "https://sg.icanread.asia/",
    phone: "+65 6257 0167",
    emails: Array.from({ length: 24 }, (_, i) => `branch${i}@icanread.asia`).join(", ") + ", logo@2x.png",
    recommended_emails: "sembawang@icanread.asia",
    owner_name: "I Can Read (owner)",
    categories: "Tutoring service",
    address: "30 Sembawang Dr",
  },
  {
    place_id: "b",
    name: "Yishun Primary School",
    website: "https://yishunpri.moe.edu.sg/",
    phone: "+65 6257 1234",
    emails: "Yishun_PS@moe.edu.sg; general@yishunpri.moe.edu.sg",
    recommended_emails: "",
    owner_name: "",
    categories: "Primary school",
    address: "500 Yishun Ring Rd",
  },
  {
    place_id: "c",
    name: "Sembawang Shopping Centre",
    website: "http://www.sembawangsc.com.sg/",
    phone: "+65 6757 8000",
    emails: "",
    recommended_emails: "",
    owner_name: "Sembawang Shopping Centre (owner)",
    categories: "Shopping Centre",
    address: "604 Sembawang Rd",
  },
];

describe("scraper exports with plural email columns", () => {
  it("auto-maps the plural `emails` / `recommended_emails` column", () => {
    expect(autoGuessMapping(HEADERS).contactEmail).toMatch(/emails/);
  });

  it("parseEmailList splits, normalizes, dedupes and drops junk", () => {
    expect(parseEmailList("A@x.sg, a@x.sg; b@y.com  logo@2x.png junk")).toEqual(["a@x.sg", "b@y.com"]);
    expect(parseEmailList("")).toEqual([]);
  });

  const plan = buildImportPlan(rows, { mapping: autoGuessMapping(HEADERS), contactTypeId: null });
  const byName = (n: string) => plan.orgs.find((o) => o.name === n)!;

  it("creates one contact per email, recommended first, capped per org", () => {
    const icr = byName("I Can Read Sembawang (Sun Plaza)");
    expect(icr.contacts[0].email).toBe("sembawang@icanread.asia");
    expect(icr.contacts).toHaveLength(MAX_EMAILS_PER_ORG);
    expect(icr.contacts.some((c) => c.email?.endsWith(".png"))).toBe(false);

    const school = byName("Yishun Primary School");
    expect(school.contacts.map((c) => c.email)).toEqual(["yishun_ps@moe.edu.sg", "general@yishunpri.moe.edu.sg"]);
    expect(school.contacts[1].isRoleInbox).toBe(true);
  });

  it("keeps organizations without any email (they become 'no email' leads)", () => {
    const mall = byName("Sembawang Shopping Centre");
    expect(mall).toBeTruthy();
    expect(mall.contacts.every((c) => !c.email)).toBe(true);
  });

  it("counts the planned contacts", () => {
    expect(plan.orgCount).toBe(3);
    expect(plan.contactCount).toBeGreaterThanOrEqual(MAX_EMAILS_PER_ORG + 2);
  });
});
