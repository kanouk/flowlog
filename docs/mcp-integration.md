# MCP Integration Spec (FlowLog)

## Overview

FlowLog provides an MCP server via Supabase Edge Functions:

- MCP endpoint: `${VITE_SUPABASE_URL}/functions/v1/mcp-server/mcp`
- Transport: `streamable_http`
- Auth methods:
  - OAuth 2.0 Authorization Code + PKCE
  - Personal access token (PAT) via `Authorization: Bearer <token>`

## Required Runtime Configuration

Set these variables for `supabase/functions/mcp-server`:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `FLOWLOG_APP_URL`

`FLOWLOG_APP_URL` must be a valid `https://` URL of the FlowLog frontend that serves `/oauth/authorize`.

If `FLOWLOG_APP_URL` is not configured (or invalid), `/oauth/authorize` returns:

- `500 server_error`
- `error_description: "FLOWLOG_APP_URL is not configured or invalid"`

## OAuth Discovery and Metadata

The MCP server returns metadata at:

- `/.well-known/oauth-authorization-server` (including subpath variants containing this segment)
- `/.well-known/oauth-protected-resource` (including subpath variants containing this segment)

When MCP is accessed without bearer token, server returns `401` with:

- `WWW-Authenticate: Bearer realm="FlowLog MCP", resource_metadata="<protected-resource-metadata-url>"`
- `Link: <<protected-resource-metadata-url>>; rel="oauth-protected-resource"`

## Redirect URI Validation Rules

`redirect_uri` is validated in both:

- `/oauth/authorize`
- `/oauth/create-code`

Validation:

- Must be parseable URL
- Max length: 2048
- Disallowed schemes: `javascript:`, `data:`, `file:`
- `http:` allowed only for loopback (`localhost`, `127.0.0.1`, `::1`, `[::1]`)
- Non-loopback must use `https:`

## UI Behavior (Settings > MCP連携)

Two setup patterns are documented:

1. OAuth config (URL only)
2. PAT config (`Authorization` header included)

This avoids confusion for clients that support OAuth bootstrap from URL-only MCP configuration.

## Data Model Dependencies

- `public.user_api_tokens`
  - Stores SHA-256 hash of PAT/OAuth-issued access token
  - `last_used_at` updated on successful bearer authentication
- `public.oauth_authorization_codes`
  - Temporary authorization code storage (single-use, expiry controlled)

## Manual Verification Checklist

1. Open Settings > MCP連携 and confirm both OAuth/PAT config samples are shown.
2. OAuth path:
   - Configure MCP client with URL only.
   - Verify browser opens FlowLog `/oauth/authorize`.
   - Approve and confirm MCP tools become callable.
3. PAT path:
   - Generate token in FlowLog settings.
   - Configure `Authorization: Bearer <token>`.
   - Confirm MCP tools are callable.
4. Call MCP endpoint without token and confirm `401` includes `WWW-Authenticate` with `resource_metadata`.
5. Confirm invalid `redirect_uri` (e.g. `javascript:alert(1)`) is rejected.
