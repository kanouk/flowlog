import { describe, expect, it } from 'vitest';
import { inferEventTiming, orderTimeline, timingLabel, type TimedBlock } from './blockTiming';

const date = '2026-11-06';
const now = Date.parse('2026-11-06T23:00:00+09:00');

describe('block timing', () => {
  it('places a late breakfast note in the morning without giving it an exact time', () => {
    const event_timing = inferEventTiming('朝ごはんを食べた', date, 4, now);
    const breakfast = { id: 'b', occurred_at: new Date(now).toISOString(), event_timing };
    const afternoon = { id: 'a', occurred_at: '2026-11-06T15:00:00+09:00' };
    expect(event_timing).toMatchObject({ kind: 'period', origin: 'inferred', period: 'morning' });
    expect(timingLabel(breakfast, at => at)).toBe('朝ごろ');
    expect(orderTimeline([breakfast, afternoon]).blocks.map(b => b.id)).toEqual(['a', 'b']);
  });

  it('extracts a time from an event, but skips a plan and conflicting clocks', () => {
    expect(inferEventTiming('午後3時に家から出た', date, 4, now)).toMatchObject({
      kind: 'exact', at: '2026-11-06T06:00:00.000Z', evidence: '午後3時',
    });
    expect(inferEventTiming('夜11時ごろに帰宅した', date, 4, now)).toMatchObject({
      kind: 'approx', at: '2026-11-06T14:00:00.000Z',
    });
    for (const text of ['明日15時の会議に向けて資料を作った', '8時に外出して15時に帰宅', '朝ごはんを食べなかった']) {
      expect(inferEventTiming(text, date, 4, now).kind).toBe('unknown');
    }
  });

  it('keeps deep-night times in the selected life day and avoids choosing a future time', () => {
    expect(inferEventTiming('1時に帰った', date, 4, now).kind).toBe('unknown');
    expect(inferEventTiming('1時に帰った', date, 4, Date.parse('2026-11-07T02:00:00+09:00')))
      .toMatchObject({ kind: 'exact', at: '2026-11-06T16:00:00.000Z' });
  });

  it('uses manual placement independently of time and rejects a reversed pair of fixed clocks', () => {
    const block = (id: string, hour: string): TimedBlock => {
      const at = date + 'T' + hour + ':00:00+09:00';
      return { id, occurred_at: at, event_timing: { kind: 'exact', origin: 'human', at } };
    };
    const a = block('a', '15'), c = block('c', '17');
    const b = { id: 'b', occurred_at: date + 'T23:00:00+09:00', timeline_placement: { later: 'c', earlier: 'a' } };
    expect(orderTimeline([a, b, c]).blocks.map(row => row.id)).toEqual(['c', 'b', 'a']);
    expect(orderTimeline([c, { ...a, timeline_placement: { later: null, earlier: 'c' } }], true).conflict).toBe(true);
  });
});
