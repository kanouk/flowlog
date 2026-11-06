// Ported from supabase/functions/raindrop-sync/index.ts; source behaviour retained except documented runtime/security adaptations.
import type { Env } from '../../auth';
import { createServerClient } from '../../database';
import { guardedFetch } from '../../outbound';
import { corsHeaders } from "../_shared/cors.ts";
// Explicit boundary type retains the original Deno JSON contracts. Request validation remains in each handler.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LegacyJSON = any;
export function createHandler(env: Env, actor: string | null, ctx: Pick<ExecutionContext, 'waitUntil'>, delegate: typeof globalThis.fetch = globalThis.fetch) {
    const fetch = guardedFetch(env, delegate);
    const runtime: Record<string, string | undefined> = { ...env as unknown as Record<string, string>, SUPABASE_URL: env.APP_ORIGIN, SUPABASE_SERVICE_ROLE_KEY: 'worker-owner', SUPABASE_ANON_KEY: 'worker-owner', FLOWLOG_APP_URL: env.APP_ORIGIN, SITE_URL: env.APP_ORIGIN, SUPABASE_SITE_URL: env.APP_ORIGIN, LOVABLE_API_KEY: undefined };
    const Deno = { env: { get: (key: string) => runtime[key] } };
    const createClient = (..._args: unknown[]) => createServerClient(env, env.OWNER_ID, actor);
    const waitUntil = (promise: PromiseLike<unknown>) => ctx.waitUntil(Promise.resolve(promise));
    const console = { log: (..._args: unknown[]) => { }, warn: (..._args: unknown[]) => { }, error: (..._args: unknown[]) => { } };
    const RAINDROP_API = 'https://api.raindrop.io/rest/v1';
    interface RaindropItem {
        link?: string;
        title?: string;
        excerpt?: string;
        created?: string;
        lastUpdate?: string;
        cover?: string;
        tags?: string[];
    }
    interface RaindropResponse {
        items?: RaindropItem[];
    }
    interface RaindropUrlMetadata {
        url: string;
        title: string;
        summary: string;
        fetched_at: string;
        source: 'raindrop';
        cover?: string;
        raindrop_tags?: string[];
    }
    interface BlockInsert {
        user_id: string;
        entry_id: string;
        content: string;
        category: 'read_later';
        url_metadata: RaindropUrlMetadata;
        occurred_at: string;
        is_done: boolean;
    }
    return async (req: Request) => {
        if (req.method === 'OPTIONS') {
            return new Response(null, { headers: corsHeaders });
        }
        try {
            // Authenticate user
            const authHeader = req.headers.get('Authorization');
            if (!authHeader) {
                return new Response(JSON.stringify({ error: 'Unauthorized' }), {
                    status: 401,
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                });
            }
            const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
            const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
            // User client to get uid
            const userClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
                global: { headers: { Authorization: authHeader } },
            });
            const { data: { user }, error: userError } = await userClient.auth.getUser();
            if (userError || !user) {
                return new Response(JSON.stringify({ error: 'Unauthorized' }), {
                    status: 401,
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                });
            }
            // Admin client for token retrieval
            const adminClient = createClient(supabaseUrl, serviceRoleKey);
            // Get Raindrop token
            const { data: tokenRow, error: tokenError } = await adminClient
                .from('user_external_tokens')
                .select('token, last_synced_at')
                .eq('user_id', user.id)
                .eq('service', 'raindrop')
                .single();
            if (tokenError || !tokenRow) {
                return new Response(JSON.stringify({ error: 'Raindropトークンが設定されていません' }), {
                    status: 400,
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                });
            }
            const raindropToken = tokenRow.token;
            const lastSyncedAt = tokenRow.last_synced_at;
            const body = await req.json<LegacyJSON>().catch(() => ({}));
            const mode: 'full' | 'diff' = body.mode || (lastSyncedAt ? 'diff' : 'full');
            // Get existing URLs to avoid duplicates
            const { data: existingBlocks } = await adminClient
                .from('blocks')
                .select('content')
                .eq('user_id', user.id)
                .eq('category', 'read_later');
            const existingUrls = new Set((existingBlocks || [])
                .map(b => {
                if (!b.content)
                    return null;
                const match = b.content.match(/(https?:\/\/[^\s]+)/);
                return match ? match[0] : null;
            })
                .filter(Boolean));
            // Fetch raindrops from API
            const allRaindrops: RaindropItem[] = [];
            let page = 0;
            const perPage = 50;
            let hasMore = true;
            while (hasMore) {
                const params = new URLSearchParams({
                    page: String(page),
                    perpage: String(perPage),
                    sort: '-created',
                });
                const resp = await fetch(`${RAINDROP_API}/raindrops/0?${params}`, {
                    headers: { Authorization: `Bearer ${raindropToken}` },
                });
                if (!resp.ok) {
                    const errText = await resp.text();
                    throw new Error(`Raindrop API error [${resp.status}]: ${errText}`);
                }
                const data = await resp.json<LegacyJSON>() as RaindropResponse;
                const items = data.items || [];
                if (mode === 'diff' && lastSyncedAt) {
                    // Filter items newer than last sync
                    const syncDate = new Date(lastSyncedAt);
                    const newItems = items.filter((item) => new Date(item.lastUpdate || item.created || 0) > syncDate);
                    allRaindrops.push(...newItems);
                    // If we got items older than sync date, stop
                    if (newItems.length < items.length) {
                        hasMore = false;
                    }
                }
                else {
                    allRaindrops.push(...items);
                }
                if (items.length < perPage) {
                    hasMore = false;
                }
                page++;
                // Safety limit
                if (page > 100)
                    break;
            }
            if (body.dry_run === true) {
                const seen = new Set(existingUrls);
                let pending = 0;
                for (const item of allRaindrops) {
                    if (item.link && !seen.has(item.link)) {
                        seen.add(item.link);
                        pending++;
                    }
                }
                return new Response(JSON.stringify({ success: true, dry_run: true, fetched: allRaindrops.length, pending, imported: 0, mode }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
            }
            // Get user's entry for today (needed for block insertion)
            let entryId: string;
            const today = new Date().toISOString().split('T')[0];
            const { data: existingEntry } = await adminClient
                .from('entries')
                .select('id')
                .eq('user_id', user.id)
                .eq('date', today)
                .single();
            if (existingEntry) {
                entryId = existingEntry.id;
            }
            else {
                const { data: newEntry, error: entryError } = await adminClient
                    .from('entries')
                    .insert({ user_id: user.id, date: today })
                    .select('id')
                    .single();
                if (entryError || !newEntry) {
                    throw new Error('Failed to create entry');
                }
                entryId = newEntry.id;
            }
            // Filter out already imported URLs and insert new ones
            let importedCount = 0;
            const blocksToInsert: BlockInsert[] = [];
            for (const item of allRaindrops) {
                const url = item.link;
                if (!url || existingUrls.has(url))
                    continue;
                existingUrls.add(url); // Prevent duplicates within this batch
                const urlMetadata: RaindropUrlMetadata = {
                    url,
                    title: item.title || '',
                    summary: item.excerpt || '',
                    fetched_at: new Date().toISOString(),
                    source: 'raindrop',
                };
                if (item.cover) {
                    urlMetadata.cover = item.cover;
                }
                if (item.tags && item.tags.length > 0) {
                    urlMetadata.raindrop_tags = item.tags;
                }
                blocksToInsert.push({
                    user_id: user.id,
                    entry_id: entryId,
                    content: url,
                    category: 'read_later',
                    url_metadata: urlMetadata,
                    occurred_at: item.created || new Date().toISOString(),
                    is_done: false,
                });
            }
            // Batch insert
            if (blocksToInsert.length > 0) {
                const batchSize = 50;
                for (let i = 0; i < blocksToInsert.length; i += batchSize) {
                    const batch = blocksToInsert.slice(i, i + batchSize);
                    const { error: insertError } = await adminClient.from('blocks').insert(batch);
                    if (insertError) {
                        console.error('Insert error:', insertError);
                        throw new Error(`Failed to insert blocks: ${insertError.message}`);
                    }
                    importedCount += batch.length;
                }
            }
            // Update last_synced_at
            await adminClient
                .from('user_external_tokens')
                .update({ last_synced_at: new Date().toISOString() })
                .eq('user_id', user.id)
                .eq('service', 'raindrop');
            return new Response(JSON.stringify({ success: true, imported: importedCount, mode }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
        catch (error) {
            console.error('raindrop-sync error:', error);
            const message = error instanceof Error ? error.message : 'Unknown error';
            return new Response(JSON.stringify({ success: false, error: message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
    };
}
