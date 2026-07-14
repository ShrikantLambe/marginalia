# Contributing to Marginalia

Thanks for your interest. Marginalia is a small, opinionated app; contributions are welcome as long as they respect its constraints (below).

## Getting set up

See the [README](README.md) for the full walkthrough. In short:

```bash
cp .env.example .env.local   # fill in the values
npm install
npm run dev
```

You'll need free Supabase, Stack Auth, and Gemini accounts. Run the migrations in [`supabase/migrations/`](supabase/migrations/) in numbered order.

## Before you open a PR

CI runs on every push and PR, and Vercel builds on merge. Make sure all of this is green locally first:

```bash
npm run lint     # ESLint (next/core-web-vitals) — must have zero errors
npm test         # Vitest — pure lib utilities
npx tsc --noEmit # typecheck
npm run build    # production build
```

New pure logic in `lib/` should come with a Vitest test in `lib/__tests__/`.

## Conventions to follow

These are load-bearing — a PR that breaks them will be asked to change:

- **Security invariants** (see [CLAUDE.md](CLAUDE.md#security-invariants)): every API route resolves the Stack Auth user and scopes queries by `user_id`; user-supplied URLs are fetched only through `lib/safe-fetch.ts`; saved HTML is sanitized with DOMPurify before storage; state-mutating endpoints are POST.
- **Database changes** are new numbered migrations in `supabase/migrations/` (never edit an existing one). RLS is handled outside the app; the server uses the secret key.
- **Design system**: only the six existing color tokens, the serif/mono type scale, and the patterns in [DESIGN.md](DESIGN.md). No new tokens, shadows, or animation.
- **Graceful degradation**: AI/network failures should never break a save or crash the UI — return `null`/empty and let the interface show nothing.

## Reporting bugs / requesting features

Use the issue templates. For anything security-sensitive, follow [SECURITY.md](SECURITY.md) instead of opening a public issue.

## License

By contributing, you agree that your contributions are licensed under the [MIT License](LICENSE).
