-- Phase 4: synthesis drafts
-- Prerequisite: 006_phase_3_themes.sql
-- Run in Supabase SQL Editor after 006_phase_3_themes.sql

create table if not exists syntheses (
  id              uuid primary key default gen_random_uuid(),
  user_id         text not null,
  title           text,
  prompt          text,
  draft           text not null default '',
  source_item_ids uuid[] not null,
  created_at      timestamptz not null default now()
);

alter table syntheses disable row level security;

create index if not exists syntheses_user_idx
  on syntheses(user_id, created_at desc);
