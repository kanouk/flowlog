import type { Env } from './auth';
import { createServerClient } from './database';
import { sha256 } from './crypto';
import { createDiaryRuntime, type Block } from './ported/format-entries/diary';
import { readDiaryMaterials } from './diary-materials';
type Row = Record<string, unknown>;
type Job = {
    user_id: string;
    date: string;
    generation: number;
    claimed_generation: number;
    lease_token: string;
    attempts: number;
    claimed_config: number;
    claimed_edit: number;
    saved_hash: string | null;
    force_generation: number;
    input_hash: string | null;
};
type Generated = {
    formatted_content: string;
    score?: number;
    score_details?: string;
};
const validDate = (date: unknown): date is string => typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date) && new Date(date + 'T00:00:00Z').toISOString().slice(0, 10) === date;
const activeSQL = `EXISTS(SELECT 1 FROM diary_generation_scope s WHERE s.user_id=j.user_id AND s.date=j.date)`;
async function active(env: Env, owner: string, date: string) {
    const row = await env.DB.prepare(`SELECT EXISTS(SELECT 1 FROM diary_generation_scope WHERE user_id=? AND date=?) AS active`).bind(owner, date).first<{
        active: number;
    }>();
    return !!row?.active;
}
export async function jobRpc(env: Env, owner: string, name: string, args: Row) {
    const date = args.p_date;
    if (name === 'diary_generation_active' && !date) {
        const control = await env.DB.prepare('SELECT enabled FROM diary_generation_control WHERE singleton=1').first<{
            enabled: number;
        }>();
        return { data: !!control?.enabled, error: null };
    }
    if (!validDate(date))
        return { data: null, error: { code: '22007', message: 'Valid life date required' } };
    const enabled = await active(env, owner, date);
    if (name === 'diary_generation_active')
        return { data: enabled, error: null };
    if (name === 'request_diary_generation' || name === 'enqueue_diary_generation') {
        if (!enabled)
            return { data: null, error: { code: 'PT409', message: 'This date is protected or has no eligible new records' } };
        await env.DB.batch([
            env.DB.prepare(`INSERT INTO diary_generation_jobs(user_id,date,due_at,first_pending_at,force_generation) VALUES(?,?,unixepoch()+5,unixepoch(),1) ON CONFLICT(user_id,date) DO UPDATE SET generation=generation+1,status='queued',force_generation=1,attempts=0,error_code=NULL,lease_token=NULL,lease_until=NULL,due_at=unixepoch()+5 WHERE status NOT IN ('queued','running')`).bind(owner, date),
            env.DB.prepare(`INSERT INTO diary_generation_outbox(user_id,date,generation,due_at) SELECT user_id,date,generation,due_at FROM diary_generation_jobs WHERE user_id=? AND date=? ON CONFLICT DO NOTHING`).bind(owner, date),
        ]);
    }
    else if (name === 'diary_generation_history') {
        return { data: (await env.DB.prepare('SELECT * FROM diary_generation_history WHERE user_id=? AND date=? ORDER BY created_at DESC,id DESC LIMIT 5').bind(owner, date).all()).results.map(r => ({ ...r, previous_entry: JSON.parse(String(r.previous_entry)) })), error: null };
    }
    else if (name === 'restore_diary_generation') {
        if(enabled)return {data:null,error:{code:'PT409',message:'Disable generation before restoring'}};
        const history = await env.DB.prepare('SELECT previous_entry FROM diary_generation_history WHERE id=? AND user_id=? AND date=?').bind(String(args.p_history_id), owner, date).first<{
            previous_entry: string;
        }>();
        if (!history)
            return { data: null, error: { code: 'PT404', message: 'History not found' } };
        const previous = JSON.parse(history.previous_entry);
        const condition = `user_id=? AND date=? AND updated_at=? AND NOT EXISTS(SELECT 1 FROM diary_generation_scope s WHERE s.user_id=entries.user_id AND s.date=entries.date)`;
        const params = [owner, date, String(args.p_expected_updated_at)];
        const result = await env.DB.batch([
            env.DB.prepare(`INSERT INTO diary_generation_history(id,user_id,date,generation,previous_entry) SELECT ?,user_id,date,0,json_object('formatted_content',formatted_content,'summary',summary,'score',score,'score_details',score_details) FROM entries WHERE ${condition}`).bind(crypto.randomUUID(), ...params),
            env.DB.prepare(`UPDATE entries SET formatted_content=?,summary=?,score=?,score_details=?,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE ${condition} RETURNING id`).bind(previous.formatted_content ?? null, previous.summary ?? null, previous.score ?? null, previous.score_details ?? null, ...params),
            env.DB.prepare(`UPDATE diary_generation_jobs SET status='disabled',lease_token=NULL,lease_until=NULL WHERE user_id=? AND date=? AND changes()>0`).bind(owner,date),
        ]);
        return result[1].results.length?{data:null,error:null}:{data:null,error:{code:'PT409',message:'Entry changed or generation enabled'}};
    }
    else if (name !== 'diary_generation_status' && name !== 'diary_generation_status_for_user')
        return { data: null, error: { code: 'UNKNOWN_RPC', message: 'Unknown operation' } };
    const job = await env.DB.prepare('SELECT status,generation,saved_generation,completed_at,error_code FROM diary_generation_jobs WHERE user_id=? AND date=?').bind(owner, date).first();
    const policy = await env.DB.prepare(`SELECT enabled,new_records_only,EXISTS(SELECT 1 FROM diary_generation_protected_dates WHERE user_id=? AND date=?) AS protected,COALESCE((SELECT enabled FROM user_ai_feature_settings WHERE user_id=? AND feature_key='diary_format'),1) AS feature_enabled FROM diary_generation_control WHERE singleton=1`).bind(owner, date, owner).first<{enabled:number;new_records_only:number;protected:number;feature_enabled:number}>();
    const scopeReason = policy?.new_records_only && policy.enabled && policy.feature_enabled && !enabled ? policy.protected ? 'protected_date' : 'awaiting_new_record' : null;
    return { data: { active: enabled, status: enabled ? job?.status || 'idle' : 'disabled', generation: job?.generation || 0, saved_generation: job?.saved_generation || 0, completed_at: job?.completed_at || null, error_code: job?.error_code || null, scope_reason: scopeReason }, error: null };
}
export async function dispatchDiary(env: Env) {
    if (!env.DIARY_QUEUE)
        return;
    // Retained outbox + periodic reconciliation covers failure after commit and
    // before/after Queue.send. Duplicate delivery is safe at the D1 claim.
    await env.DB.prepare(`INSERT INTO diary_generation_outbox(user_id,date,generation,due_at) SELECT j.user_id,j.date,j.generation,CASE WHEN j.status='running' THEN j.lease_until ELSE j.due_at END FROM diary_generation_jobs j WHERE ${activeSQL} AND (j.status='queued' OR (j.status='running' AND j.lease_until<=unixepoch())) ON CONFLICT(user_id,date,generation) DO UPDATE SET due_at=excluded.due_at,sent_at=CASE WHEN sent_at<unixepoch()-180 THEN NULL ELSE sent_at END`).run();
    const rows = (await env.DB.prepare(`SELECT o.* FROM diary_generation_outbox o JOIN diary_generation_jobs j ON j.user_id=o.user_id AND j.date=o.date AND j.generation=o.generation WHERE ${activeSQL} AND o.due_at<=unixepoch()+900 AND (o.sent_at IS NULL OR o.sent_at<unixepoch()-180) AND (j.status='queued' OR (j.status='running' AND j.lease_until<=unixepoch())) LIMIT 20`).all<{
        user_id: string;
        date: string;
        generation: number;
        due_at: number;
    }>()).results;
    for (const row of rows) {
        await env.DIARY_QUEUE.send({ owner: row.user_id, date: row.date }, { delaySeconds: Math.max(0, row.due_at - Math.floor(Date.now() / 1000)) });
        await env.DB.prepare('UPDATE diary_generation_outbox SET sent_at=unixepoch() WHERE user_id=? AND date=? AND generation=?').bind(row.user_id, row.date, row.generation).run();
    }
}
export async function claimDiary(env: Env, owner: string, date: string): Promise<Job | null> {
    if (owner !== env.OWNER_ID || !validDate(date))
        return null;
    const token = crypto.randomUUID();
    const result = await env.DB.batch([
        env.DB.prepare(`UPDATE diary_generation_jobs AS j SET status='failed',error_code=CASE WHEN attempts>=3 THEN 'retry_limit' ELSE 'daily_budget' END,lease_token=NULL WHERE user_id=? AND date=? AND (attempts>=3 OR (SELECT count(*) FROM diary_generation_attempts WHERE user_id=j.user_id AND utc_date=date('now'))>=(SELECT max_calls_per_day FROM diary_generation_control WHERE singleton=1)) AND ((status='running' AND lease_until<=unixepoch()) OR (status='queued' AND due_at<=unixepoch()))`).bind(owner, date),
        env.DB.prepare(`UPDATE diary_generation_jobs AS j SET status='running',lease_token=?,lease_until=unixepoch()+180,claimed_generation=generation,claimed_config=(SELECT config_version FROM diary_generation_control WHERE singleton=1),claimed_edit=COALESCE((SELECT revision FROM diary_entry_versions WHERE user_id=j.user_id AND date=j.date),0),first_pending_at=NULL,attempts=attempts+1 WHERE user_id=? AND date=? AND ${activeSQL} AND attempts<3 AND ((status='queued' AND due_at<=unixepoch()) OR (status='running' AND lease_until<=unixepoch())) AND (SELECT count(*) FROM diary_generation_attempts WHERE user_id=? AND utc_date=date('now'))<(SELECT max_calls_per_day FROM diary_generation_control WHERE singleton=1) RETURNING *`).bind(token, owner, date, owner),
        env.DB.prepare(`INSERT INTO diary_generation_attempts(token,user_id,date,utc_date) SELECT lease_token,user_id,date,date('now') FROM diary_generation_jobs WHERE user_id=? AND date=? AND lease_token=?`).bind(owner, date, token),
    ]);
    return result[1].results[0] as Job || null;
}
async function diaryInput(env: Env, job: Job) {
    return readDiaryMaterials(env, job.user_id, job.date);
}
async function reconcileLease(env: Env, job: Job) {
    // A human edit ends this request. A new block edit or explicit regeneration
    // can create a later request; do not automatically overwrite the human edit.
    await env.DB.prepare(`UPDATE diary_generation_jobs AS j SET status=CASE WHEN NOT (${activeSQL}) THEN 'disabled' WHEN claimed_edit<>COALESCE((SELECT revision FROM diary_entry_versions WHERE user_id=j.user_id AND date=j.date),0) THEN 'failed' ELSE 'queued' END,error_code=CASE WHEN claimed_edit<>COALESCE((SELECT revision FROM diary_entry_versions WHERE user_id=j.user_id AND date=j.date),0) THEN 'entry_changed' ELSE NULL END,lease_token=NULL,lease_until=NULL,due_at=unixepoch()+5,attempts=CASE WHEN claimed_config<>(SELECT config_version FROM diary_generation_control WHERE singleton=1) OR generation<>claimed_generation THEN 0 ELSE attempts END WHERE user_id=? AND date=? AND lease_token=? AND status='running'`).bind(job.user_id, job.date, job.lease_token).run();
}
export async function finishDiary(env: Env, job: Job, result: Generated | null, empty: boolean) {
    const args = [job.user_id, job.date, job.lease_token];
    const valid = `j.user_id=? AND j.date=? AND j.lease_token=? AND j.status='running' AND j.lease_until>unixepoch() AND j.generation=j.claimed_generation AND j.claimed_config=(SELECT config_version FROM diary_generation_control WHERE singleton=1) AND j.claimed_edit=COALESCE((SELECT revision FROM diary_entry_versions WHERE user_id=j.user_id AND date=j.date),0) AND ${activeSQL}`;
    if (!result) {
        const failed = await env.DB.prepare(`UPDATE diary_generation_jobs AS j SET status=CASE WHEN attempts>=3 THEN 'failed' ELSE 'queued' END,error_code='generation_failed',due_at=unixepoch()+min(120,10*attempts*attempts),lease_token=NULL,lease_until=NULL WHERE ${valid}`).bind(...args).run();
        if (!failed.meta.changes)
            await reconcileLease(env, job);
        return failed.meta.changes ? 'failed' : 'superseded';
    }
    const saving = "j.user_id=? AND j.date=? AND j.lease_token=? AND j.status='saving'";
    const writes = await env.DB.batch([
        env.DB.prepare(`UPDATE diary_generation_jobs AS j SET status='saving' WHERE ${valid} RETURNING date`).bind(...args),
        env.DB.prepare(`INSERT INTO diary_generation_history(id,user_id,date,generation,previous_entry) SELECT ?,e.user_id,e.date,j.generation,json_object('formatted_content',e.formatted_content,'summary',e.summary,'score',e.score,'score_details',e.score_details) FROM entries e JOIN diary_generation_jobs j ON j.user_id=e.user_id AND j.date=e.date WHERE ${saving}`).bind(crypto.randomUUID(), ...args),
        env.DB.prepare(`INSERT INTO entries(id,user_id,date) SELECT ?,?,? WHERE ?=0 AND EXISTS(SELECT 1 FROM diary_generation_jobs j WHERE ${saving}) ON CONFLICT(user_id,date) DO NOTHING`).bind(crypto.randomUUID(), job.user_id, job.date, +empty, ...args),
        env.DB.prepare(`UPDATE entries SET formatted_content=?,summary='',score=CASE WHEN ? THEN NULL ELSE COALESCE(?,score) END,score_details=CASE WHEN ? THEN NULL ELSE COALESCE(?,score_details) END,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE user_id=? AND date=? AND EXISTS(SELECT 1 FROM diary_generation_jobs j WHERE ${saving}) RETURNING id`).bind(result.formatted_content, +empty, result.score ?? null, +empty, result.score_details ?? null, job.user_id, job.date, ...args),
        env.DB.prepare(`UPDATE diary_generation_jobs AS j SET status='succeeded',saved_generation=claimed_generation,saved_hash=input_hash,completed_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'),lease_token=NULL,lease_until=NULL,force_generation=0,error_code=NULL WHERE ${saving} RETURNING status`).bind(...args),
        env.DB.prepare('DELETE FROM diary_generation_history WHERE id IN (SELECT id FROM diary_generation_history WHERE user_id=? AND date=? ORDER BY created_at DESC,id DESC LIMIT -1 OFFSET 5)').bind(job.user_id, job.date),
    ]);
    if (writes[4].results.length)
        return 'succeeded';
    await reconcileLease(env, job);
    return 'superseded';
}
export async function runDiary(env: Env, owner: string, date: string, generate?: (blocks: Block[], date: string, hour: number) => Promise<Generated>, delegate = globalThis.fetch) {
    const job = await claimDiary(env, owner, date);
    if (!job)
        return 'idle';
    const input = await diaryInput(env, job);
    const fingerprintFor = ({ dayBoundaryHour, blocks }: typeof input) =>
        sha256(JSON.stringify({ input: { dayBoundaryHour, blocks }, config: job.claimed_config }));
    const fingerprint = await fingerprintFor(input);
    await env.DB.prepare('UPDATE diary_generation_jobs SET input_hash=? WHERE user_id=? AND date=? AND lease_token=?').bind(fingerprint, owner, date, job.lease_token).run();
    const onlyAutomaticRecords = input.hasAutomaticRecords && !input.blocks.length;
    if (onlyAutomaticRecords || (!job.force_generation && job.saved_hash === fingerprint)) {
        const result = await env.DB.prepare(`UPDATE diary_generation_jobs AS j SET status='succeeded',saved_generation=generation,lease_token=NULL,lease_until=NULL,force_generation=0,error_code=NULL,completed_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE user_id=? AND date=? AND lease_token=? AND generation=claimed_generation AND claimed_config=(SELECT config_version FROM diary_generation_control WHERE singleton=1) AND ${activeSQL}`).bind(owner, date, job.lease_token).run();
        return result.meta.changes ? 'unchanged' : 'superseded';
    }
    let output: Generated | null = null;
    try {
        if (!input.blocks.length)
            output = { formatted_content: '' };
        else if (generate)
            output = await generate(input.blocks, date, input.dayBoundaryHour);
        else {
            const client = createServerClient(env, owner), diary = createDiaryRuntime(env, delegate);
            const config = await diary.getFeatureConfig(client, owner, 'diary_format', true);
            const text = await diary.generateDiaryText(input.blocks, date, input.dayBoundaryHour, config);
            const scoreConfig = await diary.getFeatureConfig(client, owner, 'score_evaluation', true).catch(() => null);
            const score = await diary.generateDiaryScore(text.formatted_content, input.dayBoundaryHour, scoreConfig);
            output = { ...text, ...score };
        }
    }
    catch { /* Provider errors never enter logs or records. */ }
    // Memo/photo/schedule edits need not enqueue a job themselves, but must
    // invalidate prose generated from their earlier contents.
    if (await fingerprintFor(await diaryInput(env, job)) !== fingerprint) {
        await reconcileLease(env, job);
        return 'superseded';
    }
    const status = await finishDiary(env, job, output, !input.blocks.length);
    await env.DB.prepare('UPDATE diary_generation_outbox SET sent_at=NULL,due_at=(SELECT due_at FROM diary_generation_jobs j WHERE j.user_id=diary_generation_outbox.user_id AND j.date=diary_generation_outbox.date) WHERE user_id=? AND date=? AND generation=(SELECT generation FROM diary_generation_jobs WHERE user_id=? AND date=?)').bind(owner, date, owner, date).run();
    await dispatchDiary(env);
    return status;
}
export async function consumeDiary(batch: MessageBatch<{
    owner: string;
    date: string;
}>, env: Env) {
    for (const message of batch.messages) {
        try {
            await runDiary(env, message.body.owner, message.body.date);
            message.ack();
        }
        catch {
            message.retry({ delaySeconds: 30 });
        }
    }
}
