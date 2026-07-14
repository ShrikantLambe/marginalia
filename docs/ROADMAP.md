# Marginalia — Product Roadmap & Implementation Spec

**Audience:** Claude Code, working in the existing `marginalia` repo.
**Purpose:** Hand-off document covering the next four phases of work, in priority order. Each phase is self-contained and shippable on its own.

---

## 0. Context

Marginalia is a personal reading list with AI-generated TL;DRs. The current MVP supports: paste a URL → fetch + extract article → Gemini 2.5 Flash summarizes → save to Supabase → render in a dashboard. Stack: Next.js 15 (App Router), Stack Auth, Supabase Postgres, Gemini API, deployed on Vercel.

**Existing files Claude Code will modify:**

```
stack.ts
app/
  layout.tsx
  page.tsx
  globals.css
  dashboard/
    page.tsx                    ← server component, loads items
    reading-list.tsx            ← interactive client component
  api/items/
    route.ts                    ← POST: create + summarize
    [id]/route.ts               ← DELETE
lib/
  supabase.ts
  summarize.ts                  ← Gemini call
supabase/schema.sql
```

**Target user:** the *curator* — someone who reads to write. They're building a perspective and use the tool as a feeder for their own published output (newsletter, articles, talks). Researcher and hoarder use cases generalize from this; do not generalize the other direction.

---

## 1. Design Principles (apply to every phase)

These are non-negotiable. When in doubt, default to these.

**Organization is paid at save time, valued at retrieval time.** Every minute of friction at save reduces saves; every missing capability at retrieval reduces returns. Optimize aggressively for *low save friction* and *high retrieval power*. Tagging-as-homework is the failure mode that kills reading apps.

**AI does the heavy lifting; the user can override anywhere.** Auto-tag, auto-cluster, auto-summarize — but every AI output must be editable, and edits should never be silently overwritten by re-runs.

**Status before structure.** A working "unread / reading / read / archived" status field beats any tag taxonomy. Build status first.

**Semantic over keyword.** Once embeddings exist, prefer them. Keyword search is a fallback, not the primary mode.

**No nagging.** No reminder emails, no streak counters, no "you haven't read in 3 days." Reading apps that nag get deleted.

---

## 2. Explicitly Out of Scope

Do not build any of the following without explicit re-approval. They have been considered and rejected for this product:

