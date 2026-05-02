-- Cross-cutting: Gemini API usage tracking and daily rate limiting
-- Prerequisite: 007_phase_4_syntheses.sql
-- Run in Supabase SQL Editor

create table if not exists usage_log (
  id         uuid primary key default gen_random_uuid(),
  user_id    text not null,
  operation  text not null, -- summarize | embed | cluster-name | synthesize
  tokens_in  int,
  tokens_out int,
  created_at timestamptz not null default now()
);

alter table usage_log disable row level security;

create index if not exists usage_log_user_day_idx
  on usage_log(user_id, created_at);
