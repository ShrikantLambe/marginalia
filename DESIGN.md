# Marginalia Design System

This file is the single source of truth for visual decisions. New components must fit within these constraints, not extend them.

## Type Scale

Five serif sizes and one mono. No others.

| Role | Font | Size | Weight | Treatment |
|---|---|---|---|---|
| Display (masthead on landing/briefs index) | Crimson Pro | 56px | 600 | — |
| Display (all other pages) | Crimson Pro | 32px | 600 | — |
| H1 (article titles, brief questions) | Crimson Pro | 28px | 600 | — |
| H2 (section headers) | Crimson Pro | 20px | 500 | — |
| Body (summaries, descriptions, draft) | Crimson Pro | 17px | 400 | line-height 1.6 |
| Marginalia / annotations | Crimson Pro | 14px | 400 | italic, line-height 1.5 |
| Chrome / metadata | JetBrains Mono | 11px | 400 | uppercase, letter-spacing 0.18em |
| Drop cap | Crimson Pro | 2.4em float-left | 600 | oxblood |

## Color Palette

Six colors. Do not add a seventh.

| Token | Hex | Use |
|---|---|---|
| `paper` | #faf6ee | Primary background |
| `ink` | #1a1815 | Primary text |
| `oxblood` | #7a1f1f | Single accent: masthead "i", primary buttons, links, marginal vertical rule, similarity scores |
| `sage` | #5a634d | Tags only |
| `rule` | #d9d2c1 | Horizontal rules and dividers |
| `muted` | #7a7268 | Metadata text |

Oxblood is precious. Using it for everything dilutes it. If something needs emphasis beyond oxblood provides, use weight, scale, or italic — not a new color.

## Layouts

Each page has a layout shaped to its job:

- **Dashboard (`/dashboard`):** Single column, max-w-3xl centered. Right rail holds Today's Pick, recent briefs metadata.
- **Briefs index (`/briefs`):** Single column, narrower (~640px). Briefs are weighty; give them room.
- **Brief detail (`/briefs/[id]`):** Asymmetric two-column. Left 60% (question + articles), right 35% (candidates, actions), 5% gutter.
- **Article detail (`/items/[id]`):** Three-zone. Left 55% (reader), right 30% (notes, highlights, annotation, related). Right margin is marginalia proper.
- **Index (`/index`):** Two columns, alphabetical by tag, set like a book index.
- **Drafts (`/drafts`):** Wider (~900px). Left rail 200px (source articles), center 600px (draft), right 200px (notes/scratch).

## Whitespace

- Between major sections: 64px
- Between list items: 48px
- Between elements within an item: 16px
- Internal padding on interactive elements: 12px minimum

## Forbidden Patterns

- Drop shadows on cards
- Gradient buttons or backgrounds
- Sans-serif body copy (chrome can be mono; body must be Crimson Pro)
- Pills/badges used as prose substitutes
- Centered layout on every page
- Lucide icons for content (chrome only)
- Dark mode (commit to one mode)
- Title Case in interface chrome (use sentence case in copy, small-caps in mono chrome)
- Second accent color

## The Right Margin as a Content Surface

The right margin is the visual through-line across all pages. It holds: Today's Pick and brief metadata on the dashboard; candidates and actions on brief detail; highlights, notes, and editorial annotations on article detail; article preview on the index page; cited article on the drafts page.

Consistent treatment: ~30% width, slightly smaller type than main column, mono small-caps for labels, italic serif for content.

## Reference Sites

Study these, not Notion/Linear/Stripe dashboards:
- [Are.na](https://are.na) — research/curation, same audience
- [Craig Mod](https://craigmod.com) — writer-focused web typography
- [Stratechery](https://stratechery.com) — text-forward paid newsletter
- [The Marginalian](https://themarginalian.org) — curator audience
- [Robin Sloan](https://www.robinsloan.com) — playful editorial
- [Read Something Wonderful](https://readsomethingwonderful.com) — list-as-product
