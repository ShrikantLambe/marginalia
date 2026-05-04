# Marginalia — Roadmap Vol. II.5: Layout & Reader View

**Audience:** Claude Code, working in the existing `marginalia` repo.
**Purpose:** Structural UI changes and a reader-view feature that close the workspace gap with read-it-later competitors (Readwise, Matter, Instapaper) without sacrificing Marginalia's editorial identity.
**Relationship to other docs:** This doc sits between Vol. I (shipped) and Vol. II (Briefs + Editorial Annotations, not yet started). The work here should be completed *before* Vol. II's Phase 5 and 6, because Briefs and Annotations both depend on the contextual right-pane pattern introduced here. Read Vol. I §1 (design principles) and Vol. II §1 (design philosophy) before starting — those rules apply to everything in this doc.

---

## 0. Strategic Frame

Marginalia is currently a single-column reading list. Comparable tools (Readwise Reader, Matter, Omnivore-while-it-existed) are three-pane workspaces. The gap is structural, not cosmetic — users of those tools experience the app as a place they *live*, not a place they *visit*. Single-column dashboards visit; workspaces live.

The goal of Vol. II.5 is to convert Marginalia from a single-column list into a workspace, *without* adopting the SaaS-modern aesthetic of those competitors. The visual identity (cream paper, Crimson Pro serif, oxblood accent, generous whitespace) stays. The structure changes.

There are five structural changes and one new feature in this doc. They are sequenced so each one ships independently and the app remains usable at every step.

---

## 1. Design Constraints (read before implementing)

These extend Vol. II §1 and are non-negotiable for this work:

**Match the structure of competing workspaces, not the style.** Three-pane layout, persistent left rail, contextual right pane, dense list. None of: dark mode, sans-serif body, drop shadows, gradient buttons, thumbnails on every article, colored tag chips, skeumorphic highlights.

**The right pane is the marginalia.** This is the single most important pattern in this entire roadmap. The app's name promises notes-in-the-margin; the layout has not delivered on that promise yet. The right pane is where notes, highlights, the editorial annotation, and brief associations live. It is *contextual* — it shows the data of whichever item is currently selected in the list, not a fixed sidebar.

**Density before features.** Before adding any new feature, increase information density in existing surfaces. The current dashboard shows one item above the fold. The target is six to eight.

**Mobile is not optional.** Most article reading happens on phones. Every layout in this doc must degrade to a single-column mobile experience. Build mobile in parallel, not after.

**Editorial typography stays.** Crimson Pro serif body, mono small-caps for chrome, oxblood as the only accent, six-color palette from Vol. II §4.5. Density does *not* mean sans-serif and does *not* mean smaller font sizes. It means tighter vertical rhythm and moving secondary content out of the list and into the right pane.

---

## 2. The Five Structural Changes

### 2.1 Persistent left rail

**What:** A vertical 60px-wide rail on the left edge of every authenticated page, containing five icons: Briefs, All, Drafts, Index, Search. No labels by default; labels appear in a tooltip on hover. The currently active page's icon is rendered in oxblood; others in muted ink.

**Why:** Frees the top of every page from carrying primary navigation. Signals "workspace" instead of "page". Provides a foundation for Vol. II's brief-detail and draft pages.

**Constraints:**

- 60px wide, full viewport height, fixed position.
- Background: same `paper` cream as the page; no fill, no border. A single 1px `rule`-color line on the right edge separates it from the content.
- Icons: thin-stroke line icons (`lucide-react` is fine; pick the most editorial-feeling ones — `bookmark`, `archive`, `pen-tool`, `book-open`, `search`). 20px size, 2px stroke.
- Active state: icon stroke becomes oxblood, plus a 2px-wide oxblood vertical bar on the left edge of the rail at the icon's vertical position. This is the only place oxblood vertical bars appear; do not use them elsewhere.
- Hover state: icon brightens from `muted` to `ink`, tooltip appears 8px to the right with `font-mono` small-caps label.
- The user avatar (currently top-right) moves to the bottom of the rail. Click opens a small popover with sign-out and settings.

**Mobile:** The rail collapses to a bottom tab bar on screens below 768px. Same five items, horizontal, fixed bottom. No tooltips on mobile.

**Acceptance:**

