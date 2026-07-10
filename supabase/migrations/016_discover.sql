-- Discover: guardrailed web search through user-trusted sources
-- Prerequisite: 015_chat_messages.sql
-- Note: the feature-expansion plan numbered these 014-016; renumbered to 016
-- because 014 (projects) and 015 (chat_messages) already exist.

-- 1. Source registry: trusted websites and authors, optionally pinned to a brief
create table if not exists sources (
  id            uuid primary key default gen_random_uuid(),
  user_id       text not null,
  type          text not null check (type in ('domain', 'author')),
  value         text not null,
  home_domains  jsonb,
  brief_id      uuid references briefs(id) on delete set null,
  notes         text,
  created_at    timestamptz not null default now(),
  unique (user_id, type, value)
);

alter table sources disable row level security;

create index if not exists sources_user_idx on sources(user_id, created_at desc);

-- 2. Guardrail violations: provider results dropped by server-side enforcement
create table if not exists discover_guardrail_violations (
  id          uuid primary key default gen_random_uuid(),
  user_id     text not null,
  query       text not null,
  url         text not null,
  provider    text not null,
  created_at  timestamptz not null default now()
);

alter table discover_guardrail_violations disable row level security;

create index if not exists discover_violations_user_idx
  on discover_guardrail_violations(user_id, created_at desc);

-- 3. Query cache (Supabase-backed — in-memory caches die per serverless cold start)
create table if not exists discover_cache (
  id          uuid primary key default gen_random_uuid(),
  user_id     text not null,
  cache_key   text not null,
  results     jsonb not null,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null,
  unique (user_id, cache_key)
);

alter table discover_cache disable row level security;

-- 4. Search log (powers recents + the Welcome Back resume_search card)
create table if not exists discover_searches (
  id             uuid primary key default gen_random_uuid(),
  user_id        text not null,
  query          text not null,
  scope          jsonb not null,
  cache_key      text,
  result_count   int not null default 0,
  dropped_count  int not null default 0,
  created_at     timestamptz not null default now()
);

alter table discover_searches disable row level security;

create index if not exists discover_searches_user_idx
  on discover_searches(user_id, created_at desc);

-- 5. Saved searches (cap of 20/user enforced in app code)
create table if not exists discover_saved_searches (
  id          uuid primary key default gen_random_uuid(),
  user_id     text not null,
  name        text not null,
  query       text not null,
  scope       jsonb not null,
  created_at  timestamptz not null default now()
);

alter table discover_saved_searches disable row level security;

create index if not exists discover_saved_user_idx
  on discover_saved_searches(user_id, created_at desc);
