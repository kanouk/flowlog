# FlowLog

FlowLog is a flow-style life log application for quickly capturing daily fragments, organizing them as blocks, and turning them into structured diary or stock views with AI assistance.

## Stack

- Vite
- React
- TypeScript
- Tailwind CSS
- shadcn/ui components
- Supabase Auth, Database, Storage, and Edge Functions
- Vitest for frontend characterization tests

## Local Setup

```sh
npm install
cp .env.example .env
npm run dev
```

Fill `.env` with the Supabase project values for the target environment.

## Scripts

```sh
npm run dev       # start Vite dev server
npm run build     # production build
npm run lint      # ESLint
npm run test      # Vitest in Asia/Tokyo timezone
npm run analyze   # production build with stats.html output
npm run preview   # preview built app
```

## Environment Variables

```sh
VITE_SUPABASE_PROJECT_ID=
VITE_SUPABASE_PUBLISHABLE_KEY=
VITE_SUPABASE_URL=
```

## Core Data Model

- `entries`: one day-level container per user/date.
- `blocks`: individual captured fragments with category, tag, time, schedule, task, read-later, and image fields.
- `custom_tags`: user-defined tag labels, icons, colors, and sort order.
- `user_ai_settings`: write-only AI provider key settings. Frontend reads only safe status flags.
- `user_api_tokens`: immutable API tokens for MCP/API access.
- `user_external_tokens`: external service tokens such as Raindrop.

All user-owned tables rely on RLS policies keyed by `auth.uid() = user_id`.

## Edge Functions

- `api`: external HTTP API for authenticated FlowLog block access.
- `mcp-server`: MCP-compatible interface backed by FlowLog blocks.
- `format-entries`: AI diary formatting and scoring.
- `summarize-url`: URL metadata and summary generation for read-later blocks.
- `ocr-image`: OCR extraction from attached images.
- `raindrop-sync`: Raindrop bookmark import.
- `gyazo-upload`: upload images to Gyazo when configured.
- `gyazo-delete`: delete Gyazo-hosted images.
- `test-ai-connection`: validate configured AI provider credentials.
- `save-image-storage-settings`: persist image storage preferences.

## Documentation

- `docs/input-flow.md`: capture and block creation flow.
- `docs/mcp-integration.md`: MCP/OAuth/PAT integration details.
- `docs/ui-selection-controls.md`: selection-control UI conventions.
- `docs/refactoring-plan.md`: phased refactoring plan.
- `docs/performance-plan.md`: measured performance improvement plan.
- `docs/perceived-performance-plan.md`: perceived-speed improvement plan.