- Rail is present on every authenticated page.
- The active page's icon renders correctly on dashboard, brief index, draft index, article index, and search.
- Tooltips appear on desktop hover within 200ms.
- On mobile, the bottom tab bar is sticky and does not overlap content.

### 2.2 Three-pane dashboard layout

**What:** The dashboard converts from a single column to a two-pane layout with a contextual third pane. Left pane (the rail, from §2.1). Center pane (~55% of remaining width): the article list, denser. Right pane (~35%): the contextual marginalia for whichever item is selected.

**Why:** Replaces the current "click to expand notes & highlights" disclosure with a persistent surface that shows the active item's full context. This is what makes the app feel like a workspace.

**Constraints:**

- Center pane is the article list. List items shrink in height (see §2.3).
- Right pane is empty when no item is selected. Empty-state copy: italic serif, 14px, muted: *"Select an article to see its margins."*
- When a list item is selected, the right pane fills with: source + date in mono small-caps, full title in serif h2, full TL;DR (with drop cap), tags, editorial annotation (when Vol. II ships it), notes (editable inline), highlights (each in italic with oxblood vertical rule on the left), brief associations (when Vol. II ships).
- Selection is sticky — clicking another item changes the right pane; reloading the page selects the most recently selected item.
- Selecting an item does *not* navigate; the URL stays at `/dashboard`. To navigate to a permanent article URL, click the title (this opens the source) or use a "permalink" affordance on the right pane.
- The center pane has its own scroll. The right pane has its own scroll. The viewport does not scroll. This is the workspace feel.

**Mobile:** Below 1024px, the layout collapses to a single column. Selecting an item navigates to a separate article page (`/items/[id]`) rather than filling a right pane that doesn't exist.

**Acceptance:**

- Default view shows the list on the left and an empty right pane.
- Clicking an item populates the right pane within 100ms (no network call needed; data is already loaded).
- The right pane scrolls independently of the list.
- The current "Notes & Highlights" disclosure is removed from the list items; that data lives only in the right pane now.
- Resizing the browser between 1024px and 1280px keeps the layout legible (no broken wrapping, no horizontal scroll).

### 2.3 Dense list items

**What:** Reduce each list item from ~600px tall to ~140px tall. Move the full TL;DR, tags, and notes/highlights affordances to the right pane.

**Why:** A list is for *navigating*, not for reading. The current design is an article-detail layout repeated. Real users have hundreds of saved articles and need to see many at a glance.

**Constraints:**

Each list item now contains:

- Line 1 (mono small-caps, 11px, muted): source domain, separator, date, separator, status pill (small, inline) — same as today but tighter.
- Line 2 (serif, 17px, semibold): title — single line, ellipsis on overflow.
- Line 3 (serif italic, 14px, muted): the first 110 characters of the TL;DR, ellipsis. *Not* the full TL;DR. The full TL;DR appears in the right pane.
- Line 4 (mono small-caps, 10px, sage): up to three tags, comma-separated. If more, append "…" to indicate truncation.

Total height ~140px including padding. No drop cap on list items. (The drop cap is preserved on the right pane and the article reader view — it is not abandoned, just not on every list row.)

Selected state: a 2px oxblood vertical bar on the left edge of the item, and the title color shifts from `ink` to oxblood. No background fill, no border change. The selection should read as quiet but unambiguous.

Hover state: a 1px `rule`-color underline appears on the title; cursor is pointer.

**Acceptance:**

- Eight items are visible above the fold on a 1440×900 desktop viewport.
- Titles ellipsis cleanly when too long; do not wrap.
- Selecting an item changes its visual state and updates the right pane.
- Removing an item from the list animates it out (160ms ease-out fade + height collapse) so the user sees what changed.

### 2.4 Status as tabs, not filter pills

**What:** Replace the current filter row (Unread & Reading · 12 / Unread · 10 / Reading · 2 / Read · 0 / Archived · 0 / All · 12) with a tab strip at the top of the center pane. Three tabs: `Later`, `Read`, `Archive`. Plus a small `All` link, right-aligned, smaller, as an escape hatch.

**Why:** Filter pills imply additive filters. Tabs imply exclusive modes. Status is exclusive — an item is in exactly one bucket. Tabs match the data model. They also visually compress the row from six elements to four and free room for the search field.

**Constraints:**

