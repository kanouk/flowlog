import { describe, expect, it } from 'vitest';
import { PRIORITIES, PRIORITY_CONFIG } from './taskPriority';

describe('taskPriority', () => {
  it('exposes the supported priority order and labels', () => {
    expect(PRIORITIES).toEqual([0, 1, 2, 3]);
    expect(PRIORITY_CONFIG[0].label).toBe('なし');
    expect(PRIORITY_CONFIG[3].label).toBe('高');
  });
});
