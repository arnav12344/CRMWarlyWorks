import { describe, it, expect } from "vitest";
import { formatInTimeZone } from "date-fns-tz";
import {
  addBusinessDays,
  scheduleFollowUps,
  APP_TIMEZONE,
} from "../reminders";

/** Build a UTC instant that is a given wall-clock date in Singapore (noon). */
function sgDate(iso: string): Date {
  // Singapore is UTC+8 with no DST; noon SGT == 04:00 UTC.
  return new Date(`${iso}T04:00:00.000Z`);
}

function sgDay(date: Date): string {
  return formatInTimeZone(date, APP_TIMEZONE, "yyyy-MM-dd EEE");
}

describe("addBusinessDays (Asia/Singapore)", () => {
  it("Thursday + 2 business days => Monday (skips the weekend)", () => {
    // 2026-01-01 is a Thursday.
    const thursday = sgDate("2026-01-01");
    expect(sgDay(thursday)).toContain("Thu");
    const result = addBusinessDays(thursday, 2);
    // Fri = 1, (Sat/Sun skipped), Mon = 2 => 2026-01-05.
    expect(sgDay(result)).toBe("2026-01-05 Mon");
  });

  it("Thursday + 3 business days => Tuesday", () => {
    const thursday = sgDate("2026-01-01");
    const result = addBusinessDays(thursday, 3);
    expect(sgDay(result)).toBe("2026-01-06 Tue");
  });

  it("Friday + 1 business day => Monday", () => {
    // 2026-01-02 is a Friday.
    const friday = sgDate("2026-01-02");
    expect(sgDay(friday)).toContain("Fri");
    const result = addBusinessDays(friday, 1);
    expect(sgDay(result)).toBe("2026-01-05 Mon");
  });

  it("Monday + 2 business days stays in the same week (Wednesday)", () => {
    // 2026-01-05 is a Monday.
    const monday = sgDate("2026-01-05");
    const result = addBusinessDays(monday, 2);
    expect(sgDay(result)).toBe("2026-01-07 Wed");
  });

  it("returns the same instant for n = 0", () => {
    const d = sgDate("2026-01-01");
    expect(addBusinessDays(d, 0).getTime()).toBe(d.getTime());
  });

  it("preserves the wall-clock time of day", () => {
    const d = new Date("2026-01-01T02:30:00.000Z"); // 10:30 SGT Thursday
    const result = addBusinessDays(d, 2);
    expect(formatInTimeZone(result, APP_TIMEZONE, "HH:mm")).toBe("10:30");
  });
});

describe("scheduleFollowUps", () => {
  it("schedules 2-day and 3-day business-day follow-ups by default", () => {
    const thursday = sgDate("2026-01-01");
    const followUps = scheduleFollowUps(thursday);
    expect(followUps).toHaveLength(2);
    expect(followUps[0].businessDaysOffset).toBe(2);
    expect(sgDay(followUps[0].dueAt)).toBe("2026-01-05 Mon");
    expect(followUps[1].businessDaysOffset).toBe(3);
    expect(sgDay(followUps[1].dueAt)).toBe("2026-01-06 Tue");
    expect(followUps[0].reason).toMatch(/2 business days/);
  });
});
