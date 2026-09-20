import { NextResponse } from "next/server";
import { z } from "zod";
import { verifyContact, verifyContacts } from "@/lib/verify/service";

export const runtime = "nodejs";

/**
 * POST /api/verify
 *
 * Verify one contact or a batch of contacts across the configured providers
 * (with mock fallback). Never throws for missing keys / provider errors.
 *
 * Body (JSON): { contactId: string } OR { contactIds: string[] }
 */
const singleSchema = z.object({ contactId: z.string().min(1) });
const batchSchema = z.object({ contactIds: z.array(z.string().min(1)).min(1) });

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
    return NextResponse.json({ mode: "batch", ...summary });
  }

  const single = singleSchema.safeParse(body);
  if (single.success) {
    const outcome = await verifyContact(single.data.contactId);
    if (!outcome) {
      return NextResponse.json({ error: "Contact not found." }, { status: 404 });
    }
    return NextResponse.json({ mode: "single", ...outcome });
  }

  return NextResponse.json(
    { error: "Provide { contactId } or { contactIds: [...] }." },
    { status: 400 }
  );
}
