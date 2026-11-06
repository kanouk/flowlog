import type { Env } from './auth';
import { unpack } from './database';
import type { Block } from './ported/format-entries/diary';

/** Activation policy decides whether to generate; it must not truncate input. */
export async function readDiaryMaterials(env: Env, owner: string, date: string) {
    const hour = (await env.DB.prepare('SELECT day_boundary_hour FROM user_ai_settings WHERE user_id=?').bind(owner).first<{ day_boundary_hour: number }>())?.day_boundary_hour || 0;
    const lo = new Date(Date.parse(date + 'T00:00:00Z') + (hour - 9) * 3600000).toISOString();
    const hi = new Date(Date.parse(lo) + 86400000).toISOString();
    const rows = (await env.DB.prepare(`SELECT id,content,occurred_at,images,category,is_done,done_at,due_at,due_all_day,starts_at,ends_at,is_all_day,source,revision,created_at,time_confirmed_at,event_timing,timeline_placement FROM blocks
        WHERE user_id=? AND (
          (category IN ('event','thought') AND julianday(occurred_at)>=julianday(?) AND julianday(occurred_at)<julianday(?))
          OR (category='schedule' AND starts_at IS NOT NULL AND julianday(starts_at)<julianday(?)
            AND (julianday(starts_at)>=julianday(?) OR julianday(ends_at)>julianday(?)))
        ) ORDER BY julianday(CASE WHEN category='schedule' THEN starts_at ELSE occurred_at END),id`).bind(owner, lo, hi, hi, lo, lo).all<Record<string, unknown>>()).results;
    const blocks = await Promise.all(rows.map(r => unpack(env, r))) as unknown as Block[];
    let hasAutomaticRecords = false;
    const diaryBlocks = blocks.filter(block => {
        const content = block.content?.trim();
        if (content?.startsWith('【自動記録】')) {
            hasAutomaticRecords = true;
            return false;
        }
        return !!content || !!block.images?.length;
    });
    return { dayBoundaryHour: hour, blocks: diaryBlocks, hasAutomaticRecords };
}
