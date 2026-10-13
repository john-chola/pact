// Calendar dates are passed around as 'YYYY-MM-DD' strings in the user's
// local timezone, matching the `date` columns in Postgres.

export function localDate(d: Date = new Date()) {
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${month}-${day}`;
}

export function addDays(date: string, days: number) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string) {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

/** 1-based day of the sprint; greater than `durationDays` once it has ended. */
export function sprintDay(startDate: string, today = localDate()) {
  return daysBetween(startDate, today) + 1;
}

/** A stored streak only counts if the last check-in was today or yesterday. */
export function liveStreak(streak: number | null, lastCheckinDate: string | null, today = localDate()) {
  if (!streak || !lastCheckinDate) return 0;
  return lastCheckinDate >= addDays(today, -1) ? streak : 0;
}

export function timeAgo(iso: string) {
  const seconds = Math.max(0, (Date.now() - Date.parse(iso)) / 1000);
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86_400)}d ago`;
}

/**
 * A member is "quiet" (and can be nudged) when they haven't checked in today
 * and also missed yesterday — or never checked in and joined before today.
 */
export function isQuiet(
  member: { last_checkin_date: string | null; joined_at: string },
  today = localDate()
) {
  if (member.last_checkin_date === today) return false;
  if (member.last_checkin_date) return member.last_checkin_date < addDays(today, -1);
  return localDate(new Date(member.joined_at)) < today;
}
