import { orderTimeline, periods, type EventTiming, type Period, type TimedBlock, type TimelinePlacement } from '../src/lib/blockTiming';
import type { Env } from './auth';
import { unpack } from './database';

export async function setBlockTiming(env: Env, owner: string, args: Record<string, unknown>) {
    const id = args.p_id;
    const bad = (message: string, code = '23514') => ({ data: null, error: { code, message } });
    if (typeof id !== 'string') return bad('ブロックを指定してください');
    const current = await env.DB.prepare(`SELECT b.*, a.day_boundary_hour FROM blocks b
        LEFT JOIN user_ai_settings a ON a.user_id=b.user_id WHERE b.id=? AND b.user_id=?`).bind(id, owner).first();
    if (!current) return bad('ブロックが見つかりません');
    const boundary = Number(current.day_boundary_hour || 0);
    const date = new Date(Date.parse(String(current.occurred_at)) + (9 - boundary) * 3600000).toISOString().slice(0, 10);
    let sql: string;
    let values: (string | null)[];
    if (args.p_action === 'place') {
        const later = args.p_later ?? null;
        const earlier = args.p_earlier ?? null;
        if (!(later === null || typeof later === 'string') || !(earlier === null || typeof earlier === 'string') ||
            later === id || earlier === id || later === earlier) return bad('並び替え先を確認してください');
        const lo = new Date(Date.parse(date + 'T00:00:00Z') + (boundary - 9) * 3600000);
        const hi = new Date(lo.getTime() + 86400000);
        const rows = (await env.DB.prepare(`SELECT id,occurred_at,created_at,time_confirmed_at,event_timing,timeline_placement FROM blocks
            WHERE user_id=? AND julianday(occurred_at)>=julianday(?) AND julianday(occurred_at)<julianday(?)`)
            .bind(owner, lo.toISOString(), hi.toISOString()).all()).results;
        const day = await Promise.all(rows.map(row => unpack(env, row))) as unknown as TimedBlock[];
        const moving = day.find(row => row.id === id);
        if (!moving || [later, earlier].some(anchor => anchor && !day.some(row => row.id === anchor)))
            return bad('表示が更新されました。読み直してお試しください', 'PT409');
        const placement: TimelinePlacement = { later, earlier };
        moving.timeline_placement = placement;
        if (orderTimeline(day, true).conflict) return bad('確定した時刻や順番と重なっています。必要なら時刻を変更してください', 'PT409');
        // The day snapshot check prevents concurrent drags or edits from forming a cycle.
        const snapshot = JSON.stringify(rows.map(row => [row.id, row.event_timing, row.timeline_placement, row.occurred_at]));
        sql = `UPDATE blocks SET timeline_placement=? WHERE id=? AND user_id=? AND revision=?
            AND NOT EXISTS (SELECT 1 FROM json_each(?) v LEFT JOIN blocks b
              ON b.id=json_extract(v.value,'$[0]') AND b.user_id=?
              WHERE b.id IS NULL OR b.event_timing IS NOT json_extract(v.value,'$[1]')
              OR b.timeline_placement IS NOT json_extract(v.value,'$[2]') OR b.occurred_at IS NOT json_extract(v.value,'$[3]'))
            RETURNING id`;
        const changed = await env.DB.prepare(sql).bind(JSON.stringify(placement), id, owner, current.revision, snapshot, owner).first();
        if (!changed) return bad('表示が更新されました。読み直してお試しください', 'PT409');
    } else {
        let timing: EventTiming;
        let confirmed: string | null = null;
        if (args.p_action === 'period' && typeof args.p_period === 'string' && Object.hasOwn(periods, args.p_period)) {
            const period = args.p_period as Period;
            const hour = periods[period].hour;
            const at = new Date(Date.parse(date + 'T00:00:00Z') + (hour + (hour < boundary ? 24 : 0) - 9) * 3600000);
            timing = { kind: 'period', origin: 'human', period, at: at.toISOString() };
            confirmed = new Date().toISOString();
        } else if (args.p_action === 'dismiss') {
            const previous = current.event_timing ? JSON.parse(String(current.event_timing)) as EventTiming : null;
            if (previous?.origin === 'human' && previous.kind !== 'unknown') return bad('確定済みの時刻は編集画面で変更してください');
            timing = { kind: 'unknown', origin: 'human', dismissed: true };
            confirmed = current.time_confirmed_at as string | null;
        } else return bad('時刻の操作を確認してください');
        sql = 'UPDATE blocks SET event_timing=?,time_confirmed_at=? WHERE id=? AND user_id=? AND revision=? RETURNING id';
        values = [JSON.stringify(timing), confirmed, id, owner];
        const changed = await env.DB.prepare(sql).bind(...values, current.revision).first();
        if (!changed) return bad('表示が更新されました。読み直してお試しください', 'PT409');
    }
    const updated = await env.DB.prepare('SELECT * FROM blocks WHERE id=? AND user_id=?').bind(id, owner).first();
    return { data: updated ? await unpack(env, updated) : null, error: null };
}
