import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

/**
 * GET /api/contact-types
 * Returns the active, data-driven contact types (schools, NGOs, funders, ...)
 * used to tag imported organizations. These are NOT hardcoded — they live in
 * the ContactType table and are editable.
 */
export async function GET() {
  const types = await prisma.contactType.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true, color: true },
  });
  return NextResponse.json({ contactTypes: types });
}

/**
 * POST /api/contact-types
 * Create a new contact type (tag) on the fly — used from the import wizard so
 * the user can tag a fresh list without leaving the flow. Names are unique
 * (case-insensitive); if the name already exists we return the existing type
 * instead of erroring, and re-activate it if it had been archived.
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  if (!name) {
    return NextResponse.json({ error: "Provide a name for the tag." }, { status: 400 });
  }
  if (name.length > 60) {
    return NextResponse.json({ error: "Tag name is too long (max 60 characters)." }, { status: 400 });
  }

  const existing = await prisma.contactType.findFirst({
    where: { name: { equals: name, mode: "insensitive" } },
    select: { id: true, name: true, color: true, isActive: true },
  });
  if (existing) {
    if (!existing.isActive) {
      await prisma.contactType.update({ where: { id: existing.id }, data: { isActive: true } });
    }
    return NextResponse.json({
      contactType: { id: existing.id, name: existing.name, color: existing.color },
      created: false,
    });
  }

  const created = await prisma.contactType.create({
    data: { name },
    select: { id: true, name: true, color: true },
  });
  return NextResponse.json({ contactType: created, created: true });
}
