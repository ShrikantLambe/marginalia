# Security Policy

## Reporting a vulnerability

Please **do not open a public issue** for security problems.

Instead, report privately via GitHub's [security advisories](https://github.com/ShrikantLambe/marginalia/security/advisories/new), or email the maintainer. Include steps to reproduce and the potential impact. You'll get an acknowledgement, and a fix or explanation as soon as reasonably possible.

## Scope

This is a personal-scale app, but the following are treated as real invariants and regressions in them are in scope:

- **Cross-user data access** — every query is scoped by `user_id` in application code; RLS is a second layer.
- **Stored XSS** — saved article HTML is sanitized with DOMPurify before it is stored and rendered (`lib/summarize.ts`).
- **SSRF** — user-supplied URLs are fetched only through `lib/safe-fetch.ts`, which blocks private/link-local/metadata addresses and re-validates redirects.
- **Secret handling** — the Supabase secret key and all API keys are server-only; none are exposed to the client.

## Out of scope

- Rate-limiting bypass on the in-process limiter (`lib/rate-limit.ts`) — it's a soft, per-instance guard by design; the atomic daily cap in `lib/usage-log.ts` is the real limit.
- Issues requiring a compromised Supabase/Stack Auth/Gemini account or leaked env vars.
