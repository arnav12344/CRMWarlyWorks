import Link from "next/link";
import { ArrowRight, KeyRound, ShieldCheck } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { prisma } from "@/lib/db";
import { loadProviderKeys } from "@/lib/verify/settings";
import { verificationMode } from "@/lib/verify/service";
import { VerificationQueue, type QueueContact } from "./VerificationQueue";

export const dynamic = "force-dynamic";

/**
 * Step 2: verify emails. Only unchecked addresses are sent to the provider,
 * so free-tier credits are never spent twice on the same address.
 */
export default async function VerificationPage() {
  const keys = await loadProviderKeys();
  const mode = verificationMode(keys);

  const [contacts, unverifiedCount, leadsWithoutEmail] = await Promise.all([
    prisma.contact.findMany({
      where: { email: { not: null } },
      orderBy: [{ verificationConsensus: { sort: "asc", nulls: "first" } }, { createdAt: "desc" }],
      take: 500,
      include: {
        organization: { select: { name: true } },
        verifications: { orderBy: { checkedAt: "desc" } },
      },
    }),
    prisma.contact.count({ where: { email: { not: null }, verificationConsensus: null, suppressed: false } }),
    prisma.contact.count({ where: { email: null } }),
  ]);

  const rows: QueueContact[] = contacts.map((c) => {
    const latestFor = (provider: string) => c.verifications.find((v) => v.provider === provider) ?? null;
    const mv = latestFor("millionverifier") ?? latestFor("mock");
    const zb = latestFor("zerobounce");
    return {
      id: c.id,
      email: c.email ?? "",
      fullName: c.fullName || [c.firstName, c.lastName].filter(Boolean).join(" ") || null,
      organization: c.organization?.name ?? null,
      isRoleInbox: c.isRoleInbox,
      suppressed: c.suppressed,
      verificationConsensus: c.verificationConsensus,
      mailboxType: c.mailboxType,
      likelyIndividual: c.likelyIndividual,
      verifiedAt: c.verifications[0]?.checkedAt?.toISOString() ?? null,
      millionverifier: mv ? { result: mv.result, quality: mv.quality, mocked: mv.provider === "mock" } : null,
      zerobounce: zb ? { result: zb.result, quality: zb.quality, mocked: false } : null,
    };
  });

  return (
    <>
      <PageHeader
        eyebrow="Step 2 of 4"
        title="Verify emails"
        description="Check addresses before sending so you don't bounce (bounces hurt your Gmail reputation). Only unchecked addresses use credits."
        actions={
          <Link href="/send">
            <Button size="lg" variant="secondary">
              Next: write &amp; send <ArrowRight className="h-4 w-4" aria-hidden />
            </Button>
          </Link>
        }
      />

      {mode === "disabled" ? (
        <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <KeyRound className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
          <p>
            <span className="font-semibold">Add a verification key to continue.</span> Paste your MillionVerifier or
            ZeroBounce API key in{" "}
            <Link href="/settings" className="font-semibold underline">
              Settings
            </Link>
            . Results are never guessed for real outreach.
          </p>
        </div>
      ) : mode === "mock" ? (
        <div className="flex items-start gap-3 rounded-2xl border border-gray-200 bg-white p-4 text-sm text-gray-800">
          <KeyRound className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" aria-hidden />
          <p>
            <span className="font-semibold">Dev mode:</span> no verifier key, so an offline heuristic is used. In
            production this is disabled until you add a key in{" "}
            <Link href="/settings" className="font-semibold underline">
              Settings
            </Link>
            .
          </p>
        </div>
      ) : null}

      {leadsWithoutEmail > 0 ? (
        <p className="rounded-2xl border border-gray-200 bg-white p-4 text-sm text-gray-700">
          {leadsWithoutEmail} lead{leadsWithoutEmail === 1 ? " has" : "s have"} no email address, so{" "}
          {leadsWithoutEmail === 1 ? "it isn't" : "they aren't"} listed here. You can still see{" "}
          {leadsWithoutEmail === 1 ? "its" : "their"} phone and website in{" "}
          <Link href="/leads" className="font-semibold underline">
            Leads
          </Link>
          .
        </p>
      ) : null}

      {rows.length === 0 ? (
        <EmptyState
          icon={<ShieldCheck className="h-5 w-5" aria-hidden />}
          title="No emails to verify yet"
          description={
            leadsWithoutEmail
              ? "None of your leads have an email address yet. Import a list that includes an email column."
              : "Import leads first (Step 1), then come back to check their addresses."
          }
          action={
            <Link href="/import">
              <Button>Import leads</Button>
            </Link>
          }
        />
      ) : (
        <VerificationQueue contacts={rows} mode={mode} unverifiedCount={unverifiedCount} />
      )}
    </>
  );
}
