import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { syncInbox } from "@/lib/mail/inbox";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/inbox/sync — "Check replies now" button. Small time budget. */
export async function POST() {
  // Stay well inside Netlify's 10s function limit; the rest syncs next time.
  const result = await syncInbox(prisma, { deadlineMs: 4500 });
  return NextResponse.json(result, { status: result.configured ? 200 : 503 });
}
