import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

const upsertSchema = z.object({
  id: z.string().optional(),
  label: z.string().min(1),
  category: z.string().optional().nullable(),
  body: z.string().min(1),
});

export async function GET() {
  const snippets = await prisma.snippet.findMany({ orderBy: { createdAt: "desc" } });
  return NextResponse.json({ snippets });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = upsertSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid snippet." }, { status: 400 });
  }
  const { id, label, category, body: snippetBody } = parsed.data;
  const data = { label, category: category ?? null, body: snippetBody };
  const snippet = id
    ? await prisma.snippet.update({ where: { id }, data })
    : await prisma.snippet.create({ data });
  return NextResponse.json({ snippet });
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id." }, { status: 400 });
  await prisma.snippet.delete({ where: { id } }).catch(() => undefined);
  return NextResponse.json({ ok: true });
}
