-- Run this in the Supabase SQL editor (Project → SQL Editor → New query)
-- Stack Auth handles user identity, so user_id is just a text field
-- holding the Stack Auth user ID. We never expose this DB to the client —
-- all writes go through Next.js API routes using the service role key,
-- so we don't need RLS for this minimal setup.

create extension if not exists "pgcrypto";

create table if not exists reading_list (
  id          uuid primary key default gen_random_uuid(),
  user_id     text not null,
  url         text not null,
  title       text,
  summary     text,
  tags        text[] default '{}',
  created_at  timestamptz not null default now()
);

create index if not exists reading_list_user_id_idx
  on reading_list(user_id);

create index if not exists reading_list_user_created_idx
  on reading_list(user_id, created_at desc);
