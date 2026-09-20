import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

/** Move a contact to a (configurable) pipeline stage. */
const schema = z.object({
  contactId: z.string().min(1),
  pipelineStageId: z.string().min(1).nullable(),
});

export async function POST(request: Request) {
  const raw = await request.json().catch(() => null);
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  }
  const { contactId, pipelineStageId } = parsed.data;

  const stage = pipelineStageId
    ? await prisma.pipelineStage.findUnique({ where: { id: pipelineStageId } })
    : null;

  await prisma.contact.update({
    where: { id: contactId },
    data: { pipelineStageId: pipelineStageId ?? null },
  });
  await prisma.activity.create({
    data: {
      contactId,
      type: "stage_changed",
      summary: `Moved to stage: ${stage?.name ?? "None"}`,
    },
  });
  return NextResponse.json({ ok: true });
}
