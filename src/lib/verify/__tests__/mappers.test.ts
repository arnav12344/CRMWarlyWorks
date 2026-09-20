import { describe, it, expect } from "vitest";
import { mapMillionVerifier } from "../millionverifier";
import { mapZeroBounce } from "../zerobounce";

describe("mapMillionVerifier", () => {
  it("maps result=ok to valid", () => {
    const r = mapMillionVerifier(
      { email: "jane@company.com", result: "ok", quality: "good", free: false, role: false },
      "jane@company.com"
    );
    expect(r.provider).toBe("millionverifier");
    expect(r.deliverability).toBe("valid");
    expect(r.quality).toBe("good");
    expect(r.isFree).toBe(false);
    expect(r.isRole).toBe(false);
  });

  it("maps result=invalid to invalid", () => {
    const r = mapMillionVerifier({ result: "invalid" }, "x@company.com");
    expect(r.deliverability).toBe("invalid");
  });

  it("maps result=catch_all to catch_all + isCatchAll", () => {
    const r = mapMillionVerifier({ result: "catch_all" }, "x@company.com");
    expect(r.deliverability).toBe("catch_all");
    expect(r.isCatchAll).toBe(true);
  });

  it("maps result=disposable to disposable + isDisposable", () => {
    const r = mapMillionVerifier({ result: "disposable" }, "x@mailinator.com");
    expect(r.deliverability).toBe("disposable");
    expect(r.isDisposable).toBe(true);
  });

  it("maps unknown result to unknown", () => {
    const r = mapMillionVerifier({ result: "whatever" }, "x@company.com");
    expect(r.deliverability).toBe("unknown");
  });

  it("provider role=true surfaces as role deliverability when ok", () => {
    const r = mapMillionVerifier({ result: "ok", role: true }, "team@company.com");
    expect(r.isRole).toBe(true);
    expect(r.deliverability).toBe("role");
  });
});

describe("mapZeroBounce", () => {
  it("maps status=valid to valid", () => {
    const r = mapZeroBounce(
      { address: "jane@company.com", status: "valid", sub_status: "", free_email: false },
      "jane@company.com"
    );
    expect(r.provider).toBe("zerobounce");
    expect(r.deliverability).toBe("valid");
  });

  it("maps status=catch-all to catch_all + isCatchAll", () => {
    const r = mapZeroBounce({ status: "catch-all" }, "x@company.com");
    expect(r.deliverability).toBe("catch_all");
    expect(r.isCatchAll).toBe(true);
  });

  it("maps do_not_mail / spamtrap / abuse to invalid", () => {
    expect(mapZeroBounce({ status: "do_not_mail" }, "x@c.com").deliverability).toBe("invalid");
    expect(mapZeroBounce({ status: "spamtrap" }, "x@c.com").deliverability).toBe("invalid");
    expect(mapZeroBounce({ status: "abuse" }, "x@c.com").deliverability).toBe("invalid");
  });

  it("sub_status=role_based marks role", () => {
    const r = mapZeroBounce(
      { status: "valid", sub_status: "role_based" },
      "info@company.com"
    );
    expect(r.isRole).toBe(true);
    expect(r.deliverability).toBe("role");
  });

  it("sub_status=disposable marks disposable", () => {
    const r = mapZeroBounce(
      { status: "invalid", sub_status: "disposable" },
      "x@mailinator.com"
    );
    expect(r.isDisposable).toBe(true);
    expect(r.deliverability).toBe("disposable");
  });

  it("free_email=true sets isFree", () => {
    const r = mapZeroBounce(
      { status: "valid", free_email: true },
      "jane@gmail.com"
    );
    expect(r.isFree).toBe(true);
  });
});
