export const periods = {
  morning: { label: '朝ごろ', hour: 8 },
  noon: { label: '昼ごろ', hour: 12 },
  evening: { label: '夕方ごろ', hour: 17 },
  night: { label: '夜ごろ', hour: 21 },
} as const;

export type Period = keyof typeof periods;
export type EventTiming =
  | { kind: 'unknown'; origin: 'system' | 'human'; dismissed?: true }
  | { kind: 'period'; origin: 'inferred' | 'human'; period: Period; at: string; evidence?: string }
  | { kind: 'approx'; origin: 'inferred'; at: string; evidence: string }
  | { kind: 'exact'; origin: 'inferred' | 'human' | 'external'; at: string; evidence?: string };
export type TimelinePlacement = { later: string | null; earlier: string | null };

export interface TimedBlock {
  id: string;
  occurred_at: string;
  created_at?: string;
  time_confirmed_at?: string | null;
  source?: string | null;
  event_timing?: EventTiming | null;
  timeline_placement?: TimelinePlacement | null;
}

export function inferEventTiming(content: string | null, date: string, boundary: number, now: number): EventTiming {
  const text = (content || '').normalize('NFKC').trim();
  const unknown = { kind: 'unknown', origin: 'system' } as const;
  // Only adopt times grounded in one statement about the selected day.
  if (/[\n]|昨日|一昨日|明日|明後日|昨夜|昨晩|来週|先週|予定|予約|つもり|に向け|\d+月\d+日/.test(text)) return unknown;
  const at = (hour: number, minute = 0) => {
    const ms = Date.parse(date + 'T00:00:00Z') + (hour + (hour < boundary ? 24 : 0) - 9) * 3600000 + minute * 60000;
    return ms <= now + 5 * 60000 ? new Date(ms).toISOString() : null;
  };
  const clocks = [...text.matchAll(/(?<![\d:：])(?:(午前|午後|朝|昼|夕方|夜|深夜)\s*)?(\d{1,2})(?::(\d{2})|時(?:(\d{1,2})分|(半))?)/g)];
  if (clocks.length) {
    if (clocks.length !== 1 || /時過ぎ|時前|[〜～~]|まで|見込|目標/.test(text)) return unknown;
    const match = clocks[0];
    const tail = text.slice(match.index + match[0].length);
    const approximate = tail.match(/^(?:ごろ|頃|くらい)/)?.[0];
    if (!/^\s*(?:に|、|,|\s)/.test(tail.slice(approximate?.length ?? 0))) return unknown;
    let hour = Number(match[2]);
    const minute = Number(match[3] || match[4] || (match[5] ? 30 : 0));
    if (hour > 23 || minute > 59) return unknown;
    const qualifier = match[1];
    if (qualifier === '午前' || qualifier === '午後') {
      if (hour > 12 || hour === 0) return unknown;
      hour = hour % 12 + (qualifier === '午後' ? 12 : 0);
    } else if (qualifier === '夜' && hour === 12) hour = 0;
    else if (qualifier === '夜' && hour >= 5 && hour < 12 ||
      qualifier === '夕方' && hour >= 4 && hour < 12 ||
      qualifier === '昼' && hour >= 1 && hour <= 3) hour += 12;
    const instant = at(hour, minute);
    if (!instant) return unknown;
    return approximate ? { kind: 'approx', origin: 'inferred', at: instant, evidence: match[0] + approximate }
      : { kind: 'exact', origin: 'inferred', at: instant, evidence: match[0] };
  }
  if (/朝(?:ごはん|ご飯|御飯|食|飯)|昼(?:ごはん|ご飯|食|飯)|夕(?:ごはん|ご飯|食|飯)|晩(?:ごはん|ご飯|飯)|夜ごはん/.test(text) &&
      /食べた|食べました|済ませた|とった|摂った/.test(text) &&
      !/食べな|食べず|抜いた|ため|のあと|の後|の前|代わり|(?:と|も).*(?:昼食|夕食|晩ごはん)/.test(text)) {
    const meals = [...text.matchAll(/朝(?:ごはん|ご飯|御飯|食|飯)|昼(?:ごはん|ご飯|食|飯)|夕(?:ごはん|ご飯|食|飯)|晩(?:ごはん|ご飯|飯)|夜ごはん/g)];
    if (meals.length === 1) {
      const evidence = meals[0][0];
      const period: Period = evidence.startsWith('朝') ? 'morning' : evidence.startsWith('昼') ? 'noon' : 'night';
      const instant = at(periods[period].hour);
      if (instant) return { kind: 'period', origin: 'inferred', period, at: instant, evidence };
    }
  }
  const broad = text.match(/^(今朝|朝(?:に|は|、)|昼(?:に|は|、)|夕方(?:に|は|、)|夜(?:に|は|、))/);
  if (broad) {
    const evidence = broad[0];
    const period: Period = evidence.startsWith('昼') ? 'noon' : evidence.startsWith('夕方') ? 'evening' :
      evidence.startsWith('夜') ? 'night' : 'morning';
    const instant = at(periods[period].hour);
    if (instant) return { kind: 'period', origin: 'inferred', period, at: instant, evidence };
  }
  return unknown;
}

