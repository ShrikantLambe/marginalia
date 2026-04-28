# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev       # start Next.js dev server on http://localhost:3000
npm run build     # production build
npm run lint      # ESLint via next lint
npm run start     # serve the production build
```

There is no test suite.

## Environment setup

Copy `.env.example` to `.env.local` and fill in all 7 variables before running locally:

| Variable | Source |
|---|---|
| `NEXT_PUBLIC_STACK_PROJECT_ID` | Stack Auth dashboard → API Keys |
| `NEXT_PUBLIC_STACK_PUBLISHABLE_CLIENT_KEY` | Stack Auth dashboard → API Keys |
| `STACK_SECRET_SERVER_KEY` | Stack Auth dashboard → API Keys |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Project Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API (service_role secret) |
| `GEMINI_API_KEY` | https://aistudio.google.com/apikey |

Also add `http://localhost:3000` under **Domains & Handlers** in the Stack Auth dashboard, or sign-in callbacks will fail locally.

## Architecture

**Request flow for saving a URL:**
```
Browser → POST /api/items
  → stackServerApp.getUser()          (Stack Auth, server-side)
  → fetchAndSummarize(url)            (lib/summarize.ts)
      → fetch URL with JSDOM + Readability (extract article text)
      → Gemini 2.5 Flash              (generate TL;DR + tags)
  → supabase.from("reading_list").insert(...)
```

**Server / client split in the dashboard:**
- [app/dashboard/page.tsx](app/dashboard/page.tsx) — Next.js Server Component; authenticates the user via Stack Auth and fetches their rows from Supabase, then passes them as props.
- [app/dashboard/reading-list.tsx](app/dashboard/reading-list.tsx) — `"use client"` component; owns all interactive state (URL input, optimistic add/remove, loading/error).

**API routes** ([app/api/items/](app/api/items/)):
- `POST /api/items` — validates URL, calls `fetchAndSummarize`, inserts row. Explicitly set to `runtime = "nodejs"` because `jsdom` does not run in the Edge runtime.
- `DELETE /api/items/[id]` — removes a row (auth checked server-side).

**Gemini prompt contract** ([lib/summarize.ts](lib/summarize.ts)): the model is asked to output a TL;DR followed by a line containing only `---TAGS---`, followed by comma-separated tags. The parser splits on that separator. If you change the prompt, preserve this contract or update the parser.

**Supabase** ([lib/supabase.ts](lib/supabase.ts)): uses the `service_role` key server-side only (never sent to the browser). No Row Level Security is configured — all access is gated by Stack Auth in the API routes. The `reading_list` table schema lives in [supabase/schema.sql](supabase/schema.sql) and must be run manually in the Supabase SQL editor once per project.

**Auth** ([stack.ts](stack.ts)): `stackServerApp` is the server-side Stack Auth singleton. Sign-in/sign-up pages are served by the catch-all route at `app/handler/[...stack]/page.tsx` (Stack Auth's hosted UI). After auth, users land on `/dashboard`.

## Styling

Design tokens are in [tailwind.config.ts](tailwind.config.ts) (`paper`, `ink`, `oxblood`, `sage`, `muted`, `rule` colors) and [app/globals.css](app/globals.css). The editorial aesthetic (Crimson Pro serif font, drop-cap on `.summary::first-letter`, monospace metadata lines) is intentional. New UI should follow this palette.
