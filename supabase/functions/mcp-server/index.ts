import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, mcp-session-id",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// FlowLogアプリのURL（環境変数から取得）
const FLOWLOG_APP_URL = Deno.env.get("FLOWLOG_APP_URL")?.trim();

function isValidHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function resolveFlowlogAppUrl(): string | null {
  if (FLOWLOG_APP_URL && isValidHttpUrl(FLOWLOG_APP_URL)) {
    return FLOWLOG_APP_URL;
  }

  // Supabase hosted environments sometimes expose site URL via these names.
  const siteUrl = Deno.env.get("SITE_URL")?.trim();
  if (siteUrl && isValidHttpUrl(siteUrl)) {
    return siteUrl;
  }

  const supabaseSiteUrl = Deno.env.get("SUPABASE_SITE_URL")?.trim();
  if (supabaseSiteUrl && isValidHttpUrl(supabaseSiteUrl)) {
    return supabaseSiteUrl;
  }

  return null;
}

function validateRedirectUri(redirectUri: string): string | null {
  if (!redirectUri || redirectUri.length > 2048) {
    return "redirect_uri is invalid";
  }

  let parsed: URL;
  try {
    parsed = new URL(redirectUri);
  } catch {
    return "redirect_uri must be a valid URL";
  }

  const protocol = parsed.protocol.toLowerCase();

  if (protocol === "javascript:" || protocol === "data:" || protocol === "file:") {
    return "redirect_uri protocol is not allowed";
  }

  if (protocol === "http:") {
    const host = parsed.hostname.toLowerCase();
    const isLoopback = host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "[::1]";
    if (!isLoopback) {
      return "redirect_uri must use https unless loopback";
    }
  }

  return null;
}

function getRequestLogContext(req: Request, url: URL) {
  return {
    method: req.method,
    path: url.pathname,
    userAgent: req.headers.get("user-agent") || "unknown",
    hasAuthorization: req.headers.has("authorization"),
    hasSessionId: req.headers.has("mcp-session-id"),
    contentType: req.headers.get("content-type") || "",
  };
}

function logRequest(stage: string, req: Request, url: URL, extra: Record<string, unknown> = {}) {
  console.log(JSON.stringify({
    stage,
    ...getRequestLogContext(req, url),
    ...extra,
  }));
}

// ユーザー認証（APIトークンから）
async function authenticateUser(authHeader: string | undefined): Promise<string | null> {
  if (!authHeader?.startsWith("Bearer ")) {
    return null;
  }
  
  const token = authHeader.slice(7);
  
  // SHA-256ハッシュを計算
  const encoder = new TextEncoder();
  const data = encoder.encode(token);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const tokenHash = hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
  
  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  
  const { data: tokenData, error } = await supabase
    .from("user_api_tokens")
    .select("user_id")
    .eq("token_hash", tokenHash)
    .single();
  
  if (error || !tokenData) {
    return null;
  }
  
  // 最終使用日時を更新
  await supabase
    .from("user_api_tokens")
    .update({ last_used_at: new Date().toISOString() })
    .eq("token_hash", tokenHash);
  
  return tokenData.user_id;
}

// ヘルパー関数: 日付を取得
function getTodayDate(): string {
  const now = new Date();
  return now.toISOString().split("T")[0];
}

// ヘルパー関数: ブロック取得
async function getBlocks(
  userId: string,
  category: string,
  options: {
    date?: string;
    start_date?: string;
    end_date?: string;
    tag?: string;
    limit?: number;
    include_completed?: boolean;
    include_past?: boolean;
    filter?: string;
  }
) {
  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  
  let query = supabase
    .from("blocks")
    .select("*")
    .eq("user_id", userId)
    .eq("category", category)
    .order("occurred_at", { ascending: false })
    .limit(options.limit || 50);
  
  // 日付フィルタ
  if (options.date) {
    const startOfDay = `${options.date}T00:00:00.000Z`;
    const endOfDay = `${options.date}T23:59:59.999Z`;
    query = query.gte("occurred_at", startOfDay).lte("occurred_at", endOfDay);
  } else if (options.start_date || options.end_date) {
    if (options.start_date) {
      query = query.gte("occurred_at", `${options.start_date}T00:00:00.000Z`);
    }
    if (options.end_date) {
      query = query.lte("occurred_at", `${options.end_date}T23:59:59.999Z`);
    }
  }
  
  // タグフィルタ
  if (options.tag) {
    query = query.eq("tag", options.tag);
  }
  
  // タスク用: 完了済みを含めるか
  if (category === "task" && !options.include_completed) {
    query = query.eq("is_done", false);
  }
  
  // スケジュール用: 過去を含めるか
  if (category === "schedule" && !options.include_past) {
    query = query.gte("starts_at", new Date().toISOString());
  }
  
  // あとで読む用: フィルタ
  if (category === "read_later" && options.filter && options.filter !== "all") {
    if (options.filter === "read") {
      query = query.eq("is_done", true);
    } else if (options.filter === "unread") {
      query = query.eq("is_done", false);
    }
  }
  
  const { data, error } = await query;
  
  if (error) {
    throw new Error(`Failed to fetch blocks: ${error.message}`);
  }
  
  return data;
}

