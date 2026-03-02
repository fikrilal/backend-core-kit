import { addDays, addMilliseconds, addSeconds, SystemClock } from './time';

describe('shared/time', () => {
  it('SystemClock.now returns a Date', () => {
    const now = new SystemClock().now();
    expect(now).toBeInstanceOf(Date);
  });

  it('addMilliseconds offsets a date by milliseconds', () => {
    const base = new Date('2026-01-01T00:00:00.000Z');
    expect(addMilliseconds(base, 1500).toISOString()).toBe('2026-01-01T00:00:01.500Z');
  });

  it('addSeconds offsets a date by seconds', () => {
    const base = new Date('2026-01-01T00:00:00.000Z');
    expect(addSeconds(base, 90).toISOString()).toBe('2026-01-01T00:01:30.000Z');
  });

  it('addDays offsets a date by days', () => {
    const base = new Date('2026-01-01T00:00:00.000Z');
    expect(addDays(base, 30).toISOString()).toBe('2026-01-31T00:00:00.000Z');
  });
});
