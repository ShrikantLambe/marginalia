-- "Ask your library": cited answers synthesized across the user's saved items
-- Prerequisite: 019_concurrency.sql

create table if not exists library_answers (
  id               uuid primary key default gen_random_uuid(),
  user_id          text not null,
  question         text not null,
  answer           text,                          -- filled after the stream completes
  source_item_ids  uuid[] not null default '{}',  -- ordered; [n] in the answer maps to position n
  created_at       timestamptz not null default now()
);

alter table library_answers disable row level security;

create index if not exists library_answers_user_idx on library_answers(user_id, created_at desc);
