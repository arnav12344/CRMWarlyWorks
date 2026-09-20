/**
 * Business-day-aware follow-up scheduling in the Asia/Singapore timezone.
 *
 * Outreach follow-ups are counted in *business days* (Mon-Fri), skipping
 * Saturday and Sunday. All day-of-week math is done against the wall-clock day
 * in Singapore (the team's timezone) so a message "sent" late on a Friday
 * evening UTC still counts the Friday as day zero locally.
 *
 * Example: a message sent on a Thursday, +2 business days lands on the
 * following Monday (Fri = 1, Mon = 2 — Sat/Sun skipped).
 */

import { toZonedTime, fromZonedTime } from "date-fns-tz";

export const APP_TIMEZONE = "Asia/Singapore";

/** Standard follow-up cadence, in business days, after a first-touch send. */
export const FOLLOW_UP_BUSINESS_DAYS = [2, 3] as const;

/** True when the given zoned date falls on a Saturday or Sunday. */
function isWeekend(zoned: Date): boolean {
  const day = zoned.getDay(); // 0 = Sun, 6 = Sat (interpreted in the zoned wall clock)
  return day === 0 || day === 6;
}

/**
 * Add `n` business days (Mon-Fri) to a date, evaluated in `timeZone`.
 *
 * The wall-clock time of `date` in the target timezone is preserved; only the
 * calendar day advances. Weekends are skipped and never counted. `n` may be 0
 * (returns the same instant) — if `n` is 0 the input is returned unchanged even
 * if it lands on a weekend, since we are not scheduling anything.
 */
export function addBusinessDays(
  date: Date,
  n: number,
  timeZone: string = APP_TIMEZONE
): Date {
  if (n <= 0) return new Date(date.getTime());

  // Work in the target timezone's wall clock so day-of-week is correct locally.
  const zoned = toZonedTime(date, timeZone);
  let added = 0;
  while (added < n) {
    zoned.setDate(zoned.getDate() + 1);
    if (!isWeekend(zoned)) {
      added += 1;
    }
  }
  // Convert the zoned wall-clock time back to a real UTC instant.
  return fromZonedTime(zoned, timeZone);
}

/** A single scheduled follow-up relative to a send date. */
export interface ScheduledFollowUp {
  businessDaysOffset: number;
  dueAt: Date;
  reason: string;
}

/**
 * Schedule the standard follow-ups (2 and 3 business days) from a send date.
 * Returns one entry per offset with the computed Singapore-business-day due
 * date. Pass a custom `offsets` array to schedule a different cadence.
 */
export function scheduleFollowUps(
  sendDate: Date,
  offsets: readonly number[] = FOLLOW_UP_BUSINESS_DAYS,
  timeZone: string = APP_TIMEZONE
): ScheduledFollowUp[] {
  return offsets.map((businessDaysOffset) => ({
    businessDaysOffset,
    dueAt: addBusinessDays(sendDate, businessDaysOffset, timeZone),
    reason: `Follow-up ${businessDaysOffset} business day${
      businessDaysOffset === 1 ? "" : "s"
    } after send`,
  }));
}