- `Later` shows items with `status IN ('unread', 'reading')`. This is the default tab. It corresponds to "what I'm currently working through."
- `Read` shows `status = 'read'`.
- `Archive` shows `status = 'archived'`.
- `All` is a small text link in the top-right of the strip, mono small-caps, muted. Clicking shows everything regardless of status.
- Counts appear next to each tab name in mono small-caps, muted: `Later · 12`.
- Active tab styling: name in `ink` (not oxblood — oxblood stays reserved for individual selection markers and the masthead "i"). Inactive tabs in `muted`. The active tab has a 2px `ink` underline; inactive tabs do not.
- Tab strip has no background fill and no card border. Just the underline on the active tab.

**Acceptance:**

- Default load shows the `Later` tab with current items.
- Switching tabs does not require a page reload; the list updates client-side.
- Tab counts update when items change status (e.g., marking an item read decrements `Later` and increments `Read`).
- The `All` escape hatch shows every item including archived ones.

### 2.5 Top of page, simplified

**What:** With navigation moved to the rail and status moved to tabs, the top of the dashboard collapses to: a smaller masthead, the URL input, and a search input. Three elements vertically stacked. No `for shrikantlambe` decoration, no `Drafts`/`Index` text links (those are in the rail now).

**Why:** The current top of the dashboard does too much — a full-size masthead, a personalized greeting, top navigation links, a user avatar, the URL input, the search input, the themes section, and a filter row. That is eight surfaces above the article list. Reducing it to three lets the actual work breathe.

**Constraints:**

- Masthead at the top of the dashboard is now a smaller wordmark: "Marginalia" with the oxblood "i", set in serif at 28px (down from 56px). Aligned left, not centered. No `THE READING ROOM` superhead — that survives only on the landing page.
- URL input: full width of the center pane, 48px tall, `rule`-color bottom border that becomes oxblood on focus. No card, no fill. Placeholder *"https://…"* in italic muted serif. To the right of the input (inside the same row): a thin oxblood-outlined "Save" button — no fill, oxblood text, 1px border. Hover fills with oxblood.
- Search input directly below: full width, smaller (40px tall), same `rule`-color bottom border treatment. Placeholder *"Search by concept…"* No button — search runs on debounce.
- The themes section is *removed* from the dashboard top. Themes have their own surface (TBD in Vol. III, or moved to the right pane when in `All` mode). Empty-state cruft is the worst kind of UI.

**Acceptance:**

- Dashboard top occupies ~140px of vertical space (down from ~340px).
- The save button visibly quiets — it does not compete with content for attention.
- No "themes" section appears on the dashboard until at least one theme exists.
- The masthead is clearly smaller than the landing-page masthead; the visual size hierarchy now reflects the page hierarchy.

---

## 3. Phase 7 — Reader View

**Goal:** When the user clicks an article title (or a "Read" affordance), they enter a clean reading view *inside Marginalia* with the article body rendered in editorial typography. Highlights are made by selecting text. Notes are added inline. The right pane stays as marginalia. This is the feature that closes the workflow loop — currently, users have to leave Marginalia to actually read the article, which is where the current product silently dies.

**Effort estimate:** 1–1.5 weeks.

### 3.1 Why this matters

Right now, Marginalia's value chain has a break in the middle:

```
save → summarize → list → [LEAVE THE APP] → manually copy quote back → save as highlight
```

Every break is a place users drop off. The reader view fixes this:

```
save → summarize → list → read in-app → highlight inline → annotate → done
```

This is the single feature most responsible for whether Marginalia becomes a daily-use tool or a one-off save destination.

### 3.2 Schema changes

```sql
-- supabase/migrations/009_phase_7_reader.sql

alter table reading_list
  add column if not exists article_html text,
  add column if not exists article_text text,
  add column if not exists author text,
  add column if not exists site_name text,
  add column if not exists hero_image_url text,
  add column if not exists word_count int,
  add column if not exists reading_time_minutes int;

create table if not exists highlights (
  id              uuid primary key default gen_random_uuid(),
  user_id         text not null,
  item_id         uuid not null references reading_list(id) on delete cascade,
  text            text not null,
  note            text,
  position_start  int,
  position_end    int,
  created_at      timestamptz not null default now()
);

create index if not exists highlights_item_idx
  on highlights(item_id, position_start);

create index if not exists highlights_user_idx
  on highlights(user_id, created_at desc);
```

