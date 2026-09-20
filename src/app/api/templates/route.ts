import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { extractVariables } from "@/lib/merge";

export const runtime = "nodejs";

const upsertSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1),
  subject: z.string().min(1),
  body: z.string().min(1),
});

export async function GET() {
  const templates = await prisma.template.findMany({ orderBy: { createdAt: "desc" } });
  return NextResponse.json({ templates });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = upsertSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid template." }, { status: 400 });
  }
  const { id, name, subject, body: templateBody } = parsed.data;
  const variables = JSON.stringify([
    ...new Set([...extractVariables(subject), ...extractVariables(templateBody)]),
  ]);
  const data = { name, subject, body: templateBody, variables };
  const template = id
    ? await prisma.template.update({ where: { id }, data })
    : await prisma.template.create({ data });
  return NextResponse.json({ template });
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id." }, { status: 400 });
  await prisma.template.delete({ where: { id } }).catch(() => undefined);
  return NextResponse.json({ ok: true });
}
