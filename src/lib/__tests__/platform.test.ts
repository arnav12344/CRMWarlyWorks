import { describe, it, expect, vi } from "vitest";
import { dayRange } from "../time";
import { readMailConfig, formatFrom, ownAddresses } from "../mail/config";
import { FakeMailer, cleanMessageId } from "../mail/mailer";
import { demoSeedBlockedReason, toDemoDomain } from "../seed/guard";
import { createTickHandler, secretMatches } from "../cron";
import { buildBulkDrafts, type BulkContact } from "../bulk";
import { chunkRanges, chunk, nextOffset } from "../import/chunk";
import { renderString } from "../merge";

describe("dayRange (Singapore day on a UTC server)", () => {
  it("00:30 SGT belongs to the same SGT day, not the previous UTC day", () => {
    // 2026-01-01 00:30 SGT == 2025-12-31 16:30 UTC
    const { start, end } = dayRange(new Date("2025-12-31T16:30:00Z"));
    expect(start.toISOString()).toBe("2025-12-31T16:00:00.000Z");
    expect(end.toISOString()).toBe("2026-01-01T16:00:00.000Z");
  });

  it("23:59 SGT is still the same day", () => {
    const { start } = dayRange(new Date("2026-01-01T15:59:00Z"));
    expect(start.toISOString()).toBe("2025-12-31T16:00:00.000Z");
  });
});

describe("mail config", () => {
  it("returns null when credentials are missing", () => {
    expect(readMailConfig({})).toBeNull();
    expect(readMailConfig({ GMAIL_USER: "x@gmail.com" })).toBeNull();
  });

  it("parses env, strips app-password spaces, and formats From", () => {
    const cfg = readMailConfig({
      GMAIL_USER: "arnav@gmail.com",
      GMAIL_APP_PASSWORD: "abcd efgh ijkl mnop",
      MAIL_FROM_ADDRESS: "a@warlyworks.com",
      MAIL_FROM_NAME: 'Arnav "WarlyWorks"',
    });
    expect(cfg?.appPassword).toBe("abcdefghijklmnop");
    expect(formatFrom(cfg!)).toBe('"Arnav WarlyWorks" <a@warlyworks.com>');
    expect(ownAddresses(cfg)).toEqual(["arnav@gmail.com", "a@warlyworks.com"]);
  });

  it("defaults From to the Gmail user", () => {
    const cfg = readMailConfig({ GMAIL_USER: "me@gmail.com", GMAIL_APP_PASSWORD: "x" });
    expect(cfg?.fromAddress).toBe("me@gmail.com");
  });

  it("FakeMailer records what it sent", async () => {
    const m = new FakeMailer();
    await m.send({ to: "a@b.com", subject: "S", text: "T" });
    expect(m.sent).toHaveLength(1);
    expect(m.sent[0].subject).toBe("S");
  });

  it("cleanMessageId strips brackets and lowercases", () => {
    expect(cleanMessageId(" <ABC@X.com> ")).toBe("abc@x.com");
    expect(cleanMessageId("")).toBeNull();
  });
});

describe("demo seed guard", () => {
  it("blocks without ALLOW_DEMO_SEED=1 and in production", () => {
    expect(demoSeedBlockedReason({})).toMatch(/ALLOW_DEMO_SEED/);
    expect(demoSeedBlockedReason({ ALLOW_DEMO_SEED: "1", NODE_ENV: "production" })).toMatch(/production/);
    expect(demoSeedBlockedReason({ ALLOW_DEMO_SEED: "1" })).toBeNull();
  });

  it("maps demo domains to the reserved .example TLD", () => {
    expect(toDemoDomain("rivervaleprimary.edu.sg")).toBe("rivervaleprimary.example");
  });
});

