# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev       # start Next.js dev server on http://localhost:3000
npm run build     # production build
npm run lint      # ESLint via next lint
npm run start     # serve the production build
```

No test suite exists.

## Environment setup

Copy `.env.example` to `.env.local` and fill in all variables:

| Variable | Source |
|---|---|
| `NEXT_PUBLIC_STACK_PROJECT_ID` | Stack Auth dashboard → API Keys |
| `NEXT_PUBLIC_STACK_PUBLISHABLE_CLIENT_KEY` | Stack Auth dashboard → API Keys |
| `STACK_SECRET_SERVER_KEY` | Stack Auth dashboard → API Keys |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Project Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API (service_role secret, not anon) |
| `GEMINI_API_KEY` | https://aistudio.google.com/apikey |

Add `http://localhost:3000` under **Domains & Handlers** in Stack Auth dashboard for local dev.

## Architecture

**Stack:** Next.js 15 (App Router), Stack Auth, Supabase Postgres + pgvector, Gemini API, Vercel.

**Request flow for saving a URL:**
```
POST /api/items
  → fetchAndSummarize()       (fetch URL → Readability → Gemini 2.5 Flash)
  → checkAndLog()             (atomic daily limit check + usage log)
  → embed()                   (Gemini embedding-001, 768d, fire-and-forget on failure)
  → supabase.insert()
  → generateEditorialNote()   (fire-and-forget, updates row after response)
```

**Server / client split in dashboard:**
- [app/dashboard/page.tsx](app/dashboard/page.tsx) — Server Component; authenticates, fetches items + themes
- [app/dashboard/reading-list.tsx](app/dashboard/reading-list.tsx) — `"use client"`; all interactive state

## API Routes

| Route | Method | Purpose |
|---|---|---|
| `/api/items` | POST | Save URL: fetch + summarize + embed + editorial note |
| `/api/items/[id]` | PATCH, DELETE | Update fields (status/notes/tags/summary triggers re-embed); delete |
| `/api/items/[id]/open` | POST | Beacon: update last_opened_at |
| `/api/items/[id]/retry-summary` | POST | Re-summarize + re-embed a failed item |
| `/api/items/[id]/annotate` | POST | Regenerate editorial annotation |
| `/api/items/backfill-embeddings` | POST | Embed all items missing embeddings |
| `/api/items/backfill-annotations` | POST | Annotate up to 5 items missing editorial notes |
| `/api/search` | POST | Semantic search via pgvector cosine similarity |
| `/api/themes` | GET, POST | Get themes; POST triggers re-clustering (rate-limited 1/hr) |
| `/api/themes/[id]` | PATCH | Rename a theme (sets user_renamed=true) |
| `/api/synthesize` | POST | Create synthesis row, return id |
| `/api/synthesize/[id]/stream` | GET | Stream Gemini draft, save to DB on completion |
| `/api/synthesize/[id]` | PATCH | Update draft/title |
| `/api/syntheses` | GET | List past syntheses |
| `/api/cron/cluster` | GET | Daily cron: cluster all users (requires CRON_SECRET header) |
| `/api/debug` | GET | Health check: embed test, item counts, RPC test |
| `/api/debug/clustering` | GET | Show pairwise similarity stats + cluster counts at various epsilons |

## Key Libraries

- [lib/supabase.ts](lib/supabase.ts) — singleton Supabase client + all TypeScript types
- [lib/embeddings.ts](lib/embeddings.ts) — `embed()` (Gemini REST v1beta, key in header not URL), `parseEmbedding()` (validated parse), `buildEmbeddingText()`
- [lib/summarize.ts](lib/summarize.ts) — `fetchAndSummarize()`: fetch → Readability → Gemini; Gemini prompt contract: TL;DR then `---TAGS---` separator
- [lib/clustering.ts](lib/clustering.ts) — DBSCAN (adaptive epsilon 0.4→0.75) with k-means fallback; `clusterUser()` entry point
- [lib/editorial.ts](lib/editorial.ts) — `generateEditorialNote()`: one-sentence annotation from last 20 articles
- [lib/usage-log.ts](lib/usage-log.ts) — `checkAndLog()` (atomic check+insert via Postgres RPC); 150 ops/day limit
- [lib/rate-limit.ts](lib/rate-limit.ts) — in-process soft rate limiter (per-user per-endpoint)

## Database

**Schema lives in [supabase/migrations/](supabase/migrations/).** Run migrations in numbered order in Supabase SQL Editor.

| Migration | Contents |
|---|---|
| 001 | reading_list base schema, RLS disabled |
| 002 | Phase 1: status, notes, highlights, rating, read_at, last_opened_at |
| 003 | Phase 2: pgvector extension, embedding column, HNSW index, match_reading_list RPC |
| 004 | Fix RPC overload conflict (text param vs vector param) |
| 005 | Unique constraint: (user_id, url) |
| 006 | Phase 3: reading_themes table |
| 007 | Phase 4: syntheses table, RLS disabled |
| 008 | usage_log table, RLS disabled |
| 009 | Phase 6: editorial_note, editorial_references, editorial_generated_at columns |
| 010 | check_and_log_usage Postgres RPC (atomic daily limit) |

**Supabase client** uses `service_role` key server-side only — bypasses RLS. All tables have RLS explicitly disabled. Never send `SUPABASE_SERVICE_ROLE_KEY` to the client.

**Gemini prompt contract in summarize.ts:** output must contain `---TAGS---` separator. Parser splits on this; changing the prompt without updating the parser breaks tag extraction silently.

## Styling

Design tokens: [tailwind.config.ts](tailwind.config.ts) (`paper`, `ink`, `oxblood`, `sage`, `rule`, `muted`). Full design system in [DESIGN.md](DESIGN.md). Six colors, five serif sizes, one mono size — no additions.

## Known Issues / Debt

- Themes clustering rarely triggers for small (<15 items) diverse collections — k-means fallback helps but themes need enough same-topic articles to be meaningful.
- Rate limiter (`lib/rate-limit.ts`) is in-process only — resets per serverless cold start. Replace with Upstash Redis for multi-instance production.
- `CRON_SECRET` must be set in Vercel env vars for the daily clustering cron to authenticate.
