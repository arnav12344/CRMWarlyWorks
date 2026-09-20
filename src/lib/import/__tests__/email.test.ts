import { describe, it, expect } from "vitest";
import { isRoleInbox, emailDomain, ROLE_INBOX_LOCALPARTS } from "../email";

describe("email helpers", () => {
  it("derives the email domain", () => {
    expect(emailDomain("Jane.Doe@Acme-Educators.com")).toBe("acme-educators.com");
    expect(emailDomain("noatsign")).toBeUndefined();
    expect(emailDomain(null)).toBeUndefined();
  });

  it("flags role inboxes as such", () => {
    for (const local of ["info", "admissions", "enquiry", "hello", "contact", "admin", "office"]) {
      expect(isRoleInbox(`${local}@brightfuture.sg`)).toBe(true);
    }
    expect(ROLE_INBOX_LOCALPARTS.has("admissions")).toBe(true);
  });

  it("does not flag named individual addresses", () => {
    expect(isRoleInbox("jane.doe@acme-educators.com")).toBe(false);
    expect(isRoleInbox("john@brightfuture.sg")).toBe(false);
    expect(isRoleInbox("")).toBe(false);
  });
});