**Notes:**

- `article_html` is the cleaned, sanitized HTML from Mozilla Readability. Already extracted today during summarization but discarded; now it gets persisted.
- `article_text` is the plain-text version (also already produced) — used for highlight position calculations and for embedding regeneration.
- `position_start` / `position_end` are character offsets into `article_text`. Used to anchor highlights so they survive minor HTML changes.
- The `highlights` table replaces the existing `highlights jsonb` column on `reading_list` from Vol. I. Migration must move existing JSON highlights into the new table — write a one-shot script that reads the JSON, inserts rows, then drops the old column.

### 3.3 Capture during save

**Modify** `lib/summarize.ts` to return the cleaned HTML and metadata in addition to the summary:

```typescript
return {
  title,
  summary,
  tags,
  articleHtml: article.content,        // sanitized HTML from Readability
  articleText: article.textContent,
  author: article.byline,
  siteName: article.siteName,
  heroImageUrl: extractHeroImage(dom), // og:image or first <img> in article
  wordCount: countWords(article.textContent),
  readingTimeMinutes: Math.ceil(countWords(article.textContent) / 200),
};
```

`article.content` from Readability is already sanitized. Do not double-sanitize. Do strip any inline `<script>`, `<iframe>`, or `<style>` tags as defense in depth, using a small allowlist sanitizer (DOMPurify is overkill for server-side; a 30-line strip function is fine).

`extractHeroImage` looks for `og:image` meta tag, falling back to the first `<img>` in the article body. Validate it's an absolute URL and resolves via HTTPS.

**Modify** `POST /api/items` to persist these new fields.

**Backfill:** existing items have no `article_html`. On first open of an existing item in the reader view, fetch and re-extract on the fly, then persist. This avoids a giant one-shot backfill and spreads the cost.

### 3.4 The reader view route

`app/items/[id]/page.tsx`:

A three-pane layout matching the dashboard's structure: rail on the left (from §2.1), center pane (60%) with the article, right pane (35%) with the marginalia.

**Center pane — the article:**

- Article hero: source + author + date + reading time in mono small-caps, 11px, muted.
- Article title: serif, 36px, semibold, max-width ~640px.
- Hero image (if present): ~500px wide, max-height 320px, object-fit cover, `rule`-color 1px border.
- Article body: rendered from `article_html`. Apply the editorial typography globally: serif body at 19px, line-height 1.7, max-width 640px. Paragraphs separated by 1.2em margin. Headings within the article use the same scale as Vol. II §4.4 (h1 28px, h2 20px). Links inside the article are oxblood, underlined, with the same `link-underline` style used elsewhere.
- Drop cap on the first paragraph of the article body. Same drop cap as the dashboard.
- Pull quotes (a `<blockquote>` in the article HTML) get italic serif, 22px, indented 24px, with a 2px oxblood vertical rule on the left.
- Code blocks (rare in saved articles, but) get JetBrains Mono, 14px, `paper`-darkened background.

**Center pane — affordances at the top:**

A small toolbar above the title, in mono small-caps:

```
← BACK    ·    MARK READ    ·    OPEN ORIGINAL ↗    ·    DRAFT FROM
```

