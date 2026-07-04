import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  calculateMiddleOccurredAt,
  createOccurredAt,
  createOccurredAtFromCalendarInput,
  formatDateJST,
  formatDisplayDateJST,
  formatTimeJST,
  formatTimeWithDayBoundary,
  getCalendarDateJST,
  getDateRangeUTC,
  getDayKey,
  getJSTTimeAsUTC,
  getMaxCalendarDate,
  getOccurredAtDayKey,
  getTodayKey,
  isFutureDate,
  parseTimestamp,
  TIMEZONE,
} from './dateUtils';

describe('dateUtils', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('exports the application timezone', () => {
    expect(TIMEZONE).toBe('Asia/Tokyo');
  });

  it('gets JST day keys and today keys with day-boundary offsets', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-07T18:00:00.000Z')); // 2026-03-08 03:00 JST

    expect(getDayKey(new Date('2026-03-07T15:30:00.000Z'))).toBe('2026-03-08');
    expect(getTodayKey()).toBe('2026-03-08');
    expect(getTodayKey(5)).toBe('2026-03-07');
  });

  it('builds UTC ranges for life days', () => {
    expect(getDateRangeUTC('2026-03-07')).toEqual({
      start: '2026-03-06T15:00:00.000Z',
      end: '2026-03-07T15:00:00.000Z',
    });
    expect(getDateRangeUTC('2026-03-07', 5)).toEqual({
      start: '2026-03-06T20:00:00.000Z',
      end: '2026-03-07T20:00:00.000Z',
    });
  });

  it('creates occurred_at values from life-day and calendar input', () => {
    expect(createOccurredAt('2026-03-07', '23:00', 5)).toBe('2026-03-07T14:00:00.000Z');
    expect(createOccurredAt('2026-03-07', '01:30', 5)).toBe('2026-03-07T16:30:00.000Z');
    expect(createOccurredAtFromCalendarInput('2026-03-07', '01:30')).toBe('2026-03-06T16:30:00.000Z');
    expect(getJSTTimeAsUTC('2026-03-07', '09:15').toISOString()).toBe('2026-03-07T00:15:00.000Z');
  });

  it('formats timestamps in JST and life-day display form', () => {
    const earlyMorning = '2026-03-07T16:30:00.000Z'; // 2026-03-08 01:30 JST

    expect(getCalendarDateJST(earlyMorning)).toBe('2026-03-08');
    expect(parseTimestamp(earlyMorning).toISOString()).toBe(earlyMorning);
    expect(formatTimeJST(earlyMorning)).toBe('01:30');
    expect(formatTimeWithDayBoundary(earlyMorning, 5)).toBe('25:30');
    expect(formatDateJST(earlyMorning)).toBe('3月8日');
    expect(formatDisplayDateJST(earlyMorning, 5)).toBe('3月7日');
    expect(getOccurredAtDayKey(earlyMorning, 5)).toBe('2026-03-07');
  });

  it('checks future dates with the existing five-minute grace period', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-07T00:00:00.000Z'));

    expect(isFutureDate('2026-03-07T00:04:59.000Z')).toBe(false);
    expect(isFutureDate('2026-03-07T00:05:01.000Z')).toBe(true);
    expect(getMaxCalendarDate(5).toISOString()).toBe('2026-03-07T00:00:00.000Z');
  });

  it('calculates middle occurred_at values and current failure cases', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-08T00:00:00.000Z'));

    expect(
      calculateMiddleOccurredAt(
        '2026-03-07T08:00:00.000Z',
        '2026-03-07T10:00:00.000Z',
        '2026-03-07',
      ),
    ).toEqual({ success: true, occurredAt: '2026-03-07T09:00:00.000Z' });
    expect(
      calculateMiddleOccurredAt(
        '2026-03-07T08:00:00.000Z',
        '2026-03-07T08:00:00.001Z',
        '2026-03-07',
      ),
    ).toEqual({ success: false, reason: 'この位置には移動できません（時間が詰まりすぎています）' });
    expect(calculateMiddleOccurredAt(null, null, '2026-03-07')).toEqual({
      success: false,
      reason: '移動先がありません',
    });
  });
});
