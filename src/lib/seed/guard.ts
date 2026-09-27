/**
 * Safety guard for the DEMO seed (`npm run seed`), which wipes data and loads
 * fake contacts. It must never run against production by accident.
 */
export function demoSeedBlockedReason(env: Record<string, string | undefined>): string | null {
  if (env.NODE_ENV === "production") {
    return "Refusing to run the demo seed with NODE_ENV=production.";
  }
  if (env.ALLOW_DEMO_SEED !== "1") {
    return (
      "The demo seed WIPES contacts/messages and loads fake data. " +
      "Set ALLOW_DEMO_SEED=1 to confirm (only against your dev schema). " +
      "For production config data use `npm run seed:config` instead."
    );
  }
  return null;
}

/**
 * Demo contacts must never receive real mail. Map any demo domain onto the
 * reserved `.example` TLD (RFC 2606) — e.g. rivervaleprimary.edu.sg ->
 * rivervaleprimary.example.
 */
export function toDemoDomain(domain: string): string {
  const first = domain.toLowerCase().split(".")[0] || "demo";
  return `${first}.example`;
}