// ヘルパー関数: ブロック追加
async function addBlock(
  userId: string,
  block: {
    category: string;
    content: string;
    tag?: string;
    occurred_at?: string;
    starts_at?: string;
    ends_at?: string;
    is_all_day?: boolean;
  }
) {
  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  
  // エントリーを取得または作成
  const date = block.occurred_at 
    ? block.occurred_at.split("T")[0] 
    : getTodayDate();
  
  let { data: entry } = await supabase
    .from("entries")
    .select("id")
    .eq("user_id", userId)
    .eq("date", date)
    .single();
  
  if (!entry) {
    const { data: newEntry, error: entryError } = await supabase
      .from("entries")
      .insert({ user_id: userId, date })
      .select("id")
      .single();
    
    if (entryError) {
      throw new Error(`Failed to create entry: ${entryError.message}`);
    }
    entry = newEntry;
  }
  
  const { data, error } = await supabase
    .from("blocks")
    .insert({
      user_id: userId,
      entry_id: entry.id,
      category: block.category,
      content: block.content,
      tag: block.tag,
      occurred_at: block.occurred_at || new Date().toISOString(),
      starts_at: block.starts_at,
      ends_at: block.ends_at,
      is_all_day: block.is_all_day || false,
    })
    .select()
    .single();
  
  if (error) {
    throw new Error(`Failed to add block: ${error.message}`);
  }
  
  return data;
}

// ヘルパー関数: タスク状態更新
async function updateTaskStatus(userId: string, taskId: string, isDone: boolean) {
  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  
  const { error } = await supabase
    .from("blocks")
    .update({ 
      is_done: isDone,
      done_at: isDone ? new Date().toISOString() : null
    })
    .eq("id", taskId)
    .eq("user_id", userId)
    .eq("category", "task");
  
  if (error) {
    throw new Error(`Failed to update task: ${error.message}`);
  }
}

// ヘルパー関数: 既読状態更新
async function markAsRead(userId: string, blockId: string, isRead: boolean) {
  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  
  const { error } = await supabase
    .from("blocks")
    .update({ 
      is_done: isRead,
      done_at: isRead ? new Date().toISOString() : null
    })
    .eq("id", blockId)
    .eq("user_id", userId)
    .eq("category", "read_later");
  
  if (error) {
    throw new Error(`Failed to update read status: ${error.message}`);
  }
}

// ヘルパー関数: 検索
async function searchBlocks(
  userId: string,
  options: {
    query: string;
    category?: string;
    tag?: string;
    limit?: number;
  }
) {
  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  
  let query = supabase
    .from("blocks")
    .select("*")
    .eq("user_id", userId)
    .ilike("content", `%${options.query}%`)
    .order("occurred_at", { ascending: false })
    .limit(options.limit || 20);
  
  if (options.category) {
    query = query.eq("category", options.category);
  }
  
  if (options.tag) {
    query = query.eq("tag", options.tag);
  }
  
  const { data, error } = await query;
  
  if (error) {
    throw new Error(`Failed to search blocks: ${error.message}`);
  }
  
  return data;
}

// ヘルパー関数: エントリー取得
async function getEntry(userId: string, date: string) {
  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  
  const { data, error } = await supabase
    .from("entries")
    .select("*")
    .eq("user_id", userId)
    .eq("date", date)
    .single();
  
  if (error) {
    return null;
  }
  
  return data;
}

// ===============================
// OAuth 2.0 関連
// ===============================

// ランダムトークン生成
function generateSecureToken(length: number = 32): string {
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return Array.from(array, b => b.toString(16).padStart(2, "0")).join("");
}

// SHA-256ハッシュ計算
async function sha256(text: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
}

