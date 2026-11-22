import { describe, expect, it } from 'vitest';
import {
  addCalendarDays,
  findDates,
  formatIsoHuman,
  isValidIso,
  parseCount,
} from './dates';

describe('calendar-day arithmetic', () => {
  it('counts calendar days across a month boundary', () => {
    expect(addCalendarDays('2026-11-03', 30)).toBe('2026-12-03');
  });

  it('handles leap years', () => {
    expect(addCalendarDays('2028-02-01', 29)).toBe('2028-03-01');
    expect(addCalendarDays('2026-02-01', 29)).toBe('2026-03-02');
  });

  it('does not shift dates in a timezone', () => {
    expect(formatIsoHuman('2026-12-03')).toBe('3 December 2026');
    expect(addCalendarDays('2026-03-29', 1)).toBe('2026-03-30');
  });

  it('rejects impossible dates', () => {
    expect(isValidIso('2026-02-30')).toBe(false);
    expect(isValidIso('2026-13-01')).toBe(false);
    expect(isValidIso('2026-02-28')).toBe(true);
  });
});

describe('day counts written as words or digits', () => {
  it('reads digits, parenthesised digits and number words', () => {
    expect(parseCount('thirty (30) ')).toBe(30);
    expect(parseCount('fifteen')).toBe(15);
    expect(parseCount('twenty-one')).toBe(21);
    expect(parseCount('fourteen (14) calendar ')).toBe(14);
  });
});

describe('date forms', () => {
  it('reads a written month/day/year date', () => {
    const [date] = findDates('Comments must be received by February 22, 2027.');
    expect(date.iso).toBe('2027-02-22');
    expect(date.ambiguous).toBe(false);
  });

  it('reads a day-first date written with a month name', () => {
    const [date] = findDates('Submit the form by 15 January 2027.');
    expect(date.iso).toBe('2027-01-15');
  });

  it('refuses to pick a reading for an ambiguous numeric date', () => {
    const [date] = findDates('Payment is due on 03/04/2027.');
    expect(date.iso).toBeNull();
    expect(date.ambiguous).toBe(true);
    expect(date.readings).toHaveLength(2);
  });

  it('reads a numeric date when only one order is possible', () => {
    const [date] = findDates('A hearing is set for 25/12/2027.');
    expect(date.iso).toBe('2027-12-25');
    expect(date.ambiguous).toBe(false);
  });

  it('reads an ISO date', () => {
    const [date] = findDates('The response is due 2027-01-15.');
    expect(date.iso).toBe('2027-01-15');
  });
});