- Folders, nested categories, or any hierarchical organization
- Social features (sharing, follows, public profiles, comments)
- Browser extension (defer until Phase 2 ships and the save flow is proven sticky)
- Reminder notifications, streaks, gamification
- Mobile native apps (the web app should be mobile-responsive; that's enough)
- Multi-user collaboration on lists
- Read-it-later offline mode

---

## 3. Phase 1 — Make It Sticky

**Goal:** Convert the tool from a graveyard into a working surface. After this phase, the user opens the dashboard daily because there's something *active* there, not just a wall of saved links.

**Effort estimate:** 1–2 weeks.

### 3.1 Schema changes

Add to `supabase/schema.sql` and run as a migration:

```sql
-- Phase 1 migration
alter table reading_list
  add column if not exists status text not null default 'unread'
    check (status in ('unread', 'reading', 'read', 'archived')),
  add column if not exists notes text,
  add column if not exists highlights jsonb default '[]'::jsonb,
  add column if not exists rating smallint check (rating between 1 and 5),
  add column if not exists read_at timestamptz,
  add column if not exists last_opened_at timestamptz;

create index if not exists reading_list_user_status_idx
  on reading_list(user_id, status);
```

**Notes for Claude Code:**
- `highlights` is a JSON array of `{ text: string, created_at: string }` objects. Keep it simple — no positional offsets in the source HTML, just verbatim quotes the user pastes or types.
- `rating` is optional. Surface it as a 5-star input but don't make it mandatory.
- `read_at` is set when status transitions to `'read'`. `last_opened_at` is set whenever the user clicks the article link out (used in Phase 3 for resurfacing logic).

### 3.2 API changes

**Modify** `app/api/items/[id]/route.ts` to add a `PATCH` handler:

```
PATCH /api/items/[id]
Body: { status?, notes?, rating?, highlights? }
Returns: updated ReadingItem
```

The existing `DELETE` stays. `PATCH` should:
- Verify `stackServerApp.getUser()` and that the item belongs to the user.
- When `status` changes to `'read'`, set `read_at = now()` server-side.
- When `status` changes *away* from `'read'`, clear `read_at`.
- Validate the status enum on the server (don't trust the client).

**Add** a new endpoint:

```
POST /api/items/[id]/open
Returns: { ok: true }
```

Sets `last_opened_at = now()`. Called from the client when the user clicks the article title. Use `navigator.sendBeacon` from the client so it doesn't block the link navigation.

### 3.3 UI changes

**`app/dashboard/reading-list.tsx`:**

Add a status filter at the top of the list. Default view: `unread` + `reading`. Tabs/pills for: `Unread`, `Reading`, `Read`, `Archived`, `All`. Counts next to each.

For each item, add a status control. Recommendation: a small inline pill that cycles `unread → reading → read → archived` on click, with hover label. Keep it visually quiet — this is metadata, not the main content.

Add an expandable notes area per item. Closed by default; opens on click. Inside: a textarea for notes, a "+ add highlight" button that appends to the highlights array, and an optional 5-star rating row.

**Resurfacing surface (the sticky bit):**

At the top of the dashboard, above the input, add a single "Today's pick" card. Logic:
- Pick one item where `status IN ('unread', 'reading')` AND `created_at > 7 days ago` is false (i.e., saved more than a week ago).
- Tiebreak by oldest `last_opened_at` (or never-opened first).
- Show: title, summary, "Open" button, "Mark read" button, "Not now" button (skips this item for 7 days — store in a `dismissed_until` column or in localStorage; localStorage is fine).

This single card is the feature that makes users open the app daily. Don't skip it.

### 3.4 Decisions for the user (Shrikant) before Claude Code starts

- [ ] Should "archived" items show in the All view? *Recommendation: no, surface them only in a dedicated Archived tab.*
- [ ] Default view on dashboard load: `Unread + Reading`, or just `Unread`? *Recommendation: Unread + Reading. Reading should feel active.*
- [ ] Star rating: 5-star or thumbs up/down? *Recommendation: 5-star. Curators have opinions worth more than binary signal — and ratings feed Phase 3 cluster naming.*

### 3.5 Acceptance criteria

1. Existing items default to `status = 'unread'` after the migration runs.
2. The dashboard shows a status filter; selecting a filter changes the visible list without a page reload.
3. Clicking the status pill on an item cycles through statuses and persists.
4. Notes save on blur, not on every keystroke.
5. Highlights can be added and removed; they appear inline below the summary.
6. The "Today's pick" card appears whenever there is at least one eligible item, and "Not now" hides it for 7 days.
7. Clicking an article title (a) opens the link in a new tab and (b) fires a beacon to update `last_opened_at`.
8. All new fields are editable; AI-generated summary and tags remain editable from Phase 0.

---

## 4. Phase 2 — Semantic Search

**Goal:** When the user types "what did I read about semantic layers," they get conceptually related articles regardless of whether those words appear in the title, summary, or tags. This is the feature that justifies the AI stack.

**Effort estimate:** 1 week.

### 4.1 Schema changes

Enable `pgvector` and add an embedding column:

```sql
-- Phase 2 migration
create extension if not exists vector;

alter table reading_list
  add column if not exists embedding vector(768),
  add column if not exists embedding_model text,
  add column if not exists embedded_at timestamptz;

-- HNSW index for cosine similarity. IVFFlat is also fine; HNSW is more
-- accurate at the cost of build time. For a personal-scale list either works.
create index if not exists reading_list_embedding_idx
  on reading_list using hnsw (embedding vector_cosine_ops);
```

**Notes for Claude Code:**
- Gemini's `text-embedding-004` returns 768-dim vectors. Verify the current model name and dim before coding — Google has been deprecating embedding model versions on a rolling basis.
- Store `embedding_model` so future migrations can detect stale embeddings if you switch models.

### 4.2 New library

`lib/embeddings.ts`:

```typescript
import { GoogleGenerativeAI } from "@google/generative-ai";
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

export async function embed(text: string): Promise<number[]> {
  const model = genAI.getGenerativeModel({ model: "text-embedding-004" });
  const result = await model.embedContent(text);
  return result.embedding.values;
}
```

The text to embed should be `title + "\n\n" + summary + "\n\n" + tags.join(" ")`. Do not embed the full article body — too noisy, too costly, and the summary is already a high-quality semantic distillation.

### 4.3 API changes

**Modify** `app/api/items/route.ts` (POST handler): after generating the summary, also generate an embedding and store it. If the embedding call fails, save the row anyway with `embedding = null` — never block a save on the embedding succeeding. Log the failure for backfill.

**Add** a backfill endpoint:

```
POST /api/items/backfill-embeddings
Returns: { processed: number, failed: number }
```

Iterates over the user's items where `embedding IS NULL`, generates embeddings, persists. Rate-limit Gemini calls (sleep 100ms between them) to stay under free tier limits.

**Add** a search endpoint:

```
POST /api/search
Body: { query: string, status?: string[], tags?: string[], limit?: number }
Returns: ReadingItem[] with similarity scores
```

Logic:
1. Embed the query.
2. Run cosine similarity against the user's items: `select *, 1 - (embedding <=> $1) as similarity from reading_list where user_id = $2 order by embedding <=> $1 limit $3`.
3. If `status` or `tags` filters are passed, apply them in the WHERE clause.
4. Filter out results below a similarity threshold (0.4 is a reasonable starting point — tune empirically).

### 4.4 UI changes

**`app/dashboard/reading-list.tsx`:**

Replace the existing client-side filter with a search bar at the top of the list. Behavior:
- Empty query: show the full list with status filters as before.
- Non-empty query: debounce 300ms, hit `/api/search`, render results ranked by similarity.
- Show similarity as a subtle metadata line ("87% match") in the item header.
- Keep status filters active alongside search.

**Tag chips become filters, not navigation.** Clicking a tag adds it to the active filter set. Multiple tags = AND. Show active filters as removable chips above the list.

### 4.5 Decisions for the user before Claude Code starts

- [ ] Similarity threshold: 0.4, 0.5, or "show all and let users see the score"? *Recommendation: 0.4 with score visible. Lets users calibrate.*
- [ ] Should empty-query show "recent" or "today's pick on top, then recent"? *Recommendation: keep the Phase 1 layout untouched when query is empty.*
- [ ] Re-embed when user edits the summary or tags? *Recommendation: yes, debounced. Add a `needs_reembed` boolean column and a background sweep, or just re-embed inline on PATCH if it's not too slow.*

### 4.6 Acceptance criteria

1. New saves get an embedding within the same request lifecycle (or fail gracefully and queue for backfill).
2. The backfill endpoint successfully embeds all pre-existing items.
3. Searching for a concept that doesn't appear verbatim in any article still surfaces related items (test with a real example: save 3 articles about "data quality" without using those exact words, then search "data quality").
4. Search + status + tag filters compose correctly.
5. Editing summary or tags updates the embedding.
6. Search latency is under 500ms p95 for a list under 1000 items.

---

## 5. Phase 3 — Auto-Clustering ("Reading Themes")

**Goal:** Surface what the user has been *unconsciously* reading toward. For a curator, this is the "what's my next article about?" feature.

**Effort estimate:** 1–2 weeks.

### 5.1 Schema changes

```sql
-- Phase 3 migration
create table if not exists reading_themes (
  id          uuid primary key default gen_random_uuid(),
  user_id     text not null,
  name        text not null,
  description text,
  centroid    vector(768),
  item_ids    uuid[] not null,
  item_count  int generated always as (array_length(item_ids, 1)) stored,
  generated_at timestamptz not null default now(),
  user_renamed boolean default false
);

create index if not exists reading_themes_user_idx
  on reading_themes(user_id, generated_at desc);
```

### 5.2 Clustering job

Run as a Vercel Cron job (verify current free-tier cron limits — at time of writing hobby tier supports daily crons, which is sufficient).

`app/api/cron/cluster/route.ts`:

```
GET /api/cron/cluster
Authorization: Bearer ${CRON_SECRET}
```

Logic, per user:

1. Pull all items with embeddings, last 90 days.
2. If fewer than 8 items: skip — not enough signal.
3. Run HDBSCAN clustering on the embeddings (use the `density-clustering` npm package, or call out to a Python service if you prefer; HDBSCAN handles variable cluster sizes and noise points better than k-means for this use case).
4. For each cluster with ≥ 3 items: ask Gemini to *name* it.

Cluster naming prompt:

```
You are naming a thematic cluster of articles a reader has been saving.
Given these article summaries, produce:

1. A short theme name (3-5 words, title case, no quotes).
2. A one-sentence description of what unifies these articles.

Be specific, not generic. "Data Engineering" is too broad; "Semantic Layer
Adoption Patterns" is right. Avoid corporate-speak.

ARTICLES:
{numbered list of "title — summary" for each item in the cluster}
```

5. Upsert into `reading_themes`. **Do not overwrite themes the user has manually renamed** (`user_renamed = true`).

### 5.3 UI changes

Add a "Themes" section above the reading list (collapsible, default expanded if there are ≥ 2 themes). Each theme is a card showing:
- Theme name (editable inline; sets `user_renamed = true` on edit)
- Description
- Count: "12 articles"
- Click → filters the list to that theme's items

Add a "Refresh themes" button (manual trigger) that hits the cluster endpoint for just that user. Rate-limit to once per hour per user.

### 5.4 Decisions for the user before Claude Code starts

- [ ] Cluster algorithm: HDBSCAN (handles noise, variable sizes) or k-means (simpler, predictable count)? *Recommendation: HDBSCAN. The whole point is letting themes emerge.*
- [ ] How aggressive on minimum cluster size? *Recommendation: min 3 items, min cluster_size in HDBSCAN = 3.*
- [ ] Should themes be re-generated when significant new items arrive, or only on the cron? *Recommendation: cron only at first. Don't add complexity until you see how stable themes feel in practice.*

### 5.5 Acceptance criteria

1. With 20+ saved items spanning 3+ topics, the cron generates ≥ 2 sensible themes.
2. Theme names are specific, not generic.
3. Clicking a theme filters the list correctly.
4. Renaming a theme persists across cron runs.
5. The cron endpoint is protected by a bearer token and not publicly callable.
6. Cron failures are logged but don't break the dashboard.

---

## 6. Phase 4 — Synthesis ("Draft From These")

**Goal:** Turn the reading list into a writing assistant. This is the curator endgame — the feature that makes Marginalia a daily-open tool, not a save-and-forget one.

**Effort estimate:** 1 week.

### 6.1 Schema changes

```sql
-- Phase 4 migration
create table if not exists syntheses (
  id           uuid primary key default gen_random_uuid(),
  user_id      text not null,
  title        text,
  prompt       text,
  draft        text not null,
  source_item_ids uuid[] not null,
  created_at   timestamptz not null default now()
);

create index if not exists syntheses_user_idx
  on syntheses(user_id, created_at desc);
```

### 6.2 API

```
POST /api/synthesize
Body: { item_ids: string[], angle?: string }
Returns: { id, draft }
```

The `angle` is an optional one-line direction from the user ("focus on the operational implications" or "write this for executives"). If omitted, default to a neutral synthesis.

Synthesis prompt:

```
You are helping a writer synthesize their reading into a draft article.
The writer has selected the following articles from their reading list,
along with their personal notes and highlights for each.

{For each item: title, url, summary, user notes (if any), highlights (if any)}

{If angle:} The writer wants this synthesis to: {angle}

Produce a draft with this structure:

1. A working headline (specific, not clickbait).
2. A 2-3 sentence lede establishing the question or tension.
3. 4-6 main sections, each with a header and 2-4 paragraphs of argument.
4. Inline citations as [1], [2] etc. corresponding to the source articles.
5. A "Sources" section listing the articles with their URLs.

Voice: practitioner-first, specific, willing to take a position. Avoid:
listicles, "in today's fast-paced world" filler, hedging language.

Do not invent facts. If sources disagree, say so explicitly. If the
selected articles don't support a coherent thesis, say that and suggest
what's missing.
```

### 6.3 UI

Add a multi-select mode to the reading list (toggle at the top: "Select for synthesis"). Selected items get a checkmark and a counter appears. When ≥ 2 items are selected, a floating action bar appears: "Draft from these (N)" + an optional one-line angle input.

Clicking opens a new page `/synthesis/[id]` that streams the draft as it generates (use Gemini's streaming API). Once complete, the user can:
- Edit the draft inline
- Copy to clipboard
- Export as Markdown
- Save (already done; the row is created at start)

A "Past syntheses" link in the dashboard header shows the user's previous drafts.

### 6.4 Decisions for the user before Claude Code starts

- [ ] Maximum items per synthesis? *Recommendation: 8. Beyond that, prompt context gets diluted and Gemini's quality drops.*
- [ ] Should syntheses be editable after creation, with version history, or one-shot? *Recommendation: editable inline, no version history. Treat the draft as a starting point owned by the user, not a sacred AI artifact.*
- [ ] Stream or wait? *Recommendation: stream. Cuts perceived latency dramatically.*

### 6.5 Acceptance criteria

1. Selecting 3+ items and clicking "Draft" produces a draft within 30 seconds.
2. Citations in the draft correctly correspond to source items.
3. The draft is editable and edits persist.
4. Markdown export preserves headings and citations.
5. Synthesis with `angle` set produces a measurably different draft from the same items without `angle`.
6. Past syntheses are listed and re-openable.

---

## 7. Cross-Cutting Concerns

These apply across all phases.

### 7.1 Cost guardrails

Add a `usage_log` table tracking Gemini API calls per user, per day, per operation type (summarize / embed / cluster-name / synthesize). If a user crosses a daily threshold (start at 100 operations/day), return a polite rate-limit message instead of calling Gemini. This prevents both runaway costs and accidental abuse.

```sql
create table if not exists usage_log (
  id         uuid primary key default gen_random_uuid(),
  user_id    text not null,
  operation  text not null,
  tokens_in  int,
  tokens_out int,
  created_at timestamptz not null default now()
);
create index if not exists usage_log_user_day_idx
  on usage_log(user_id, created_at);
```

### 7.2 Error handling

Every AI call must have a fallback. Specifically:
- Summary fails → save the item with `summary = null` and a "Retry summary" button on the card.
- Embedding fails → save the item, queue for backfill.
- Cluster naming fails → the cluster still exists but with an auto-generated placeholder name like "Cluster 3 (12 items)".
- Synthesis fails → return the failure to the user with the option to retry.

Never lose a save because an AI call failed.

### 7.3 Migrations

All schema changes go in numbered files in `supabase/migrations/`:

```
supabase/migrations/
  001_phase_0_initial.sql        ← move existing schema.sql here
  002_phase_1_status_notes.sql
  003_phase_2_embeddings.sql
  004_phase_3_themes.sql
  005_phase_4_syntheses.sql
  006_cross_usage_log.sql
```

Document in the README how to apply migrations (Supabase CLI: `supabase migration up`, or paste each file into the SQL editor).

### 7.4 Testing

There's no test suite in Phase 0 — that's fine for an MVP, but Phase 2's semantic search and Phase 3's clustering both have logic worth testing. Recommend adding Vitest with at least:
- Unit tests for the embedding text construction (no PII leaks, correct concatenation)
- A snapshot test for the synthesis prompt construction
- An integration test for the search endpoint (using a fixture set of embeddings)

Do not block phase shipping on test coverage; add it as a Phase 2.5 cleanup.

---

## 8. Suggested Order of Operations for Claude Code

1. Read this entire document before writing any code.
2. Confirm the decisions in §3.4, §4.5, §5.4, §6.4 with the user before starting each phase.
3. Set up `supabase/migrations/` directory; move existing schema there.
4. Implement Phase 1 end-to-end before starting Phase 2.
5. After each phase: run the full app locally, manually test the acceptance criteria, then deploy to Vercel and re-test in production. Don't batch phases.
6. Update the README after each phase to reflect new env vars, migrations, and features.

---

## 9. What Success Looks Like

At the end of Phase 4, a user can:

1. Save articles in 2 seconds with no organizing overhead.
2. Open the dashboard daily and see something actionable (Today's Pick).
3. Find any article they've saved by describing it in natural language, even months later.
4. Discover patterns in their own reading they didn't consciously notice.
5. Turn 6 saved articles + their notes into a publishable draft in under a minute.

That progression — from saving, to retrieving, to discovering, to creating — is the product. Each phase is a step up that ladder. Don't skip steps.
