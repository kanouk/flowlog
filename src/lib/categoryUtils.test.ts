import { beforeEach, describe, expect, it } from 'vitest';
import {
  CATEGORIES,
  CATEGORY_CONFIG,
  formatScheduleRange,
  getCategoryLabel,
  getLastCategory,
  getLastTag,
  setLastCategory,
  setLastTag,
  TAG_CONFIG,
  TAGS,
} from './categoryUtils';

describe('categoryUtils', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it('exposes category and tag configuration', () => {
    expect(CATEGORIES).toEqual(['event', 'task', 'schedule', 'thought', 'read_later']);
    expect(TAGS).toEqual(['work', 'family', 'private']);
    expect(CATEGORY_CONFIG.event.label).toBe('出来事');
    expect(TAG_CONFIG.work.label).toBe('仕事');
  });

  it('stores and restores last category and tag in sessionStorage', () => {
    expect(getLastCategory()).toBe('event');
    setLastCategory('task');
    expect(getLastCategory()).toBe('task');

    expect(getLastTag()).toBeNull();
    setLastTag('work');
    expect(getLastTag()).toBe('work');
    setLastTag(null);
    expect(getLastTag()).toBeNull();
  });

  it('keeps current fallback behavior for unknown category labels', () => {
    expect(getCategoryLabel('read_later')).toBe('あとで');
    expect(getCategoryLabel('unknown')).toBe('unknown');
  });

  it('formats schedule ranges', () => {
    expect(formatScheduleRange(null, null, false)).toBe('');
    expect(formatScheduleRange('2026-03-07T00:00:00.000Z', null, true)).toBe('3月7日（終日）');
    expect(
      formatScheduleRange('2026-03-07T00:00:00.000Z', '2026-03-07T01:30:00.000Z', false),
    ).toBe('3月7日 09:00〜10:30');
    expect(
      formatScheduleRange('2026-03-07T14:00:00.000Z', '2026-03-08T01:00:00.000Z', false),
    ).toBe('3月7日 23:00 〜 3月8日 10:00');
  });
});
