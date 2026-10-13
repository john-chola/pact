import { addDays, daysBetween, isQuiet, liveStreak, localDate, sprintDay, timeAgo } from '@/lib/dates';

describe('localDate', () => {
  it('formats in the local timezone with zero padding', () => {
    expect(localDate(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
  });
});

describe('addDays / daysBetween', () => {
  it('crosses month and year boundaries', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(daysBetween('2026-12-30', '2027-01-02')).toBe(3);
  });

  it('handles leap years', () => {
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
  });
});

describe('sprintDay', () => {
  it('is 1 on the start date and counts up', () => {
    expect(sprintDay('2026-10-10', '2026-10-10')).toBe(1);
    expect(sprintDay('2026-10-10', '2026-10-16')).toBe(7);
  });

  it('goes past the duration once the sprint has ended', () => {
    expect(sprintDay('2026-10-10', '2026-10-17')).toBe(8);
  });
});

describe('liveStreak', () => {
  const today = '2026-10-13';

  it('keeps the streak if the last check-in was today or yesterday', () => {
    expect(liveStreak(4, '2026-10-13', today)).toBe(4);
    expect(liveStreak(4, '2026-10-12', today)).toBe(4);
  });

  it('shows 0 once a day has been missed', () => {
    expect(liveStreak(4, '2026-10-11', today)).toBe(0);
  });

  it('handles members who never checked in', () => {
    expect(liveStreak(0, null, today)).toBe(0);
    expect(liveStreak(null, null, today)).toBe(0);
  });
});

describe('isQuiet', () => {
  const today = '2026-10-13';
  const joinedLongAgo = new Date(2026, 9, 1, 12).toISOString();

  it('is false for anyone who checked in today or yesterday', () => {
    expect(isQuiet({ last_checkin_date: today, joined_at: joinedLongAgo }, today)).toBe(false);
    expect(isQuiet({ last_checkin_date: '2026-10-12', joined_at: joinedLongAgo }, today)).toBe(false);
  });

  it('is true after a missed day', () => {
    expect(isQuiet({ last_checkin_date: '2026-10-11', joined_at: joinedLongAgo }, today)).toBe(true);
  });

  it('gives new members until the end of their first day', () => {
    const joinedToday = new Date(2026, 9, 13, 9).toISOString();
    expect(isQuiet({ last_checkin_date: null, joined_at: joinedToday }, today)).toBe(false);
    expect(isQuiet({ last_checkin_date: null, joined_at: joinedLongAgo }, today)).toBe(true);
  });
});

describe('timeAgo', () => {
  it('uses the largest sensible unit', () => {
    const now = Date.now();
    expect(timeAgo(new Date(now - 10_000).toISOString())).toBe('just now');
    expect(timeAgo(new Date(now - 5 * 60_000).toISOString())).toBe('5m ago');
    expect(timeAgo(new Date(now - 3 * 3_600_000).toISOString())).toBe('3h ago');
    expect(timeAgo(new Date(now - 2 * 86_400_000).toISOString())).toBe('2d ago');
  });
});
