import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { readMailConfig } from "@/lib/mail/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/health — DB reachability + whether mail is configured. No secrets. */
export async function GET() {
  let db: "ok" | "error" = "ok";
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    db = "error";
  }
  return NextResponse.json(
    { db, mailConfigured: readMailConfig() !== null },
    { status: db === "ok" ? 200 : 503 }
  );
}