describe("cron tick handler", () => {
  const deps = () => ({
    secret: "s3cret",
    advance: vi.fn().mockResolvedValue({ createdMessageIds: ["a"], stoppedEnrollmentIds: [] }),
    release: vi.fn().mockResolvedValue({ sent: 3 }),
    sync: vi.fn().mockResolvedValue({ replies: 2 }),
  });

  it("401 without the secret; engines not called", async () => {
    const d = deps();
    const res = await createTickHandler(d)(new Request("http://x/api/cron/tick", { method: "POST" }));
    expect(res.status).toBe(401);
    expect(d.advance).not.toHaveBeenCalled();
  });

  it("runs advance then sync with a valid secret", async () => {
    const d = deps();
    const res = await createTickHandler(d)(
      new Request("http://x/api/cron/tick", { method: "POST", headers: { authorization: "Bearer s3cret" } })
    );
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.drafted).toBe(1);
    expect(body.released).toEqual({ sent: 3 });
    expect(body.inbox).toEqual({ replies: 2 });
    expect(body.steps).toEqual(["advance", "release", "sync"]);
  });

  it("secretMatches rejects empty/mismatched secrets", () => {
    expect(secretMatches("a", undefined)).toBe(false);
    expect(secretMatches(null, "a")).toBe(false);
    expect(secretMatches("ab", "abc")).toBe(false);
    expect(secretMatches("abc", "abc")).toBe(true);
  });
});

describe("bulk drafts", () => {
  const base: Omit<BulkContact, "id" | "email"> = {
    suppressed: false,
    firstName: null,
    lastName: null,
    fullName: null,
    title: null,
    organization: { name: "Rosyth School", city: "Singapore", country: "SG" },
  };
  const contacts: BulkContact[] = [
    { ...base, id: "a", email: "wei@rosyth.edu.sg", firstName: "Wei" },
    { ...base, id: "b", email: "info@rosyth.edu.sg" },
    { ...base, id: "c", email: null },
    { ...base, id: "d", email: "gone@x.sg" },
    { ...base, id: "e", email: "demo@school.example" },
    { ...base, id: "f", email: "ok@y.sg", suppressed: true },
  ];

  it("renders snippets + fallbacks, skips suppressed / no-email / demo, reports missing vars", () => {
    const r = buildBulkDrafts({
      contacts,
      template: { subject: "Hi {{firstName|there}}", body: "{{orgName}} — {{snippet:Proof}} {{title}}" },
      snippets: [{ label: "Proof", body: "It works." }],
      suppressedEmails: new Set(["gone@x.sg"]),
    });
    expect(r.drafts.map((d) => d.contactId)).toEqual(["a", "b"]);
    expect(r.drafts[0].subject).toBe("Hi Wei");
    expect(r.drafts[1].subject).toBe("Hi there");
    expect(r.drafts[0].body).toContain("Rosyth School — It works.");
    expect(r.drafts[0].missing).toEqual(["title"]);
    expect(r.skipped.map((s) => s.reason).sort()).toEqual(["demo address", "no email", "suppressed", "suppressed"]);
  });

  it("skips contacts already in Ready to send", () => {
    const r = buildBulkDrafts({
      contacts: contacts.slice(0, 1),
      template: { subject: "S", body: "B" },
      snippets: [],
      suppressedEmails: new Set(),
      alreadyQueued: new Set(["a"]),
    });
    expect(r.drafts).toHaveLength(0);
    expect(r.skipped[0].reason).toMatch(/already/);
  });
});

describe("chunking", () => {
  it("chunkRanges splits into windows", () => {
    expect(chunkRanges(95, 40)).toEqual([
      { offset: 0, limit: 40 },
      { offset: 40, limit: 40 },
      { offset: 80, limit: 15 },
    ]);
    expect(chunkRanges(0, 10)).toEqual([]);
  });

  it("chunk + nextOffset", () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(nextOffset(0, 40, 95)).toBe(40);
    expect(nextOffset(80, 15, 95)).toBeNull();
  });
});

describe("merge fallbacks", () => {
  it("{{var|fallback}} uses the fallback only when empty", () => {
    expect(renderString("Hi {{firstName|there}}", { firstName: "Wei" }).text).toBe("Hi Wei");
    const r = renderString("Hi {{firstName|there}}", {});
    expect(r.text).toBe("Hi there");
    expect(r.missing).toEqual([]);
  });
});
