/**
 * The scheduled "tick" (every 10 minutes via netlify/functions/tick.mts):
 *   1. draft any sequence steps that are now due into Ready to send
 *   2. sync the Gmail inbox for replies / bounces / opt-outs
 *
 * The handler is built from injected functions so it is unit-testable without
 * a database or mailbox. It is protected by CRON_SECRET.
 */
import { timingSafeEqual } from "node:crypto";

export function secretMatches(provided: string | null | undefined, expected: string | undefined): boolean {
  if (!expected || !provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Read the secret from `Authorization: Bearer <secret>` or `x-cron-secret`. */
export function secretFromRequest(request: Request): string | null {
  const auth = request.headers.get("authorization");
  if (auth?.toLowerCase().startsWith("bearer ")) return auth.slice(7).trim();
  return request.headers.get("x-cron-secret");
}

export interface TickDeps {
  advance: () => Promise<{ createdMessageIds: string[]; stoppedEnrollmentIds: string[] }>;
  sync: (deadlineMs: number) => Promise<Record<string, unknown>>;
  /** Release scheduled/windowed emails that are now due. Returns a small summary. */
  release: () => Promise<Record<string, unknown>>;
  secret: string | undefined;
  /** Total time budget for the inbox sync (ms). */
  syncBudgetMs?: number;
}

export function createTickHandler(deps: TickDeps) {
  return async function POST(request: Request): Promise<Response> {
    if (!secretMatches(secretFromRequest(request), deps.secret)) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    const steps: string[] = [];
    let drafted = 0;
    let stopped = 0;
    let released: Record<string, unknown> | { error: string } = {};
    let inbox: Record<string, unknown> | { error: string } = {};
    try {
      const adv = await deps.advance();
      drafted = adv.createdMessageIds.length;
      stopped = adv.stoppedEnrollmentIds.length;
      steps.push("advance");
    } catch (err) {
      steps.push(`advance failed: ${err instanceof Error ? err.message : String(err)}`);
    }
    try {
      released = await deps.release();
      steps.push("release");
    } catch (err) {
      released = { error: err instanceof Error ? err.message : String(err) };
      steps.push("release failed");
    }
    try {
      inbox = await deps.sync(deps.syncBudgetMs ?? 20000);
      steps.push("sync");
    } catch (err) {
      inbox = { error: err instanceof Error ? err.message : String(err) };
      steps.push("sync failed");
    }
    return Response.json({ ok: true, steps, drafted, stopped, released, inbox });
  };
}
