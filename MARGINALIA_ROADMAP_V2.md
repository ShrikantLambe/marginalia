# Marginalia — Roadmap Vol. II

**Audience:** Claude Code, working in the existing `marginalia` repo (Vol. I phases 1 and 2 are shipped to https://marginalia-tldr.vercel.app).
**Purpose:** Two new features that have no real competitor in the read-it-later space, plus a visual organization guide so the new pages don't drift into generic SaaS aesthetics.

---

## 0. Context

Vol. I delivered: status workflow, notes, highlights, ratings, semantic search via embeddings, and themes scaffolding. The dashboard works and looks editorial. Vol. II adds two features the curator workflow needs but no off-the-shelf tool offers, plus a design system to keep the app coherent as it grows past one page.

The two features:

1. **Briefs** — first-class question objects that organize reading by *intent*, not by topic.
2. **Editorial Annotations** — a single-line AI-generated note on each saved item that places it in the context of the user's prior reading.

Both leverage what Marginalia uniquely owns: the user's full reading corpus, plus their highlights and notes. Neither is buildable by a SaaS competitor without that data.

---

## 1. Design Philosophy (read this before implementing anything)

The product's visual identity is *editorial*, not SaaS. This means:

**Type does the heavy lifting.** Hierarchy comes from scale and treatment (italic, small-caps, drop cap), not from boxes, cards, shadows, or color blocks. If a new feature requires a card to communicate, it's probably the wrong implementation.

**Asymmetric, not centered.** The current dashboard is single-column-centered, which is fine for the reading list itself but will get monotonous across multiple pages. New pages should use asymmetric layouts — main content shifted slightly left, generous right margin used for metadata, marginalia, and secondary content.

**One accent color.** Oxblood (#7a1f1f). Do not introduce a second accent. If something needs to stand out beyond what oxblood provides, use weight, scale, or italic — not a new color.

**Marginalia as a literal pattern.** The app is named after notes-in-the-margin. Use the right margin of content pages to hold notes, highlights, metadata, and AI annotations — not below the content in a disclosure or accordion. This is the visual signature that distinguishes Marginalia from every other reading app.

**Sentence case in copy, small-caps for chrome.** Article titles in title case (or sentence case, whichever the source uses); navigation, metadata, and labels in `font-mono` small-caps with letter-spacing. Avoid Title Case in interface chrome; it reads as corporate.

**Forbidden patterns:**

- Drop shadows on cards
- Gradient buttons or backgrounds
- Sans-serif body copy (chrome can be mono; body must be Crimson Pro)
- Pills/badges for everything (use prose where prose works)
- Centered everything
- "Modern SaaS" iconography (lucide-react etc. is fine for chrome only — never for content)
- Dark mode in Vol. II (commit to one mode and do it well; dark editorial design is a separate problem)

**Reference sites worth studying:**

- [Are.na](https://are.na) — research/curation, owns the same audience
- [Craig Mod](https://craigmod.com) — writer-focused web typography
- [Stratechery](https://stratechery.com) — paid newsletter, text-forward
- [The Marginalian](https://themarginalian.org) — same name root, curator audience
- [Robin Sloan's website](https://www.robinsloan.com) — playful editorial
- [Read Something Wonderful](https://readsomethingwonderful.com) — beautiful list-as-product

Do *not* use as references: Notion, Linear, Vercel's marketing site, any YC-startup landing page, Stripe, or anything from Dribbble's "dashboard" tag.

---

## 2. Phase 5 — Briefs (question-driven reading)

**Goal:** Reorganize the app around the question "what am I reading toward?" not "what have I saved?" A brief is a sentence-long question or angle, persisted as a first-class object, with articles routed to it via embedding similarity. The brief becomes the container for both the reading and the eventual draft.

**Effort estimate:** 1–2 weeks.

### 2.1 Schema

```sql
-- supabase/migrations/007_phase_5_briefs.sql

create table if not exists briefs (
  id              uuid primary key default gen_random_uuid(),
  user_id         text not null,
  question        text not null,
  description     text,
  embedding       vector(768),
  status          text not null default 'open'
                  check (status in ('open', 'drafting', 'closed', 'archived')),
  closed_reason   text,
  created_at      timestamptz not null default now(),
  closed_at       timestamptz
);

create table if not exists brief_items (
  brief_id        uuid not null references briefs(id) on delete cascade,
  item_id         uuid not null references reading_list(id) on delete cascade,
  added_at        timestamptz not null default now(),
  added_by        text not null check (added_by in ('user', 'auto')),
  similarity      real,
  user_dismissed  boolean default false,
  primary key (brief_id, item_id)
);

create index if not exists briefs_user_status_idx
  on briefs(user_id, status);

create index if not exists brief_items_brief_idx
  on brief_items(brief_id, added_at desc);
```

**Notes for Claude Code:**

The brief's `embedding` is generated from `question + "\n\n" + (description ?? "")`. This is what new saves get matched against.

The `status` field matters: `open` means the user is actively reading toward it; `drafting` means a draft has been started; `closed` means the question was answered (and `closed_reason` records what they concluded); `archived` means they abandoned it. Closed and archived briefs stay searchable but are hidden from the default dashboard.

`brief_items.added_by = 'user'` means the user manually attached an article; `'auto'` means the embedding similarity matched it. Users can dismiss auto-matches without deleting the article — this is the `user_dismissed` flag. Dismissals teach the system: don't auto-attach this article to this brief again.

### 2.2 API

```
POST   /api/briefs                  Create a brief: { question, description? }
GET    /api/briefs                  List briefs, filterable by status
GET    /api/briefs/[id]             Get a brief with attached items
PATCH  /api/briefs/[id]             Update question, description, status, closed_reason
DELETE /api/briefs/[id]             Permanent delete (use sparingly; archive is preferred)

POST   /api/briefs/[id]/attach      Body: { item_id }. Manual attach.
POST   /api/briefs/[id]/dismiss     Body: { item_id }. Mark an auto-match as dismissed.
GET    /api/briefs/[id]/candidates  Returns items NOT yet attached, ranked by similarity.
                                    For the "you might have missed these" sidebar.
```

**Auto-routing on save.** Modify `POST /api/items` (the existing save endpoint): after the embedding is generated, compute cosine similarity against every open brief's embedding. For any brief above similarity threshold 0.55 (tunable), insert into `brief_items` with `added_by = 'auto'`. This happens server-side, asynchronously if needed; do not block the save response on it.

**Re-embed on edit.** When a brief's question or description changes, regenerate the embedding and re-evaluate auto-matches against the user's existing items. This is a small batch job — fine to run inline on PATCH for a single user.

### 2.3 UI

Briefs become the new top-level navigation. The dashboard you have now becomes "All articles" — it's still there, but it's no longer the primary entry point.

**New top navigation:** `BRIEFS · ALL · DRAFTS · INDEX`. Briefs is leftmost and default. "All" is the existing dashboard.

**Briefs index page (`/briefs`):**

A list of the user's open briefs, each rendered as an editorial card — not a SaaS card. Visual treatment:

- The question itself in large serif italic, set in Crimson Pro at ~28px.
- Below it, a thin rule, then the description in roman at ~16px.
- A metadata line in mono small-caps showing: number of articles attached, last activity, status.
- No card border, no background fill. Briefs are separated by generous whitespace and a thin horizontal rule between them.

At the top of the page: a single input "Ask a question…" that creates a new brief. No modal, no form — a single sentence input that, on enter, creates the brief and navigates to it.

Empty state: italic serif, *"No open briefs. What are you reading toward?"* with the input below.

**Brief detail page (`/briefs/[id]`):**

Two-column layout, asymmetric. Left column (60% width) is the brief itself plus attached articles. Right column (35%, with a 5% gutter) is the marginalia: candidates that auto-matched, dismissed items (collapsible), and a "Convert to draft" action.

Top of left column: the question as a large italic serif headline. Below it the description, editable inline on click. Below that, the attached articles, rendered in the same compact format as the dashboard but with a small "—" remove control on hover and a similarity score in mono small-caps next to the title.

Right column: candidate articles ranked by similarity, with a "+" to attach and an "×" to dismiss. Below that, a "Close brief" action with an inline textarea for `closed_reason`.

**Save flow integration.** When the user saves a new article and it auto-matches to a brief, surface this in the response: a small italic note at the bottom of the new card saying *"Routed to: [brief question]"* with a link. This makes the routing visible instead of silent.

### 2.4 Decisions for Shrikant before Claude Code starts

- [ ] Make briefs the new home page, or keep "All" as home and put Briefs second? *Recommendation: Briefs as home. The whole point is reorganizing around intent.*
- [ ] Auto-match similarity threshold: 0.55, 0.6, or "show all auto-matches and let user dismiss"? *Recommendation: 0.55 with user-dismissed flag teaching the system. Lower threshold + good dismissal UX beats high threshold + missed connections.*
- [ ] Should closing a brief auto-archive its articles? *Recommendation: no. The articles stay in the reading list at their current status. Closing a brief is about the question, not the articles.*

### 2.5 Acceptance criteria

1. User can create a brief with one input and one keystroke (enter).
2. Existing articles are matched against a new brief at creation time.
3. New saves auto-match against open briefs without blocking the save.
4. The brief detail page shows attached articles, candidates, and dismissed items in three clear surfaces.
5. Dismissed auto-matches do not re-appear after re-embedding.
6. Closing a brief preserves the question, description, articles, and adds a `closed_reason`.
7. The page works without JavaScript for read paths (uses Next.js server components).

---

## 3. Phase 6 — Editorial Annotations ("Why this matters to me")

**Goal:** When a user saves an article, generate a single sentence — alongside the TL;DR — that places it in the context of their prior reading. The sentence reads like an editorial note from a research assistant: *"This connects to your interest in semantic conflict resolution, and offers a sharper take than the Cube article you saved last week."*

**Effort estimate:** 3–5 days.

### 3.1 Schema

```sql
-- supabase/migrations/008_phase_6_editorial.sql

alter table reading_list
  add column if not exists editorial_note text,
  add column if not exists editorial_references uuid[] default '{}',
  add column if not exists editorial_generated_at timestamptz;
```

`editorial_note` is the one-line sentence. `editorial_references` is an array of item IDs the note refers to (so the UI can render them as inline links).

### 3.2 API

Modify `POST /api/items`: after summary + embedding + auto-routing, run one more Gemini call to generate the editorial note.

The prompt:

```
You are a research assistant writing a one-sentence editorial note for a
reader's saved article. The note should help the reader see how this
article connects to (or contrasts with) what they've recently read.

Below are the reader's 20 most recent articles, with their summaries.
Below that is the new article they just saved.

Write ONE sentence — under 30 words — that does ONE of these:

a) Connects this to a recurring theme they've been reading about.
b) Notes a contrast or contradiction with a specific prior article.
c) Identifies what's new or notable in this article relative to their corpus.
d) Flags an unanswered question this article opens up.

Do NOT summarize the article — that's already done elsewhere.
Do NOT use empty connectors like "this article discusses" or "interestingly".
DO reference specific prior articles by their topic when applicable.

Return JSON: { "note": "...", "references": ["uuid1", "uuid2"] }
where `references` are the item IDs of any prior articles you referenced.
If you didn't reference any specific prior article, use [].

RECENT READING:
{numbered list of "id: title — summary" for last 20 items}

NEW ARTICLE:
{title — summary}
```

Persist the result. If the call fails or returns empty, leave the field null and the UI degrades gracefully.

**Re-generate trigger.** When the user adds 5+ new articles since the note was generated, the note is potentially stale. Add a small "↻" control on the card that re-runs the call. Do not auto-regenerate — this is user-driven.

### 3.3 UI

The note appears below the summary, in italic serif, prefixed with a thin oxblood vertical rule (à la a marginal note in a printed book). At ~14px, slightly smaller than the summary. Inline references render as oxblood underlined links to the referenced article.

```
[summary in regular serif at 17px]

│ This sharpens the dbt-vs-Cube comparison in your earlier
│ reading and pushes back on the "platform-native always
│ wins" thesis from the AtScale piece.
```

The vertical rule + italic + smaller size is the visual signal that this is meta-commentary, not the article's content. It echoes the marginalia metaphor.

### 3.4 Decisions for Shrikant before Claude Code starts

- [ ] How many recent articles to include in the prompt: 10, 20, or 50? *Recommendation: 20. Beyond that, Gemini's attention diffuses and the notes get vaguer.*
- [ ] Show the note on the dashboard list, or only on article detail? *Recommendation: dashboard list. The note is most valuable as a scanning aid — "what's new in my reading?" — not as detail-page content.*
- [ ] Should the note also be generated for articles saved before this feature ships? *Recommendation: yes, on a backfill cron. But generate them lazily — only when the user opens the dashboard, fill in missing notes for the visible items.*

### 3.5 Acceptance criteria

1. New saves get an editorial note within 2 seconds of the summary appearing.
2. The note references prior articles correctly — if it says "the Cube article you saved last week," that article exists in the user's list and matches the reference.
3. References render as inline links to the actual articles.
4. The note degrades gracefully (no UI breakage if it's null).
5. The "↻" regenerate control respects rate limits.
6. Backfill works in batches and respects the daily usage cap from Vol. I §7.1.

---

## 4. Visual & Navigation Organization

This is the section that addresses "how do I make this look like a modern website" without flattening the editorial aesthetic. The short answer: most apps you'd point at as "modern" share a single visual language because they share a single problem (a crowded SaaS dashboard). Marginalia has a different problem (a writer's reading workspace) and earns a different language.

### 4.1 Page-specific layouts

The current dashboard is single-column-centered. This works for the reading list itself but does not scale across multiple pages. Each page in Marginalia should have a layout shaped to its job, not a generic template applied to all of them.

**Briefs index (`/briefs`):** Single column, narrower than the dashboard (~640px). Briefs are scarce and weighty; they deserve room.

**Brief detail (`/briefs/[id]`):** Asymmetric two-column. Left ~60% (the question and its articles), right ~35% (candidates, dismissed, actions). 5% gutter.

**Article detail / reader view (`/items/[id]`):** Three-zone layout. Left ~55% (the article reader), center is gutter, right ~30% is *marginalia proper* — notes, highlights, the editorial annotation, related articles. This is where the app's name pays off visually. Highlights appear next to the paragraph they were taken from, not in a list at the bottom.

**Index page (`/index`):** Designed like the index of a book. Two columns, alphabetical by tag, thin horizontal rules between letters. Each entry: tag name, count in mono small-caps, expandable to show the articles under it. This is the page that should feel most explicitly typographic — set it like a real book index.

**Drafts (`/drafts`):** Workspace mode. Wider (~900px) because drafts need horizontal space. Source articles in a left rail (~200px), draft in a center column (~600px), notes/scratch on the right (~200px). This page can break the "no SaaS chrome" rule slightly because it's a writing tool, not a reading one — but only slightly.

**Dashboard / All (`/dashboard`):** Keep current layout, but add a thin right-rail for marginalia: "today's pick" lives there, not at the top. This frees the top for the input and search.

### 4.2 Navigation

Top nav stays minimal: `BRIEFS · ALL · DRAFTS · INDEX · [user]`. Right-aligned user avatar. The "for shrikantlambe" italic that's currently in the header is a nice touch but currently competes with the nav — move it to the masthead area instead, or remove it.

The masthead (the big "Marginalia" with the oxblood "i") earns its size on the landing page and the briefs index. It should *shrink considerably* on the dashboard and on detail pages — by detail page it should be a small wordmark, not a masthead. This gives the deeper pages the right "I'm doing work here" feel without abandoning the brand.

### 4.3 Marginalia as a literal design pattern

This is the single most important design decision in the next phase: **commit to the right margin as a real content surface across the app, not just as whitespace.**

What goes in the right margin, page by page:

- *Dashboard:* today's pick, recent briefs, "this week's most-highlighted"
- *Brief detail:* candidates, dismissed, actions
- *Article detail:* highlights, notes, editorial annotation, related articles
- *Index:* the article preview when hovering an entry
- *Drafts:* notes, the article currently being cited

The right margin is consistently treated: ~30% width, slightly smaller type than the main column, mono small-caps for labels, italic serif for content. It's the visual through-line that makes every page feel like the same product.

### 4.4 Type scale

Lock in a small, opinionated scale. Do not let new components introduce new sizes.

- *Display* (page-level mastheads): Crimson Pro 600, 56px on landing/briefs index, 32px elsewhere
- *H1* (article titles, brief questions): Crimson Pro 600, 28px
- *H2* (section headers): Crimson Pro 500, 20px
- *Body* (summaries, descriptions, draft text): Crimson Pro 400, 17px, line-height 1.6
- *Marginalia / annotations*: Crimson Pro italic 400, 14px, line-height 1.5
- *Chrome / metadata*: JetBrains Mono 400, 11px, letter-spacing 0.18em, uppercase
- *Drop cap*: Crimson Pro 600, 2.4em float-left, oxblood

Five sizes for serif, one for mono. That's the whole set. If a new component needs a sixth size, the design is wrong, not the constraint.

### 4.5 Color discipline

The full palette:

- `paper` #faf6ee — primary background
- `ink` #1a1815 — primary text
- `oxblood` #7a1f1f — single accent
- `sage` #5a634d — tags only
- `rule` #d9d2c1 — horizontal rules and dividers
- `muted` #7a7268 — metadata text

That's six colors. Do not add a seventh. If a feature needs to communicate severity or status, use weight, scale, italic, or oxblood — not a new color. Oxblood is precious; using it for everything dilutes it. Reserve it for: the masthead "i", primary buttons, links, the marginal vertical rule, and similarity scores. Nothing else.

### 4.6 Whitespace

The current screenshot has roughly correct whitespace on the dashboard but tightens too much around the input form and the filter row. As a rule:

- Vertical rhythm between major sections: 64px
- Between items in a list: 48px
- Between elements within an item: 16px
- Around interactive elements (buttons, inputs): 12px internal padding minimum

Editorial design earns its character from generous whitespace; cramped editorial looks like a blog template.

### 4.7 What to remove from the current dashboard

Some specific revisions to the existing dashboard, before adding any of the new features:

The "Save & Summarize" button competes with content — change to thin oxblood outline on cream, fill on hover. Same affordance, much quieter. The "Reading Themes" section is gated by an article count but appears even when no themes exist; either gate the section or rewrite the empty-state copy in the editorial voice (italic serif, *"Themes emerge from reading. Yours haven't yet."*). The status filter row reads as one long string of text; add a thin vertical rule between "Unread & Reading" (the active filter) and the rest. The "Select for draft" action sits at the end of the filter row but acts on the list; move it to a small control that appears at the top of the list itself, contextually attached. The dashboard masthead is the same size as the landing page masthead; shrink it by ~40% on the dashboard.

---

## 5. Cross-Cutting Concerns

These continue from Vol. I §7.

### 5.1 Cost guardrails

Phase 6 adds another Gemini call per save (the editorial note). Update the daily threshold from §7.1 of Vol. I from 100 to 150 operations/day, since the per-save cost has gone up. Track editorial-note generation as its own operation type so you can see the breakdown later.

### 5.2 Migrations

Numbered files continue:

```
007_phase_5_briefs.sql
008_phase_6_editorial.sql
```

### 5.3 Backwards compatibility

All Vol. I features must continue to work without a brief attached. Briefs are additive; the dashboard, search, and themes do not require briefs to function. A user who never creates a brief should still have a fully functional app.

---

## 6. Suggested Order of Operations

1. Read this entire document. Read Vol. I. Read the linked reference sites.
2. Resolve §1 (design philosophy) into a small `DESIGN.md` in the repo so future contributors don't drift. Pull the type scale, color palette, and forbidden patterns into that file verbatim.
3. Apply the §4.7 dashboard revisions first. They're small and they reset the visual baseline before bigger features land.
4. Implement Phase 6 (Editorial Annotations) before Phase 5 (Briefs). It's smaller, lower-risk, and the result improves every other feature in the app.
5. Then Phase 5. Implement schema → API → briefs index page → brief detail page → save-flow integration, in that order.
6. After each phase: deploy, use it for a week with real saves, then revisit.

---

## 7. What Success Looks Like at the End of Vol. II

The user opens Marginalia and is asked the right question: *what are you reading toward?* They write a one-sentence brief. Over the next week, every article they save automatically routes to that brief if relevant, with a one-line editorial note showing how it connects to what they've already read. When they're ready to write, they open the brief, see twelve articles organized around their question, and convert it to a draft in one click.

That sequence — *intent stated, reading routed, connections noticed, draft assembled* — is the curator's full workflow. Vol. I made the tool functional. Vol. II makes it indispensable.
