import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import {
  verifyContact,
  verifyContacts,
  verificationMode,
  estimateCredits,
} from "@/lib/verify/service";
import { loadProviderKeys } from "@/lib/verify/settings";
import { fetchCredits } from "@/lib/verify/credits";

export const runtime = "nodejs";

/**
 * GET /api/verify?count=N — verification mode, remaining provider credits and
 * the credit cost of checking N addresses. Used for the confirm dialog.
 */
export async function GET(request: Request) {
  const count = Number(new URL(request.url).searchParams.get("count") ?? "0") || 0;
  const keys = await loadProviderKeys();
  const mode = verificationMode(keys);
  const credits = mode === "live" ? await fetchCredits(keys) : { millionverifier: null, zerobounce: null };
  return NextResponse.json({
    mode,
    providers: {
      millionverifier: Boolean(keys.millionverifier),
      zerobounce: Boolean(keys.zerobounce),
    },
    credits,
    cost: estimateCredits(count, keys),
  });
}

/**
 * POST /api/verify
 * Body: { contactId, force? } OR { contactIds: string[] } (max 25 per request).
 * Already-verified contacts are skipped (no credits spent) unless force=true.
 */
const singleSchema = z.object({ contactId: z.string().min(1), force: z.boolean().optional() });
const batchSchema = z.object({ contactIds: z.array(z.string().min(1)).min(1).max(25) });

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Expected a JSON body." }, { status: 400 });
  }

  const batch = batchSchema.safeParse(body);
  if (batch.success) {
    const summary = await verifyContacts(batch.data.contactIds);
    if (summary.mode === "disabled") {
      return NextResponse.json(
        { error: "Add a MillionVerifier or ZeroBounce key in Settings to verify emails.", ...summary },
        { status: 409 }
      );
    }
    return NextResponse.json({ kind: "batch", ...summary });
  }

  const single = singleSchema.safeParse(body);
  if (single.success) {
    const keys = await loadProviderKeys();
    if (verificationMode(keys) === "disabled") {
      return NextResponse.json(
        { error: "Add a MillionVerifier or ZeroBounce key in Settings to verify emails." },
        { status: 409 }
      );
    }
    const exists = await prisma.contact.findUnique({ where: { id: single.data.contactId }, select: { id: true } });
    if (!exists) return NextResponse.json({ error: "Contact not found." }, { status: 404 });
    const outcome = await verifyContact(single.data.contactId, keys, { force: single.data.force });
    return NextResponse.json({ kind: "single", ...(outcome ?? {}), verified: Boolean(outcome) });
  }

  return NextResponse.json(
    { error: "Provide { contactId } or { contactIds: [...] } (max 25)." },
    { status: 400 }
  );
}
