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