// Base64URL エンコード
function base64UrlEncode(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// PKCE code_challenge 検証
async function verifyCodeChallenge(
  codeVerifier: string,
  codeChallenge: string,
  method: string
): Promise<boolean> {
  if (method === "plain") {
    return codeVerifier === codeChallenge;
  }
  
  if (method === "S256") {
    const encoder = new TextEncoder();
    const data = encoder.encode(codeVerifier);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const computed = base64UrlEncode(hashBuffer);
    return computed === codeChallenge;
  }
  
  return false;
}

// OAuth Server Metadata (RFC 8414)
function getOAuthMetadata() {
  const baseUrl = `${supabaseUrl}/functions/v1/mcp-server`;
  return {
    issuer: baseUrl,
    authorization_endpoint: `${baseUrl}/oauth/authorize`,
    token_endpoint: `${baseUrl}/oauth/token`,
    registration_endpoint: `${baseUrl}/oauth/register`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
    scopes_supported: ["mcp:full"],
  };
}

// Protected Resource Metadata (RFC 9728)
function getProtectedResourceMetadata() {
  const baseUrl = `${supabaseUrl}/functions/v1/mcp-server`;
  const flowlogAppUrl = resolveFlowlogAppUrl();
  return {
    resource: `${baseUrl}/mcp`,
    authorization_servers: [baseUrl],
    scopes_supported: ["mcp:full"],
    bearer_methods_supported: ["header"],
    resource_documentation: flowlogAppUrl ? `${flowlogAppUrl}/settings` : `${baseUrl}/health`,
  };
}

function getOAuthCompatibilityHints() {
  const baseUrl = `${supabaseUrl}/functions/v1/mcp-server`;
  const protectedResourceUrl = `${baseUrl}/.well-known/oauth-protected-resource`;
  const metadata = getOAuthMetadata();

  return {
    resource_metadata_url: protectedResourceUrl,
    authorization_server: metadata.issuer,
    authorization_servers: [metadata.issuer],
    authorization_endpoint: metadata.authorization_endpoint,
    token_endpoint: metadata.token_endpoint,
    registration_endpoint: metadata.registration_endpoint,
    scopes_supported: metadata.scopes_supported,
  };
}

// Session management for Streamable HTTP
// NOTE: Edge Functions環境ではプロセスがリクエスト間で保持されない可能性があるため、
// インメモリMapでのセッション保持は行わない。
// `Mcp-Session-Id` は initialize レスポンスでランダム値を返すだけにする。
function generateSessionId(): string {
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  return Array.from(array, (b) => b.toString(16).padStart(2, "0")).join("");
}

// 動的クライアント登録
async function handleClientRegistration(req: Request): Promise<Response> {
  try {
    const body = await req.json();
    const { client_name, redirect_uris } = body;
    
    if (!redirect_uris || !Array.isArray(redirect_uris) || redirect_uris.length === 0) {
      return new Response(JSON.stringify({ error: "invalid_request", error_description: "redirect_uris is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    
    // クライアントIDを生成（実際のプロダクションでは永続化すべき）
    const clientId = generateSecureToken(16);
    
    return new Response(JSON.stringify({
      client_id: clientId,
      client_name: client_name || "Unknown Client",
      redirect_uris,
      grant_types: ["authorization_code"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
    }), {
      status: 201,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch {
    return new Response(JSON.stringify({ error: "invalid_request" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
}

// 認可エンドポイント（FlowLogアプリにリダイレクト）
function handleAuthorize(url: URL): Response {
  const clientId = url.searchParams.get("client_id");
  const redirectUri = url.searchParams.get("redirect_uri");
  const responseType = url.searchParams.get("response_type");
  const scope = url.searchParams.get("scope") || "mcp:full";
  const state = url.searchParams.get("state");
  const codeChallenge = url.searchParams.get("code_challenge");
  const codeChallengeMethod = url.searchParams.get("code_challenge_method") || "S256";
  
  // バリデーション
  if (!clientId) {
    return new Response(JSON.stringify({ error: "invalid_request", error_description: "client_id is required" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  
  if (!redirectUri) {
    return new Response(JSON.stringify({ error: "invalid_request", error_description: "redirect_uri is required" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const redirectUriError = validateRedirectUri(redirectUri);
  if (redirectUriError) {
    return new Response(JSON.stringify({ error: "invalid_request", error_description: redirectUriError }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  
  if (responseType !== "code") {
    return new Response(JSON.stringify({ error: "unsupported_response_type" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  
  const flowlogAppUrl = resolveFlowlogAppUrl();
  if (!flowlogAppUrl) {
    return new Response(JSON.stringify({
      error: "server_error",
      error_description: "FLOWLOG_APP_URL is not configured or invalid",
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // FlowLogアプリの認可画面にリダイレクト
  const authPageUrl = new URL("/oauth/authorize", flowlogAppUrl);
  authPageUrl.searchParams.set("client_id", clientId);
  authPageUrl.searchParams.set("redirect_uri", redirectUri);
  authPageUrl.searchParams.set("scope", scope);
  if (state) authPageUrl.searchParams.set("state", state);
  if (codeChallenge) {
    authPageUrl.searchParams.set("code_challenge", codeChallenge);
    authPageUrl.searchParams.set("code_challenge_method", codeChallengeMethod);
  }
  
  return new Response(null, {
    status: 302,
    headers: {
      ...corsHeaders,
      Location: authPageUrl.toString(),
    },
  });
}

// トークンエンドポイント
async function handleToken(req: Request): Promise<Response> {
  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  
  // Content-Type によってパースを変える
  const contentType = req.headers.get("Content-Type") || "";
  let grantType: string | null = null;
  let code: string | null = null;
  let codeVerifier: string | null = null;
  let redirectUri: string | null = null;
  
  if (contentType.includes("application/x-www-form-urlencoded")) {
    const text = await req.text();
    const params = new URLSearchParams(text);
    grantType = params.get("grant_type");
    code = params.get("code");
    codeVerifier = params.get("code_verifier");
    redirectUri = params.get("redirect_uri");
  } else {
    try {
      const body = await req.json();
      grantType = body.grant_type;
      code = body.code;
      codeVerifier = body.code_verifier;
      redirectUri = body.redirect_uri;
    } catch {
      return new Response(JSON.stringify({ error: "invalid_request" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  }
  
  if (grantType !== "authorization_code") {
    return new Response(JSON.stringify({ error: "unsupported_grant_type" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  
  if (!code) {
    return new Response(JSON.stringify({ error: "invalid_request", error_description: "code is required" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  
  // 認可コードを検索
  const { data: authCode, error: codeError } = await supabase
    .from("oauth_authorization_codes")
    .select("*")
    .eq("code", code)
    .single();
  
  if (codeError || !authCode) {
    return new Response(JSON.stringify({ error: "invalid_grant", error_description: "Invalid or expired code" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  
  // 期限切れチェック
  if (new Date(authCode.expires_at) < new Date()) {
    // 期限切れコードを削除
    await supabase.from("oauth_authorization_codes").delete().eq("id", authCode.id);
    return new Response(JSON.stringify({ error: "invalid_grant", error_description: "Code expired" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  
  // redirect_uri 検証
  if (redirectUri && redirectUri !== authCode.redirect_uri) {
    return new Response(JSON.stringify({ error: "invalid_grant", error_description: "redirect_uri mismatch" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  
  // PKCE検証（code_challenge がある場合）
  if (authCode.code_challenge) {
    if (!codeVerifier) {
      return new Response(JSON.stringify({ error: "invalid_request", error_description: "code_verifier is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    
    const isValid = await verifyCodeChallenge(
      codeVerifier,
      authCode.code_challenge,
      authCode.code_challenge_method || "S256"
    );
    
    if (!isValid) {
      return new Response(JSON.stringify({ error: "invalid_grant", error_description: "code_verifier mismatch" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  }
  
  // 認可コードを削除（一度だけ使用可能）
  await supabase.from("oauth_authorization_codes").delete().eq("id", authCode.id);
  
  // アクセストークンを生成
  const accessToken = generateSecureToken(32);
  const tokenHash = await sha256(accessToken);
  
  // APIトークンとして保存
  const { error: tokenError } = await supabase
    .from("user_api_tokens")
    .insert({
      user_id: authCode.user_id,
      name: `OAuth: ${authCode.client_id}`,
      token_hash: tokenHash,
    });
  
  if (tokenError) {
    return new Response(JSON.stringify({ error: "server_error", error_description: "Failed to create token" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  
  return new Response(JSON.stringify({
    access_token: accessToken,
    token_type: "Bearer",
    scope: authCode.scope || "mcp:full",
  }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// 認可コード作成API（フロントエンドから呼ばれる）
async function handleCreateAuthorizationCode(req: Request): Promise<Response> {
  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  
  // ユーザー認証（Supabase Auth JWTを使用）
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  
  const jwt = authHeader.slice(7);
  const { data: { user }, error: authError } = await supabase.auth.getUser(jwt);
  
  if (authError || !user) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  
  try {
    const body = await req.json();
    const { client_id, redirect_uri, scope, state, code_challenge, code_challenge_method } = body;
    
    if (!client_id || !redirect_uri) {
      return new Response(JSON.stringify({ error: "invalid_request", error_description: "client_id and redirect_uri are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const redirectUriError = validateRedirectUri(redirect_uri);
    if (redirectUriError) {
      return new Response(JSON.stringify({ error: "invalid_request", error_description: redirectUriError }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    
    // 認可コードを生成
    const code = generateSecureToken(32);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10分後
    
    // DBに保存
    const { error: insertError } = await supabase
      .from("oauth_authorization_codes")
      .insert({
        user_id: user.id,
        code,
        client_id,
        redirect_uri,
        scope: scope || "mcp:full",
        state,
        code_challenge,
        code_challenge_method,
        expires_at: expiresAt.toISOString(),
      });
    
    if (insertError) {
      console.error("Failed to insert auth code:", insertError);
      return new Response(JSON.stringify({ error: "server_error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    
    // リダイレクトURLを構築
    const callbackUrl = new URL(redirect_uri);
    callbackUrl.searchParams.set("code", code);
    if (state) callbackUrl.searchParams.set("state", state);
    
    return new Response(JSON.stringify({ redirect_url: callbackUrl.toString() }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch {
    return new Response(JSON.stringify({ error: "invalid_request" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
}

// MCPツール定義
const TOOLS = [
  {
    name: "list_events",
    description: "出来事（event）一覧を取得します",
    inputSchema: {
      type: "object",
      properties: {
        date: { type: "string", description: "日付 (YYYY-MM-DD)。省略時は全期間" },
        start_date: { type: "string", description: "開始日 (YYYY-MM-DD)" },
        end_date: { type: "string", description: "終了日 (YYYY-MM-DD)" },
        tag: { type: "string", description: "タグでフィルタ" },
        limit: { type: "number", description: "取得件数 (デフォルト: 50)" },
      },
    },
  },
  {
    name: "add_event",
    description: "出来事を追加します",
    inputSchema: {
      type: "object",
      properties: {
        content: { type: "string", description: "内容" },
        occurred_at: { type: "string", description: "発生日時 (ISO 8601)。省略時は現在" },
        tag: { type: "string", description: "タグ" },
      },
      required: ["content"],
    },
  },
  {
    name: "list_tasks",
    description: "タスク一覧を取得します",
    inputSchema: {
      type: "object",
      properties: {
        include_completed: { type: "boolean", description: "完了済みも含めるか (デフォルト: false)" },
        tag: { type: "string", description: "タグでフィルタ" },
        limit: { type: "number", description: "取得件数 (デフォルト: 50)" },
      },
    },
  },
  {
    name: "add_task",
    description: "タスクを追加します",
    inputSchema: {
      type: "object",
      properties: {
        content: { type: "string", description: "タスクの内容" },
        tag: { type: "string", description: "タグ" },
      },
      required: ["content"],
    },
  },
  {
    name: "complete_task",
    description: "タスクを完了/未完了にします",
    inputSchema: {
      type: "object",
      properties: {
        task_id: { type: "string", description: "タスクのID" },
        is_done: { type: "boolean", description: "完了にするか (デフォルト: true)" },
      },
      required: ["task_id"],
    },
  },
  {
    name: "list_schedules",
    description: "予定一覧を取得します",
    inputSchema: {
      type: "object",
      properties: {
        include_past: { type: "boolean", description: "過去の予定も含めるか (デフォルト: false)" },
        start_date: { type: "string", description: "開始日 (YYYY-MM-DD)" },
        end_date: { type: "string", description: "終了日 (YYYY-MM-DD)" },
        limit: { type: "number", description: "取得件数 (デフォルト: 50)" },
      },
    },
  },
  {
    name: "add_schedule",
    description: "予定を追加します",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string", description: "予定のタイトル" },
        details: { type: "string", description: "詳細" },
        starts_at: { type: "string", description: "開始日時 (ISO 8601)" },
        ends_at: { type: "string", description: "終了日時 (ISO 8601)" },
        is_all_day: { type: "boolean", description: "終日予定か (デフォルト: false)" },
        tag: { type: "string", description: "タグ" },
      },
      required: ["title", "starts_at"],
    },
  },
  {
    name: "list_memos",
    description: "メモ一覧を取得します",
    inputSchema: {
      type: "object",
      properties: {
        date: { type: "string", description: "日付 (YYYY-MM-DD)" },
        start_date: { type: "string", description: "開始日 (YYYY-MM-DD)" },
        end_date: { type: "string", description: "終了日 (YYYY-MM-DD)" },
        tag: { type: "string", description: "タグでフィルタ" },
        limit: { type: "number", description: "取得件数 (デフォルト: 50)" },
      },
    },
  },
  {
    name: "add_memo",
    description: "メモを追加します",
    inputSchema: {
      type: "object",
      properties: {
        content: { type: "string", description: "メモの内容" },
        tag: { type: "string", description: "タグ" },
      },
      required: ["content"],
    },
  },
  {
    name: "list_read_later",
    description: "あとで読むリストを取得します",
    inputSchema: {
      type: "object",
      properties: {
        filter: { type: "string", enum: ["all", "unread", "read"], description: "フィルタ (デフォルト: all)" },
        tag: { type: "string", description: "タグでフィルタ" },
        limit: { type: "number", description: "取得件数 (デフォルト: 50)" },
      },
    },
  },
  {
    name: "add_read_later",
    description: "あとで読むリストにURLを追加します",
    inputSchema: {
      type: "object",
      properties: {
        url: { type: "string", description: "保存するURL" },
        comment: { type: "string", description: "コメント" },
        tag: { type: "string", description: "タグ" },
      },
      required: ["url"],
    },
  },
  {
    name: "mark_as_read",
    description: "あとで読むアイテムを既読/未読にします",
    inputSchema: {
      type: "object",
      properties: {
        block_id: { type: "string", description: "ブロックのID" },
        is_read: { type: "boolean", description: "既読にするか (デフォルト: true)" },
      },
      required: ["block_id"],
    },
  },
  {
    name: "search_blocks",
    description: "全カテゴリを横断してキーワード検索します",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "検索キーワード" },
        category: { type: "string", enum: ["event", "task", "schedule", "thought", "read_later"], description: "カテゴリでフィルタ" },
        tag: { type: "string", description: "タグでフィルタ" },
        limit: { type: "number", description: "取得件数 (デフォルト: 20)" },
      },
      required: ["query"],
    },
  },
  {
    name: "get_entry",
    description: "指定日の日記（AI整形版）を取得します",
    inputSchema: {
      type: "object",
      properties: {
        date: { type: "string", description: "日付 (YYYY-MM-DD)" },
      },
      required: ["date"],
    },
  },
];

// ツール実行
async function executeTool(userId: string, toolName: string, args: Record<string, unknown>): Promise<unknown> {
  switch (toolName) {
    case "list_events":
      return await getBlocks(userId, "event", args);
    
    case "add_event": {
      const block = await addBlock(userId, {
        category: "event",
        content: args.content as string,
        occurred_at: args.occurred_at as string | undefined,
        tag: args.tag as string | undefined,
      });
      return { id: block.id, message: "出来事を追加しました" };
    }
    
    case "list_tasks":
      return await getBlocks(userId, "task", args);
    
    case "add_task": {
      const block = await addBlock(userId, {
        category: "task",
        content: args.content as string,
        tag: args.tag as string | undefined,
      });
      return { id: block.id, message: "タスクを追加しました" };
    }
    
    case "complete_task": {
      const isDone = args.is_done !== false;
      await updateTaskStatus(userId, args.task_id as string, isDone);
      return { message: isDone ? "タスクを完了にしました" : "タスクを未完了に戻しました" };
    }
    
    case "list_schedules":
      return await getBlocks(userId, "schedule", args);
    
    case "add_schedule": {
      const content = args.details 
        ? `${args.title}\n${args.details}` 
        : args.title as string;
      const block = await addBlock(userId, {
        category: "schedule",
        content,
        starts_at: args.starts_at as string,
        ends_at: args.ends_at as string | undefined,
        is_all_day: args.is_all_day as boolean | undefined,
        tag: args.tag as string | undefined,
      });
      return { id: block.id, message: "予定を追加しました" };
    }
    
    case "list_memos":
      return await getBlocks(userId, "thought", args);
    
    case "add_memo": {
      const block = await addBlock(userId, {
        category: "thought",
        content: args.content as string,
        tag: args.tag as string | undefined,
      });
      return { id: block.id, message: "メモを追加しました" };
    }
    
    case "list_read_later":
      return await getBlocks(userId, "read_later", args);
    
    case "add_read_later": {
      const content = args.comment 
        ? `${args.url}\n${args.comment}` 
        : args.url as string;
      const block = await addBlock(userId, {
        category: "read_later",
        content,
        tag: args.tag as string | undefined,
      });
      return { id: block.id, message: "あとで読むに追加しました" };
    }
    
    case "mark_as_read": {
      const isRead = args.is_read !== false;
      await markAsRead(userId, args.block_id as string, isRead);
      return { message: isRead ? "既読にしました" : "未読に戻しました" };
    }
    
    case "search_blocks":
      return await searchBlocks(userId, args as { query: string; category?: string; tag?: string; limit?: number });
    
    case "get_entry": {
      const entry = await getEntry(userId, args.date as string);
      if (!entry) {
        return { message: "日記がありません" };
      }
      return {
        date: entry.date,
        summary: entry.summary,
        formatted_content: entry.formatted_content,
        score: entry.score,
        score_details: entry.score_details,
      };
    }
    
    default:
      throw new Error(`Unknown tool: ${toolName}`);
  }
}

// MCP JSON-RPCハンドラ（セッションID対応）
interface McpRequestContext {
  userId: string;
  sessionId?: string;
  isNewSession?: boolean;
}

async function handleMcpRequest(ctx: McpRequestContext, body: unknown): Promise<{ response: unknown; sessionId?: string }> {
  const request = body as { jsonrpc: string; id?: string | number; method: string; params?: unknown };
  
  if (request.jsonrpc !== "2.0") {
    return { response: { jsonrpc: "2.0", id: request.id, error: { code: -32600, message: "Invalid Request" } } };
  }
  
  try {
    switch (request.method) {
      case "initialize": {
        // セッションIDを生成（保持・検証はしない。各リクエストはBearerトークンで認証する）
        const newSessionId = generateSessionId();

        return {
          response: {
            jsonrpc: "2.0",
            id: request.id,
            result: {
              protocolVersion: "2025-03-26",
              capabilities: {
                tools: { listChanged: false },
              },
              serverInfo: {
                name: "flowlog",
                version: "1.0.0",
              },
            },
          },
          sessionId: newSessionId,
        };
      }
      
      case "notifications/initialized":
        return { response: null }; // No response for notifications
      
      case "tools/list":
        return {
          response: {
            jsonrpc: "2.0",
            id: request.id,
            result: { tools: TOOLS },
          },
        };
      
      case "tools/call": {
        const params = request.params as { name: string; arguments?: Record<string, unknown> };
        const result = await executeTool(ctx.userId, params.name, params.arguments || {});
        return {
          response: {
            jsonrpc: "2.0",
            id: request.id,
            result: {
              content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
            },
          },
        };
      }
      
      case "ping":
        return {
          response: {
            jsonrpc: "2.0",
            id: request.id,
            result: {},
          },
        };

      default:
        return {
          response: {
            jsonrpc: "2.0",
            id: request.id,
            error: { code: -32601, message: "Method not found" },
          },
        };
    }
  } catch (error) {
    return {
      response: {
        jsonrpc: "2.0",
        id: request.id,
        error: { code: -32000, message: error instanceof Error ? error.message : "Unknown error" },
      },
    };
  }
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const path = url.pathname;
  const normalizedPath = path.length > 1 && path.endsWith("/") ? path.slice(0, -1) : path;
  const hasAuthorizationServerWellKnown = normalizedPath.includes("/.well-known/oauth-authorization-server");
  const hasProtectedResourceWellKnown = normalizedPath.includes("/.well-known/oauth-protected-resource");

  logRequest("incoming_request", req, url);
  
  // CORS preflight
  if (req.method === "OPTIONS") {
    logRequest("cors_preflight", req, url);
    return new Response(null, { headers: corsHeaders });
  }
  
  // ===== OAuth 2.0 エンドポイント =====
  
  // OAuth Server Metadata (RFC 8414)
  if (
    (normalizedPath.endsWith("/.well-known/oauth-authorization-server") || hasAuthorizationServerWellKnown) &&
    req.method === "GET"
  ) {
    logRequest("oauth_authorization_server_metadata", req, url);
    return new Response(JSON.stringify(getOAuthMetadata()), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  
  // Protected Resource Metadata (RFC 9728)
  if (
    (normalizedPath.endsWith("/.well-known/oauth-protected-resource") || hasProtectedResourceWellKnown) &&
    req.method === "GET"
  ) {
    logRequest("oauth_protected_resource_metadata", req, url);
    return new Response(JSON.stringify(getProtectedResourceMetadata()), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  
  // 動的クライアント登録
  if (normalizedPath.endsWith("/oauth/register") && req.method === "POST") {
    logRequest("oauth_register", req, url);
    return await handleClientRegistration(req);
  }
  
  // 認可エンドポイント
  if (normalizedPath.endsWith("/oauth/authorize") && req.method === "GET") {
    logRequest("oauth_authorize", req, url, {
      hasClientId: url.searchParams.has("client_id"),
      hasRedirectUri: url.searchParams.has("redirect_uri"),
    });
    return handleAuthorize(url);
  }
  
  // トークンエンドポイント
  if (normalizedPath.endsWith("/oauth/token") && req.method === "POST") {
    logRequest("oauth_token", req, url);
    return await handleToken(req);
  }
  
  // 認可コード作成API（フロントエンドから呼ばれる）
  if (normalizedPath.endsWith("/oauth/create-code") && req.method === "POST") {
    logRequest("oauth_create_code", req, url);
    return await handleCreateAuthorizationCode(req);
  }
  
  // ===== 既存のMCPエンドポイント =====
  
  // Health check
  if (normalizedPath.endsWith("/health")) {
    logRequest("health_check", req, url);
    return new Response(JSON.stringify({ status: "ok", version: "1.0.0" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  
  // MCP endpoint
  if (normalizedPath.endsWith("/mcp") || normalizedPath.includes("/mcp/")) {
    logRequest("mcp_entry", req, url);
    const authHeader = req.headers.get("Authorization");
    const userId = await authenticateUser(authHeader ?? undefined);
    
    if (!userId) {
      logRequest("mcp_unauthorized", req, url);
      // RFC 9728準拠: resource_metadataパラメータで認証方式を通知
      const resourceMetadataUrl = `${supabaseUrl}/functions/v1/mcp-server/.well-known/oauth-protected-resource`;
      const authBaseUrl = `${supabaseUrl}/functions/v1/mcp-server`;
      const compatibilityHints = getOAuthCompatibilityHints();
      return new Response(JSON.stringify({ 
        error: "unauthorized",
        error_description: "Bearer token required. Obtain via OAuth or API token.",
        ...compatibilityHints,
      }), {
        status: 401,
        headers: { 
          ...corsHeaders, 
          "Content-Type": "application/json",
          "WWW-Authenticate": `Bearer realm="${authBaseUrl}", resource_metadata="${resourceMetadataUrl}"`,
          "Link": `<${resourceMetadataUrl}>; rel="oauth-protected-resource"`,
        },
      });
    }
    
    // セッションIDを取得（あれば）
    const incomingSessionId = req.headers.get("mcp-session-id") ?? undefined;
    
    // POST: JSON-RPC リクエスト処理
    if (req.method === "POST") {
      try {
        const body = await req.json();
        const request = body as { method?: string };
        logRequest("mcp_post", req, url, { rpcMethod: request.method || "unknown" });
        const ctx: McpRequestContext = {
          userId,
          sessionId: incomingSessionId,
        };
        const result = await handleMcpRequest(ctx, body);
        
        if (result.response === null) {
          return new Response(null, { status: 204, headers: corsHeaders });
        }
        
        // セッションIDを返す（initialize時のみ新規生成）
        const responseHeaders: Record<string, string> = {
          ...corsHeaders,
          "Content-Type": "application/json",
        };
        if (result.sessionId) {
          responseHeaders["Mcp-Session-Id"] = result.sessionId;
        }
        
        return new Response(JSON.stringify(result.response), {
          headers: responseHeaders,
        });
      } catch (error) {
        console.error(JSON.stringify({
          stage: "mcp_parse_error",
          ...getRequestLogContext(req, url),
          error: error instanceof Error ? error.message : "unknown",
        }));
        return new Response(JSON.stringify({
          jsonrpc: "2.0",
          error: { code: -32700, message: "Parse error" },
        }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }
    
    // DELETE: セッション終了 (MCP 2025-03-26)
    if (req.method === "DELETE") {
      logRequest("mcp_delete", req, url);
      return new Response(null, { status: 200, headers: corsHeaders });
    }

    // GET / その他: 405 Method Not Allowed
    // POST ベースの JSON-RPC のみサポート。GET SSE は不要。
    logRequest("mcp_method_not_allowed", req, url);
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json", "Allow": "POST, DELETE" },
    });
  }
  
  logRequest("not_found", req, url);
  return new Response(JSON.stringify({ error: "Not Found", path }), {
    status: 404,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