`Back` returns to the previous list. `Mark read` cycles status to `read`. `Open original` opens the source URL in a new tab. `Draft from` adds this article to a brief or starts a new brief (this is the entry into Vol. II's Phase 5).

**Right pane — the marginalia:**

- The TL;DR summary (this is now the natural home for it; the dashboard list shows truncated, the reader view shows full).
- Editorial annotation (when Vol. II Phase 6 ships).
- Highlights — each rendered as italic serif, 14px, with an oxblood 2px vertical rule on the left, positioned next to the paragraph it came from (when possible — see §3.6 for positioning).
- Notes — a freeform textarea per item, autosave on blur.
- Brief associations — list of briefs this item is attached to (Vol. II).
- Tags — at the bottom, mono small-caps.

### 3.5 Highlighting interaction

When the user selects text in the article body:

1. A small floating toolbar appears above the selection: `HIGHLIGHT` and `HIGHLIGHT + NOTE`.
2. Clicking `HIGHLIGHT` saves the selection to the `highlights` table and renders an oxblood underline beneath the selected text in place.
3. Clicking `HIGHLIGHT + NOTE` opens an inline textarea below the selection; user types a note, presses cmd+enter to save.
4. The new highlight immediately appears in the right pane.

**Highlight rendering in the article body:** *not* a yellow background fill (that's Kindle/Readwise — skeumorphic). Instead, the highlighted text gets a 2px oxblood underline, with the offset slightly larger so it reads as intentional. Hovering shows the note (if any) in a small tooltip; clicking removes the highlight after confirmation.

**Anchoring:** store the selection's character offsets into `article_text` (the plain-text version). When rendering, walk the DOM to find the matching range. If the article HTML is missing or has changed, fall back to substring match — find the first occurrence of the highlight text in the article and underline it. If no match, the highlight still appears in the right pane but with a small mono small-caps label *"Original passage not located"* in muted text.

### 3.6 Positioning highlights next to their paragraph in the right pane

The hardest UX problem here. Two acceptable approaches:

**Option A — anchored marginalia.** When the user scrolls the article in the center pane, the right pane scrolls in sync. Each highlight in the right pane is positioned at the vertical offset of its source paragraph. This is the *true* margin-note experience — the same one used in Are.na and academic reading apps.

**Option B — unanchored list.** The right pane shows highlights as a simple top-down list, ordered by their position in the article. Scrolling is independent.

Option A is technically harder (requires tracking paragraph positions and absolute-positioning highlights) but closes the marginalia metaphor completely. Option B is shippable in two days.

**Recommendation:** ship Option B in Phase 7. Move to Option A as a Phase 7.5 polish if the reader view feels valuable in practice.

### 3.7 Decisions for Shrikant before Claude Code starts

- [ ] Reader view as a new page (`/items/[id]`) or as a slide-in panel on the dashboard? *Recommendation: separate page. URLs are valuable for sharing and resurfacing; a slide-in panel can't be linked to.*
- [ ] Highlight color: oxblood underline (recommended above) or `sage` underline to keep oxblood reserved? *Recommendation: oxblood. Highlights are the user's most personal annotations and deserve the strongest accent.*
- [ ] Save full article HTML in Postgres or in a separate object store (Supabase Storage)? *Recommendation: Postgres for now. Article HTML is typically 20-100KB; a `text` column handles this fine until you have 10K+ items.*
- [ ] Allow highlights without a reader view (i.e., paste text manually, as today) as a fallback? *Recommendation: yes, keep the existing "add highlight by typing" flow as a backup. Some pages won't extract cleanly.*

### 3.8 Acceptance criteria

1. Saving a new article persists `article_html`, `article_text`, `author`, `site_name`, `hero_image_url`, `word_count`, `reading_time_minutes`.
2. Opening an existing article (saved before this feature shipped) triggers a one-time fetch + extract and persists the new fields.
3. The `/items/[id]` route renders the article in editorial typography matching the rest of the app.
4. Selecting text in the article body shows the floating toolbar within 200ms.
5. Highlighting persists across reloads and renders inline as oxblood underline.
6. Highlights with notes show the note on hover.
7. The right pane shows all of an item's marginalia: TL;DR, notes, highlights, tags, brief associations (if Vol. II shipped), editorial annotation (if Vol. II shipped).
8. The reader view is mobile-responsive — it collapses to single-column with the marginalia accessible via a tab or sheet at the bottom.
9. Articles that fail to extract cleanly fall back to a "Read at source" message with the source URL prominently displayed.

---

## 4. Mobile

Treat mobile as a first-class layout, not a degraded desktop. The constraints below are non-negotiable; if a feature does not work on mobile, do not ship it.

### 4.1 Layout breakpoints

- **Below 768px** (phone): single column. Bottom tab bar replaces the left rail. The right pane becomes a slide-up sheet, accessed via a "marginalia" button on the article reader.
- **768–1024px** (tablet): two-column. Rail on the left (collapsed to icons only), main content fills the rest. The right pane becomes a slide-in drawer from the right, toggled on demand.
- **Above 1024px** (desktop): full three-pane.

### 4.2 Reader view on mobile

The reader view is the surface where mobile matters most — most reading happens here. Specific requirements:

- Body text: serif, 17px (slightly smaller than desktop's 19px), line-height 1.6.
- Max-width: 100% of viewport with 20px padding on each side.
- Drop cap: 1.8em (smaller than desktop's 2.4em).
- Highlighting via long-press selection (native iOS/Android pattern), then floating toolbar.
- The marginalia sheet slides up from the bottom, covers ~70% of viewport when open.
- The toolbar (`Back`, `Mark read`, `Open original`, `Draft from`) collapses to an overflow menu (`⋯`) except for `Back` and `Mark read`.

### 4.3 Save flow on mobile

Pasting URLs on mobile is the highest-friction interaction in the entire app. Two improvements:

- The URL input on mobile must support paste-on-focus: when the user focuses the field and the clipboard contains a URL, show a small "Paste 'https://...'" affordance below the input. One tap to populate.
- Add a Web Share Target manifest entry so Marginalia appears in the iOS/Android share sheet. When a user shares a URL from Safari/Chrome to Marginalia, it opens directly with the URL pre-populated and triggers save automatically. This is a small `manifest.json` addition + a `/share` route — half a day of work, transformative for daily mobile use.

### 4.4 Acceptance criteria

1. Every page in the app is usable on a 390×844 (iPhone 14) viewport.
2. The reader view is genuinely pleasant to read on mobile — text is appropriately sized, line lengths are correct, no horizontal scrolling.
3. Highlights work via long-press selection.
4. Saving a URL via the iOS/Android share sheet opens Marginalia and successfully saves the article.
5. Bottom tab bar does not overlap the last item in any list.

---

## 5. Sequencing

The five structural changes (§2) and the reader view (§3) ship in this order:

1. **§2.1 Persistent left rail.** Smallest, most foundational. Doubles as the navigation framework for everything else. Half-day to a day.
2. **§2.4 Status tabs.** Quick win that simplifies the dashboard top. A few hours.
3. **§2.5 Simplified dashboard top.** Removes cruft. A few hours.
4. **§2.3 Dense list items.** Has to come before the right pane so the list shrinkage and the new right surface ship together coherently. One day.
5. **§2.2 Three-pane layout with contextual right pane.** The biggest change. One to two days.
6. **§4 Mobile.** In parallel with the above; verify each step on mobile before moving on. Roughly a day of dedicated mobile work after step 5.
7. **§3 Reader view (Phase 7).** Biggest feature in this doc. One to one-and-a-half weeks.

Total: ~2-3 weeks for the structural work, then 1-1.5 weeks for the reader view.

After this doc completes, return to Vol. II for Briefs and Editorial Annotations. Both features will land more cleanly into a workspace with a contextual right pane than they would into the current dashboard.

---

## 6. Things Explicitly Not in This Doc

The following were considered and deferred:

- **Browser extension.** Worth building, but only after the reader view is solid. Otherwise, the extension saves articles that immediately punt the user back out of the app to read.
- **RSS / feed ingestion.** Important strategically (it makes the app a place where content arrives, not just a place users push to), but a substantial feature. Vol. III.
- **Native mobile apps.** Mobile web with a Web Share Target manifest is enough for now. Native is Vol. IV at earliest, and probably never.
- **Anchored marginalia (Option A in §3.6).** Polish, not core. Phase 7.5.
- **Text-to-speech / read-aloud.** Reading apps usually have this. Defer; it doesn't differentiate Marginalia and adds substantial complexity.
- **Image extraction beyond the hero image.** Articles often have inline images (charts, figures). Rendering them cleanly inside the reader view is hard. For Phase 7, render `<img>` tags but do not optimize, lazy-load, or fall back gracefully on broken images. Polish later.

---

## 7. Success Criteria for This Doc

At the end of Vol. II.5:

1. Marginalia visually reads as a workspace, not a single-column blog.
2. The user can save, read, highlight, and annotate without ever leaving the app.
3. The right pane consistently shows the marginalia for the active item — the visual signature is in place.
4. Mobile works.
5. The aesthetic — cream paper, serif body, oxblood accent — is preserved and arguably strengthened by the new structural clarity.

The combination of editorial identity and workspace structure is what makes Marginalia look like nothing else on the market. No other reading app commits to this aesthetic. No other editorial reading app commits to a real workspace. Marginalia can be both.
