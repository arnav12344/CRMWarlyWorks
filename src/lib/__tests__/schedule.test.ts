import { describe, it, expect } from "vitest";
import { resolveSchedule, nextWindow, inSendWindow, isDue } from "../schedule";
import { formatInTimeZone } from "date-fns-tz";

const sgt = (d: Date) => formatInTimeZone(d, "Asia/Singapore", "EEE HH:mm");

describe("send scheduling (Asia/Singapore, Thu 09:00-11:00 window)", () => {
  it("'now' means no scheduled time", () => {
    expect(resolveSchedule("now", new Date("2026-01-05T02:00:00Z"))).toBeNull();
  });

  it("next window from a Monday is the coming Thursday 09:00 SGT", () => {
    // Mon 5 Jan 2026, 10:00 SGT == 02:00 UTC
    const w = nextWindow(new Date("2026-01-05T02:00:00Z"));
    expect(sgt(w)).toBe("Thu 09:00");
  });

  it("on Thursday before the window, uses the same day", () => {
    // Thu 8 Jan 2026, 07:30 SGT
    const w = nextWindow(new Date("2026-01-07T23:30:00Z"));
    expect(sgt(w)).toBe("Thu 09:00");
    expect(w.getTime()).toBeGreaterThan(new Date("2026-01-07T23:30:00Z").getTime());
  });

  it("on Thursday after the window closes, jumps to next Thursday", () => {
    // Thu 8 Jan 2026, 12:00 SGT == 04:00 UTC -> next week
    const w = nextWindow(new Date("2026-01-08T04:00:00Z"));
    expect(sgt(w)).toBe("Thu 09:00");
    // 7 days later than the same-day 09:00 would have been.
    expect(w.toISOString()).toBe("2026-01-15T01:00:00.000Z");
  });

  it("'today' uses the chosen SGT time when it's still ahead", () => {
    // 09:00 SGT (01:00 UTC); ask for 17:00 today
    const at = resolveSchedule("today", new Date("2026-01-05T01:00:00Z"), "17:00");
    expect(sgt(at!)).toBe("Mon 17:00");
  });

  it("'today' falls back to the next window if the time already passed", () => {
    // 18:00 SGT; ask for 09:00 today -> already gone -> next Thursday
    const at = resolveSchedule("today", new Date("2026-01-05T10:00:00Z"), "09:00");
    expect(sgt(at!)).toBe("Thu 09:00");
  });

  it("inSendWindow is true only Thursday 09:00-11:00 SGT", () => {
    expect(inSendWindow(new Date("2026-01-08T01:30:00Z"))).toBe(true); // Thu 09:30
    expect(inSendWindow(new Date("2026-01-08T03:30:00Z"))).toBe(false); // Thu 11:30
    expect(inSendWindow(new Date("2026-01-05T01:30:00Z"))).toBe(false); // Mon
  });

  it("isDue compares against now", () => {
    const now = new Date("2026-01-05T02:00:00Z");
    expect(isDue(null, now)).toBe(true);
    expect(isDue(new Date("2026-01-05T01:00:00Z"), now)).toBe(true);
    expect(isDue(new Date("2026-01-05T03:00:00Z"), now)).toBe(false);
  });
});
