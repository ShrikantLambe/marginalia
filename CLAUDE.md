# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev       # start Next.js dev server on http://localhost:3000
npm run build     # production build
npm run lint      # ESLint via next lint
npm run start     # serve the production build
npm test          # vitest — pure lib utilities only (lib/__tests__/)
```

Tests cover only pure `lib/` utilities (domains, discover enforcement, bylines, welcome resolver). No app/component tests exist.

## Environment setup

Copy `.env.example` to `.env.local` and fill in all variables:

| Variable | Source |
|---|---|
| `NEXT_PUBLIC_STACK_PROJECT_ID` | Stack Auth dashboard → API Keys |
| `NEXT_PUBLIC_STACK_PUBLISHABLE_CLIENT_KEY` | Stack Auth dashboard → API Keys |
| `STACK_SECRET_SERVER_KEY` | Stack Auth dashboard → API Keys |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Project Settings → API |
| `SUPABASE_SECRET_KEY` | Supabase → Project Settings → API Keys — the **secret** key (`sb_secret_…`), NOT publishable. Bypasses RLS. Legacy `SUPABASE_SERVICE_ROLE_KEY` still read as a fallback |
| `GEMINI_API_KEY` | https://aistudio.google.com/apikey |
| `TAVILY_API_KEY` | https://tavily.com — powers Discover web search; empty = mock provider |
| `SEARCH_PROVIDER` | optional; set to `mock` to force the mock search provider |

Add `http://localhost:3000` under **Domains & Handlers** in Stack Auth dashboard for local dev.

## Architecture

**Stack:** Next.js 15 (App Router), Stack Auth, Supabase Postgres + pgvector, Gemini API, Vercel.

**Request flow for saving a URL:**
```
POST /api/items
  → fetchAndSummarize()       (fetch URL → Readability → Gemini 2.5 Flash)
  → checkAndLog()             (atomic daily limit check + usage log)
  → embed()                   (Gemini embedding-001, 768d, fire-and-forget on failure)
  → autoRouteToBriefs()       (fire-and-forget; links item to matching open briefs at cosine ≥ 0.55)
  → supabase.insert()
  → generateEditorialNote()   (fire-and-forget, updates row after response)
```

**Workspace layout:** All authenticated pages live under `app/(workspace)/` and share a left rail navigation ([app/(workspace)/layout.tsx](app/(workspace)/layout.tsx) + `app/components/LeftRail.tsx`). The rail is 60px wide on desktop; on mobile a bottom tab bar replaces it.

**Pages in `app/(workspace)/`:**
- `home/` — the front page (post-login landing): newspaper masthead + dateline/edition from the browser clock, greeting headline, one omnibox (URL → capture inline; text → routes to /find, Library or Web), then the lede (most recent half-read article with minutes-left) or a composed quiet sentence. Deliberately does NOT use PageHeader.
- `dashboard/` — reading list; `page.tsx` is a Server Component (auth + fetch), `reading-list.tsx` is `"use client"` (all interactive state). One smart capture bar (URL → capture, text → concept search); welcome panel + recent margins live in the right column pre-selection. Failed extractions render under a "Needs attention" tab.
- `items/[id]/` — reader view; `page.tsx` fetches item + highlights server-side, `reader-view.tsx` is `"use client"`
- `briefs/` — question-driven collections list (client component); `briefs/[id]/` — brief detail + candidate items
- `find/` — unified search surface: one input + a Library/Web toggle. Library mode = debounced semantic search of saved items (`/api/search`); Web mode = guardrailed Discover through trusted sources with capture (`/api/discover`). `find-view.tsx` shell owns the input/toggle; `library-results.tsx` and `discover-panel.tsx` are the two engines. `/search` and `/discover` are thin redirects into `/find`.
- `tags/` — tag-indexed article list (Server Component, A–Z grouped; rail label "Index"). Was `index/` — renamed because a static root page prerenders to `index.html`, which shadows a dynamic `/index` route on Vercel.
- `sources/` — the Discover allowlist: trusted domains + authors, brief pins, library suggestions, guardrail log

**In-reader AI chat:** `items/[id]/chat-panel.tsx` — floating panel with general Q&A + passage threads (scoped by highlight id) + proactive scroll-stall insights. All turns persist to `chat_messages`.

