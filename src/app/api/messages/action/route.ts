import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import {
  approveMessage,
  rejectMessage,
  simulateSend,
  simulateEvent,
} from "@/lib/outreach";

export const runtime = "nodejs";

/**
 * Queue + tracking actions on a message.
 * action: approve | send | reject | open | reply | bounce
 * Sending and all events are SIMULATED (no real SMTP).
 */
const schema = z.object({
  messageId: z.string().min(1),
  action: z.enum(["approve", "send", "reject", "open", "reply", "bounce"]),
});

export async function POST(request: Request) {
  const raw = await request.json().catch(() => null);
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid action." }, { status: 400 });
  }
  const { messageId, action } = parsed.data;

  switch (action) {
    case "approve": {
      const res = await approveMessage(prisma, messageId);
      return NextResponse.json(res, { status: res.ok ? 200 : 422 });
    }
    case "send": {
      const res = await simulateSend(prisma, messageId);
      return NextResponse.json(res, { status: res.ok ? 200 : 422 });
    }
    case "reject": {
      const res = await rejectMessage(prisma, messageId);
      return NextResponse.json(res, { status: res.ok ? 200 : 422 });
    }
    case "open":
    case "reply":
    case "bounce": {
      const res = await simulateEvent(prisma, messageId, action);
      return NextResponse.json(res, { status: res.ok ? 200 : 422 });
    }
  }
}
