import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const RAINDROP_API = 'https://api.raindrop.io/rest/v1';

Deno.serve(async (req) => {
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
    const body = await req.json().catch(() => ({}));
    const mode: 'full' | 'diff' = body.mode || (lastSyncedAt ? 'diff' : 'full');

    // Get existing URLs to avoid duplicates
    const { data: existingBlocks } = await adminClient
      .from('blocks')
      .select('content')
      .eq('user_id', user.id)
      .eq('category', 'read_later');

    const existingUrls = new Set(
      (existingBlocks || [])
        .map(b => {
          if (!b.content) return null;
          const match = b.content.match(/(https?:\/\/[^\s]+)/);
          return match ? match[0] : null;
        })
        .filter(Boolean)
    );

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
    } else {
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

    // Fetch raindrops from API
    let allRaindrops: any[] = [];
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

      const data = await resp.json();
      const items = data.items || [];

      if (mode === 'diff' && lastSyncedAt) {
        // Filter items newer than last sync
        const syncDate = new Date(lastSyncedAt);
        const newItems = items.filter((item: any) => new Date(item.lastUpdate || item.created) > syncDate);
        allRaindrops.push(...newItems);
        // If we got items older than sync date, stop
        if (newItems.length < items.length) {
          hasMore = false;
        }
      } else {
        allRaindrops.push(...items);
      }

      if (items.length < perPage) {
        hasMore = false;
      }
      page++;

      // Safety limit
      if (page > 100) break;
    }

    // Filter out already imported URLs and insert new ones
    let importedCount = 0;
    const blocksToInsert: any[] = [];

    for (const item of allRaindrops) {
      const url = item.link;
      if (!url || existingUrls.has(url)) continue;

      existingUrls.add(url); // Prevent duplicates within this batch

      const urlMetadata: Record<string, any> = {
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

    return new Response(
      JSON.stringify({ success: true, imported: importedCount, mode }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('raindrop-sync error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ success: false, error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