**The Morning Paper:** `/home` supersedes the old Welcome Back panel — home *is* the welcome now (no dismissal, no gap gating). Resolver in [lib/home.ts](lib/home.ts) (`computeHomeState()`, pure + unit-tested); greeting/edition recompute on tab refocus after 30+ min. Post-login lands here (`stack.ts` afterSignIn); the rail wordmark links here; Inbox stays at /dashboard.

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
| `/api/items/[id]/fetch-article` | POST | Re-fetch article content (for pre-Phase 7 items) |
| `/api/items/[id]/highlights` | GET, POST | List / create highlights |
| `/api/items/[id]/highlights/[hid]` | PATCH, DELETE | Update / delete individual highlight |
| `/api/briefs` | GET, POST | List briefs (filter by status); create brief + embed question + auto-match items |
| `/api/briefs/[id]` | PATCH, DELETE | Update brief status/description; delete |
| `/api/briefs/[id]/candidates` | GET | Items that match the brief above threshold |
| `/api/briefs/[id]/attach` | POST | Manually link an item to a brief |
| `/api/briefs/[id]/dismiss` | POST | Dismiss an item from a brief |
| `/api/search` | POST | Semantic search via pgvector cosine similarity |
| `/api/themes` | GET, POST | Get themes; POST triggers re-clustering (rate-limited 1/hr) |
| `/api/themes/[id]` | PATCH | Rename a theme (sets user_renamed=true) |
| `/api/synthesize` | POST | Create synthesis row, return id |
| `/api/synthesize/[id]/stream` | POST | Stream Gemini draft, save to DB on completion (POST: it mutates + spends quota) |
| `/api/synthesize/[id]` | PATCH | Update draft/title |
| `/api/syntheses` | GET | List past syntheses |
| `/api/items/[id]/chat` | GET | Chat history for an item (all threads; client groups by highlight_id) |
| `/api/items/[id]/chat/stream` | POST | Streaming Q&A grounded in article_text (plain-text stream) |
| `/api/items/[id]/insight` | POST | Proactive reading insight (dwell/scroll-stall triggered) |
| `/api/sources` | GET, POST | List sources + library suggestions + guardrail log; add a source |
| `/api/sources/[id]` | PATCH, DELETE | Update brief pin / home domains; delete |
| `/api/discover` | GET, POST | GET: recent + saved searches. POST: guardrailed web search (allowlist-enforced, cached 24h) |
| `/api/discover/saved` | POST | Save a search (cap 20/user) |
| `/api/discover/saved/[id]` | PATCH, DELETE | Rename / delete a saved search |
| `/api/home-state` | GET | Front-page state: lede (resume item), standfirst (draft/queue), quiet sentence |
| `/api/cron/cluster` | GET | Daily cron: cluster all users (requires CRON_SECRET header) |
| `/api/debug` | GET | Health check: embed test, item counts, RPC test |
| `/api/debug/clustering` | GET | Show pairwise similarity stats + cluster counts at various epsilons |

## Key Libraries

