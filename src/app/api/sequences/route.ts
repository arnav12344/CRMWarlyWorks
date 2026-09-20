import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

const stepSchema = z.object({
  dayOffset: z.number().int().min(0),
  templateId: z.string().nullable().optional(),
  stopOnReply: z.boolean().optional().default(true),
});

const upsertSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1),
  isActive: z.boolean().optional().default(true),
  steps: z.array(stepSchema).min(1),
});

export async function GET() {
  const sequences = await prisma.sequence.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      steps: { orderBy: { order: "asc" }, include: { template: true } },
      _count: { select: { enrollments: true } },
    },
  });
  return NextResponse.json({ sequences });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = upsertSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid sequence." }, { status: 400 });
  }
  const { id, name, isActive, steps } = parsed.data;

  if (id) {
    // Replace steps wholesale for simplicity.
    await prisma.sequenceStep.deleteMany({ where: { sequenceId: id } });
    await prisma.sequence.update({ where: { id }, data: { name, isActive } });
    await prisma.sequenceStep.createMany({
      data: steps.map((s, i) => ({
        sequenceId: id,
        order: i,
        dayOffset: s.dayOffset,
        templateId: s.templateId ?? null,
        stopOnReply: s.stopOnReply ?? true,
      })),
    });
    const sequence = await prisma.sequence.findUnique({
      where: { id },
      include: { steps: { orderBy: { order: "asc" } } },
    });
    return NextResponse.json({ sequence });
  }

  const sequence = await prisma.sequence.create({
    data: {
      name,
      isActive,
      steps: {
        create: steps.map((s, i) => ({
          order: i,
          dayOffset: s.dayOffset,
          templateId: s.templateId ?? null,
          stopOnReply: s.stopOnReply ?? true,
        })),
      },
    },
    include: { steps: { orderBy: { order: "asc" } } },
  });
  return NextResponse.json({ sequence });
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id." }, { status: 400 });
  await prisma.sequence.delete({ where: { id } }).catch(() => undefined);
  return NextResponse.json({ ok: true });
}
