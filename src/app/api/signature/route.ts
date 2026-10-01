import { NextResponse } from "next/server";
import { z } from "zod";
import { getSignature, importSignatureFromGmail, saveSignature } from "@/lib/mail/signatureStore";
import { signatureFromText, MAX_SIGNATURE_TEXT } from "@/lib/mail/signature";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/signature — the signature added to every email (or null). */
export async function GET() {
  return NextResponse.json({ signature: await getSignature() });
}

const bodySchema = z.discriminatedUnion("action", [
  /** Read it from a recent email you sent from Gmail. */
  z.object({ action: z.literal("import") }),
  /** Save a plain-text signature you typed (empty clears it). */
  z.object({ action: z.literal("save"), text: z.string().max(MAX_SIGNATURE_TEXT) }),
  z.object({ action: z.literal("clear") }),
]);

/** POST /api/signature — import from Gmail, save typed text, or clear. */
export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request." }, { status: 400 });
  }
  const d = parsed.data;

  if (d.action === "import") {
    // Keep well inside the ~10s serverless limit (connect + login take ~2-3s).
    const res = await importSignatureFromGmail({ deadlineMs: 6500 });
    if (!res.ok) {
      const status = res.code === "not_configured" ? 503 : res.code === "not_found" ? 404 : 502;
      return NextResponse.json({ error: res.reason, code: res.code }, { status });
    }
    return NextResponse.json({
      ok: true,
      signature: res.signature,
      droppedEmbeddedImages: res.droppedEmbeddedImages,
      foundIn: res.foundIn,
    });
  }

  if (d.action === "save") {
    const saved = await saveSignature(signatureFromText(d.text), "manual");
    return NextResponse.json({ ok: true, signature: saved });
  }

  await saveSignature(null);
  return NextResponse.json({ ok: true, signature: null });
}
