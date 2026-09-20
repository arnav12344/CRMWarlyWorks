import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardContent } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { ShieldCheck, KeyRound } from "lucide-react";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { loadProviderKeys } from "@/lib/verify/settings";
import { hasAnyLiveKey } from "@/lib/verify/service";
import { VerificationQueue, type QueueContact } from "./VerificationQueue";

export const dynamic = "force-dynamic";

/**
 * Verification review queue.
 *
 * Server component: loads contacts with emails plus their latest per-provider
 * verification rows, then hands off to a client table for the Verify /
 * Re-verify / Suppress actions.
 */
export default async function VerificationPage() {
  const keys = await loadProviderKeys();
  const liveMode = hasAnyLiveKey(keys);

  const contacts = await prisma.contact.findMany({
    where: { email: { not: null } },
    orderBy: [{ likelyIndividual: "desc" }, { createdAt: "desc" }],
    take: 200,
    include: {
      organization: { select: { name: true } },
      verifications: { orderBy: { checkedAt: "desc" } },
    },
  });

  const rows: QueueContact[] = contacts.map((c) => {
    const latestFor = (provider: string) =>
      c.verifications.find((v) => v.provider === provider) ?? null;
    const mv = latestFor("millionverifier") ?? latestFor("mock");
    const zb = latestFor("zerobounce");
    return {
      id: c.id,
      email: c.email ?? "",
      fullName:
        c.fullName ||
        [c.firstName, c.lastName].filter(Boolean).join(" ") ||
        null,
      organization: c.organization?.name ?? null,
      isRoleInbox: c.isRoleInbox,
      suppressed: c.suppressed,
      verificationConsensus: c.verificationConsensus,
      mailboxType: c.mailboxType,
      likelyIndividual: c.likelyIndividual,
      verifiedAt: c.verifications[0]?.checkedAt?.toISOString() ?? null,
      millionverifier: mv
        ? { result: mv.result, quality: mv.quality, mocked: mv.provider === "mock" }
        : null,
      zerobounce: zb ? { result: zb.result, quality: zb.quality, mocked: false } : null,
    };
  });

  return (
    <>
      <PageHeader
        title="Verification"
        description="Cross-check email deliverability with MillionVerifier and ZeroBounce. Falls back to manual/mock verification when API keys are absent."
      />

      {!liveMode ? (
        <div className="mb-5 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          <KeyRound className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <p className="font-semibold">Mock mode — no provider keys configured</p>
            <p className="mt-1">
              Verification is running with the built-in offline heuristic
              verifier so nothing breaks. Add your MillionVerifier and ZeroBounce
              keys in{" "}
              <Link href="/settings" className="font-medium underline">
                Settings
              </Link>{" "}
              to run real cross-checks.
            </p>
          </div>
        </div>
      ) : null}

      {rows.length === 0 ? (
        <Card>
          <CardContent>
            <EmptyState
              icon={<ShieldCheck className="h-5 w-5" />}
              title="No contacts to verify yet"
              description="Import contacts first, then queue their addresses to check quality, role inboxes, and catch-all domains."
            />
          </CardContent>
        </Card>
      ) : (
        <VerificationQueue contacts={rows} liveMode={liveMode} />
      )}
    </>
  );
}
