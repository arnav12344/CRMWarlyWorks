/**
 * Timezone-aware "today" helpers.
 *
 * Netlify functions run in UTC, so `new Date().setHours(0,0,0,0)` would give a
 * UTC day. Everything user-facing ("due today", "sent today", the daily send
 * limit) must use the Singapore wall-clock day instead.
 */
import { toZonedTime, fromZonedTime, formatInTimeZone } from "date-fns-tz";
import { APP_TIMEZONE } from "./reminders";

export interface DayRange {
  /** First instant of the local day (inclusive). */
  start: Date;
  /** First instant of the NEXT local day (exclusive). */
  end: Date;
}

/** The [start, end) UTC instants of the calendar day containing `now` in `timeZone`. */
export function dayRange(now: Date = new Date(), timeZone: string = APP_TIMEZONE): DayRange {
  const zoned = toZonedTime(now, timeZone);
  zoned.setHours(0, 0, 0, 0);
  const start = fromZonedTime(zoned, timeZone);
  const next = new Date(zoned);
  next.setDate(next.getDate() + 1);
  const end = fromZonedTime(next, timeZone);
  return { start, end };
}

/** Friendly local date label, e.g. "Sunday, 27 Sep". */
export function localDayLabel(now: Date = new Date(), timeZone: string = APP_TIMEZONE): string {
  return formatInTimeZone(now, timeZone, "EEEE, d MMM");
}

/** Local hour (0-23) in the timezone — used for the greeting. */
export function localHour(now: Date = new Date(), timeZone: string = APP_TIMEZONE): number {
  return Number(formatInTimeZone(now, timeZone, "H"));
}