export function orderTimeline<T extends TimedBlock>(blocks: readonly T[], strict = false): { blocks: T[]; conflict: boolean } {
  const time = (b: T) => Date.parse(b.event_timing && b.event_timing.kind !== 'unknown' ? b.event_timing.at : b.occurred_at);
  const baseline = [...blocks].sort((a, b) => time(b) - time(a) ||
    Date.parse(b.created_at || b.occurred_at) - Date.parse(a.created_at || a.occurred_at) || b.id.localeCompare(a.id));
  if (!baseline.some(b => b.timeline_placement)) return { blocks: baseline, conflict: false };
  const byId = new Map(baseline.map(b => [b.id, b]));
  const outgoing = new Map<string, Set<string>>();
  const incoming = new Map<string, number>();
  const edge = (from: string | null, to: string | null) => {
    if (!from || !to || !byId.has(from) || !byId.has(to)) return;
    const edges = outgoing.get(from) || new Set<string>();
    if (edges.has(to)) return;
    edges.add(to);
    outgoing.set(from, edges);
    incoming.set(to, (incoming.get(to) || 0) + 1);
  };
  const fixed = baseline.filter(b => b.event_timing?.kind === 'exact' && b.event_timing.origin === 'human' || !b.event_timing && b.time_confirmed_at);
  for (let i = 1; i < fixed.length; i++) edge(fixed[i - 1].id, fixed[i].id);
  for (const block of baseline) {
    if (!block.timeline_placement) continue;
    edge(block.timeline_placement.later, block.id);
    edge(block.id, block.timeline_placement.earlier);
  }
  const result: T[] = [];
  const remaining = new Set(baseline);
  while (remaining.size) {
    let next: T | undefined;
    for (const candidate of remaining) {
      if (!incoming.get(candidate.id)) { next = candidate; break; }
    }
    if (!next) return { blocks: strict ? [] : baseline, conflict: true };
    result.push(next);
    remaining.delete(next);
    for (const id of outgoing.get(next.id) || []) incoming.set(id, incoming.get(id)! - 1);
  }
  return { blocks: result, conflict: false };
}

export function timingLabel(block: TimedBlock, format: (at: string) => string): string {
  const time = block.event_timing;
  if (block.timeline_placement && time?.origin !== 'human') return '順番のみ';
  if (!time) return block.source === 'vault-diary-materials' && !block.time_confirmed_at ? '時刻未確認' : format(block.occurred_at);
  if (time.kind === 'unknown') return '時刻未確認';
  if (time.kind === 'period') return periods[time.period].label;
  return format(time.at) + (time.kind === 'approx' ? 'ごろ' : '');
}