- [lib/supabase.ts](lib/supabase.ts) — singleton Supabase client + all TypeScript types
- [lib/embeddings.ts](lib/embeddings.ts) — `embed()` (Gemini REST v1beta, key in header not URL), `parseEmbedding()` (validated parse), `buildEmbeddingText()`
- [lib/summarize.ts](lib/summarize.ts) — `fetchAndSummarize()`: fetch → Readability → Gemini; Gemini prompt contract: TL;DR then `---TAGS---` separator
- [lib/clustering.ts](lib/clustering.ts) — DBSCAN (adaptive epsilon 0.4→0.75) with k-means fallback; `clusterUser()` entry point
- [lib/editorial.ts](lib/editorial.ts) — `generateEditorialNote()`: one-sentence annotation from last 20 articles
- [lib/brief-routing.ts](lib/brief-routing.ts) — `autoRouteToBriefs()` (called after embedding a new item), `autoMatchItemsToBrief()` (called after creating a brief); cosine similarity threshold 0.55; never throws
- [lib/usage-log.ts](lib/usage-log.ts) — `checkAndLog()` (atomic check+insert via Postgres RPC); exported `DAILY_LIMIT` (400) shared across all AI operations. Use the constant in user-facing copy, never a hardcoded number
- [lib/rate-limit.ts](lib/rate-limit.ts) — in-process soft rate limiter (per-user per-endpoint)
- [lib/chat.ts](lib/chat.ts) — in-reader chat: `buildChatPrompt()`, `streamChatAnswer()`, `generateInsight()`
- [lib/domains.ts](lib/domains.ts) — `normalizeDomain()`: URL/domain → eTLD+1 via tldts (never hand-rolled)
- [lib/search-provider.ts](lib/search-provider.ts) — Tavily adapter + mock (mock includes a rogue-domain fixture for enforcement tests)
- [lib/discover.ts](lib/discover.ts) — `enforceAllowlist()` (THE guardrail — server-side re-parse of every result URL), `buildCacheKey()`
- [lib/bylines.ts](lib/bylines.ts) — `extractByline()` (JSON-LD → meta → selectors), `matchAuthor()` token-set fuzzy match
- [lib/welcome.ts](lib/welcome.ts) — `computeWelcomeState()`: deterministic resume suggestions, pure function

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
| 011 | Phase 7: article_html/text, author, site_name, hero_image_url, word_count, reading_time_minutes on reading_list; new `highlights` table; migrates old jsonb highlights |
| 012 | Phase 5: `briefs` and `brief_items` tables |
| 013 | Fix match_reading_list RPC: drops highlights column reference, adds Phase 7 metadata fields |
| 014 | Phase 1.2: item status refinements, projects + project_items tables |
| 015 | chat_messages table (in-reader Q&A, passage threads, proactive insights) |
| 016 | Discover: sources, guardrail violations, query cache, search log, saved searches |
| 017 | scroll_progress column on reading_list (Welcome Back reading progress) |
| 018 | 'failed' status + failure_reason; data-fix for corrupt failure-text summaries; draft title backfill |

**Supabase client** ([lib/supabase.ts](lib/supabase.ts)) uses the **secret** key server-side only — it bypasses RLS, so every query MUST scope by `user_id` in app code (that is the security boundary). A publishable/anon key here returns zero rows once RLS is on. Never send the secret key to the client.

**Gemini prompt contract in summarize.ts:** output must contain `---TAGS---` separator. Parser splits on this; changing the prompt without updating the parser breaks tag extraction silently.

## Security invariants

- **Saved article HTML is sanitized with DOMPurify** in [lib/summarize.ts](lib/summarize.ts) (`sanitizeHtml`) before storage, because the reader injects it via `innerHTML`. This is the XSS boundary — never downgrade it to a regex blacklist. (`isomorphic-dompurify` is in `serverExternalPackages`.)
- **User-supplied URLs are fetched only through `safeFetch`** ([lib/safe-fetch.ts](lib/safe-fetch.ts)): blocks non-http(s) schemes and private/link-local/metadata IPs, and re-validates every redirect hop (SSRF guard). Used by `summarize.ts` (capture) and `bylines.ts` (Discover byline verification).
- **Every API route resolves the Stack Auth user and filters by `user_id`.** RLS is a second layer, not the only one.
- **`/api/debug` and `/api/debug/clustering` are gated behind `ENABLE_DEBUG_ENDPOINT=1`** (404 otherwise).
- **State-mutating operations are POST**, never GET — a GET can be prefetched/crawled and silently spend Gemini budget (this is why `synthesize/[id]/stream` is POST).

## CI

[.github/workflows/ci.yml](.github/workflows/ci.yml) runs on push and PR: `tsc --noEmit` → `next lint` → `npm test` → `next build`. Lint config is [.eslintrc.json](.eslintrc.json) (`next/core-web-vitals`); `npm run lint` must pass with no errors before merge.

## Styling

Design tokens: [tailwind.config.ts](tailwind.config.ts) (`paper`, `ink`, `oxblood`, `sage`, `rule`, `muted`). Full design system in [DESIGN.md](DESIGN.md). Six colors, five serif sizes, one mono size — no additions.

## Known Issues / Debt

- Themes clustering rarely triggers for small (<15 items) diverse collections — k-means fallback helps but themes need enough same-topic articles to be meaningful.
- Rate limiter (`lib/rate-limit.ts`) is in-process only — resets per serverless cold start. Replace with Upstash Redis for multi-instance production.
- `CRON_SECRET` must be set in Vercel env vars for the daily clustering cron to authenticate.
