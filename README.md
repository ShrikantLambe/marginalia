# Marginalia

A quiet reading list. Paste a URL, get an AI-generated TL;DR. A small Next.js app demonstrating the free-tier "vibe stack": Next.js + Stack Auth + Supabase + Gemini, deployable on Vercel.

```
You ──► [paste URL] ──► Next.js API
                          │
                          ├─► Stack Auth (whose user is this?)
                          ├─► fetch URL + Mozilla Readability (extract article text)
                          ├─► Gemini 2.5 Flash (TL;DR + tags)
                          └─► Supabase (save row)
```

---

## 1. Provision the free-tier services

You need accounts on three services. All three have free tiers that comfortably cover personal use.

### a) Supabase
1. Go to https://supabase.com → New project. Pick any region near you.
2. Once it's up, go to **SQL Editor → New query** and paste the contents of `supabase/schema.sql`. Run it.
3. Go to **Project Settings → API** and copy:
   - `Project URL` → goes into `NEXT_PUBLIC_SUPABASE_URL`
   - `service_role` key (the one labeled "secret") → goes into `SUPABASE_SERVICE_ROLE_KEY`

> **Why service role and not anon?** All writes happen server-side from API routes after Stack Auth verifies the user. The DB is never exposed to the browser, so we skip RLS for this minimal setup. Don't ship the service role key to the client.

### b) Stack Auth
1. Go to https://app.stack-auth.com → Create project.
2. In the project's **API Keys** section, copy:
   - `Project ID` → `NEXT_PUBLIC_STACK_PROJECT_ID`
   - `Publishable Client Key` → `NEXT_PUBLIC_STACK_PUBLISHABLE_CLIENT_KEY`
   - `Secret Server Key` → `STACK_SECRET_SERVER_KEY`
3. Under **Domains & Handlers**, add `http://localhost:3000` for local dev. (You'll add your Vercel URL after deploying.)

### c) Gemini API
1. Go to https://aistudio.google.com/apikey → Create API key.
2. Copy it into `GEMINI_API_KEY`.

The free tier of Gemini 2.5 Flash is more than enough for a personal reading list.

---

## 2. Run it locally

```bash
git clone <your repo>
cd marginalia
cp .env.example .env.local
# fill in all 7 env vars in .env.local

npm install
npm run dev
```

Open http://localhost:3000 → sign up → paste a URL.

---

## 3. Deploy to Vercel

```bash
npm install -g vercel    # one time
vercel                   # follow the prompts; pick "Next.js" if asked
```

Or push to GitHub and import the repo at https://vercel.com/new.

After the first deploy:

1. **Add env vars in Vercel.** Project → Settings → Environment Variables. Paste in all 7 keys from `.env.local`.
2. **Add your Vercel URL to Stack Auth.** In the Stack Auth dashboard, **Domains & Handlers**, add `https://<your-project>.vercel.app`. Without this, sign-in callbacks will fail in production.
3. Trigger a fresh deploy: `vercel --prod` (or push another commit).

That's it.

---

## Project layout

```
.
├── stack.ts                          Stack Auth server config
├── app/
│   ├── layout.tsx                    StackProvider + fonts
│   ├── page.tsx                      landing page (redirects to dashboard if signed in)
│   ├── globals.css                   paper aesthetic
│   ├── handler/[...stack]/page.tsx   Stack Auth's hosted sign-in/sign-up pages
│   ├── dashboard/
│   │   ├── page.tsx                  server component, loads user's items
│   │   └── reading-list.tsx          interactive client component
│   └── api/items/
│       ├── route.ts                  POST: fetch + summarize + save
│       └── [id]/route.ts             DELETE: remove an item
├── lib/
│   ├── supabase.ts                   server-side Supabase client
│   └── summarize.ts                  fetch URL → Readability → Gemini
└── supabase/schema.sql               run once in Supabase SQL editor
```

---

## Customizing

- **Different LLM?** Swap `lib/summarize.ts`. The OpenAI, Anthropic, and OpenRouter SDKs all follow the same shape — `generateContent(prompt) → text`.
- **Different summary style?** Edit the prompt in `lib/summarize.ts`. The prompt asks for a TL;DR followed by `---TAGS---` followed by tags. As long as that contract holds, the parser works.
- **Different aesthetic?** All design tokens are in `tailwind.config.ts` and `app/globals.css`. The drop-cap on `.summary::first-letter` and the body font (Crimson Pro) carry most of the editorial feel.

---

## Free-tier limits to know about

| Service    | Free limit                               | What happens at limit                       |
|------------|------------------------------------------|---------------------------------------------|
| Vercel     | 100 GB bandwidth / mo, hobby projects    | App stops serving until next month          |
| Supabase   | 500 MB DB, 50K MAU, pauses after 7d idle | Project pauses; resume by visiting dashboard |
| Stack Auth | 10,000 users                             | Sign-ups blocked until you upgrade           |
| Gemini API | Generous, but rate-limited               | 429 errors during bursts                     |

For a personal reading list, you will not hit any of these.

---

## Discover — web search through your sources

Discover searches the open web, but **only** the sites and writers you've added at `/sources`. Enforcement has three layers:

1. Your allowlist is sent to the search provider (Tavily) as `include_domains` — a hint.
2. **Server-side enforcement** — every returned URL is re-parsed to its registrable domain (via the public-suffix list) and dropped if it isn't in your allowlist. Dropped results are logged to a guardrail log visible at the bottom of `/sources`. This layer is the actual guardrail; the provider is never trusted.
3. Author-scoped results get byline verification: pages are fetched, bylines extracted (JSON-LD → meta tags → common selectors), and fuzzy-matched against your author list. Verified results badge ✓ and sort first.

Setup: get a free key at https://tavily.com and set `TAVILY_API_KEY`. Without a key the app uses a built-in mock provider (fine for development). Queries are cached for 24h per (allowlist, query) — cached repeats don't hit the provider or your daily AI budget. Capturing a result goes through the same `POST /api/items` pipeline as pasting a URL: Readability, TL;DR, tags, embedding, brief auto-routing.

## The front page

Signing in lands on `/home` — a newspaper front page: masthead with dateline and edition (from your browser clock), a greeting headline, one omnibox (paste a URL to capture in place, or search your library or Discover), and the lede: your most recent half-read article with how many minutes are left. When nothing's half-read, the page composes one quiet sentence about your actual state instead. Nothing is fabricated, nothing needs dismissing.

## Welcome Back

Returning to the dashboard after a 4+ hour gap greets you by your browser's local time and offers up to three resume cards: a half-read article (reading progress is tracked at 25/50/75/100% scroll via the open beacon; finishing marks it read), your latest draft, your last Discover search (suppressed once you've captured from it), or the unread pile if it's grown past five. Everything is computed deterministically from existing columns — no LLM, no event system, no tracking beyond what the app already stored.
