/**
 * Send-schedule helpers (Asia/Singapore).
 *
 * A batch can be scheduled for:
 *   - "now"       — send on the next Send / Send all / tick
 *   - "today"     — later today at a chosen HH:mm (SGT)
 *   - "thursday"  — the next Thursday morning send window
 *   - "window"    — snap to the next default send window (Thu 9-11am), used when
 *                   a batch is queued with no explicit choice
 *
 * The scheduled job releases a message once `scheduledFor <= now`.
 */
import { fromZonedTime, toZonedTime } from "date-fns-tz";
import { APP_TIMEZONE } from "./reminders";

/** Default weekly send window: Thursday, 09:00-11:00 Singapore time. */
export const SEND_WINDOW = {
  weekday: 4, // 0 Sun … 4 Thu
  startHour: 9,
  endHour: 11,
} as const;

export type ScheduleChoice = "now" | "today" | "thursday" | "window";

/** UTC instant for a given Singapore wall-clock day + time. */
function sgtInstant(base: Date, opts: { addDays?: number; hour: number; minute?: number }): Date {
  const zoned = toZonedTime(base, APP_TIMEZONE);
  zoned.setDate(zoned.getDate() + (opts.addDays ?? 0));
  zoned.setHours(opts.hour, opts.minute ?? 0, 0, 0);
  return fromZonedTime(zoned, APP_TIMEZONE);
}

/** Days until the next given weekday (0 = same day only if still in window). */
function daysUntilWeekday(fromWeekday: number, target: number): number {
  return (target - fromWeekday + 7) % 7;
}

/**
 * Resolve a schedule choice to a concrete send time (UTC), or null for "send
 * now". `todayTime` is "HH:mm" in Singapore time, used only for the "today" choice.
 */
export function resolveSchedule(
  choice: ScheduleChoice,
  now: Date = new Date(),
  todayTime?: string
): Date | null {
  if (choice === "now") return null;

  const zoned = toZonedTime(now, APP_TIMEZONE);

  if (choice === "today") {
    const [h, m] = (todayTime ?? "17:00").split(":").map((n) => parseInt(n, 10));
    const at = sgtInstant(now, { hour: Number.isFinite(h) ? h : 17, minute: Number.isFinite(m) ? m : 0 });
    // If that time already passed today, fall back to the next window.
    return at.getTime() > now.getTime() ? at : nextWindow(now);
  }

  // "thursday" / "window": next Thursday 09:00 SGT (or today if it's Thu before 11:00).
  return nextWindow(now, zoned);
}

/** The next Thursday 09:00 SGT window start (today if we're in it / before it on a Thursday). */
export function nextWindow(now: Date = new Date(), zoned = toZonedTime(now, APP_TIMEZONE)): Date {
  const wd = zoned.getDay();
  const hour = zoned.getHours();
  let addDays = daysUntilWeekday(wd, SEND_WINDOW.weekday);
  // If today is Thursday but the window has already closed, go to next week.
  if (addDays === 0 && hour >= SEND_WINDOW.endHour) addDays = 7;
  return sgtInstant(now, { addDays, hour: SEND_WINDOW.startHour });
}

/** Is `now` inside the default send window (Thu 09:00-11:00 SGT)? */
export function inSendWindow(now: Date = new Date()): boolean {
  const zoned = toZonedTime(now, APP_TIMEZONE);
  return (
    zoned.getDay() === SEND_WINDOW.weekday &&
    zoned.getHours() >= SEND_WINDOW.startHour &&
    zoned.getHours() < SEND_WINDOW.endHour
  );
}

/** True when a scheduled message is due to send. */
export function isDue(scheduledFor: Date | null | undefined, now: Date = new Date()): boolean {
  return !scheduledFor || scheduledFor.getTime() <= now.getTime();
}
