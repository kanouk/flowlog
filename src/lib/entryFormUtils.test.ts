import { describe, expect, it } from 'vitest';
import {
  buildScheduleDateTime,
  formatScheduleDateDisplay,
  getDefaultScheduleState,
  getRoundedScheduleTime,
} from './entryFormUtils';

describe('entryFormUtils', () => {
  it('rounds schedule start and end times to the next half-hour slot', () => {
    expect(getRoundedScheduleTime(new Date(2026, 2, 7, 10, 0))).toEqual({
      time: '10:00',
      endTime: '11:00',
      startNextDay: false,
      endNextDay: false,
    });
    expect(getRoundedScheduleTime(new Date(2026, 2, 7, 10, 1))).toEqual({
      time: '10:30',
      endTime: '11:30',
      startNextDay: false,
      endNextDay: false,
    });
    expect(getRoundedScheduleTime(new Date(2026, 2, 7, 23, 45))).toEqual({
      time: '00:00',
      endTime: '01:00',
      startNextDay: true,
      // NOTE: current behavior: after wrapping roundedHours to 0, endNextDay becomes false.
      endNextDay: false,
    });
  });

  it('builds default schedule state from rounded values', () => {
    const state = getDefaultScheduleState(new Date(2026, 2, 7, 23, 45));

    expect(state.startDate.getDate()).toBe(8);
    expect(state.endDate.getDate()).toBe(8);
    expect(state.startTime).toBe('00:00');
    expect(state.endTime).toBe('01:00');
  });

  it('builds schedule datetime strings and display labels', () => {
    expect(buildScheduleDateTime(undefined, '09:30', false)).toBeNull();
    expect(buildScheduleDateTime(new Date(2026, 2, 7), '09:30', false)).toBe('2026-03-07T00:30:00.000Z');
    expect(buildScheduleDateTime(new Date(2026, 2, 7), '09:30', true)).toBe('2026-03-07T00:00:00.000Z');
    expect(formatScheduleDateDisplay(undefined)).toBe('日付を選択');
    expect(formatScheduleDateDisplay(new Date(2026, 2, 7))).toBe('3月7日');
  });
});
