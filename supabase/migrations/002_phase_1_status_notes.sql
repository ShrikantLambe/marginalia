-- Phase 1: status, notes, highlights, rating, read_at, last_opened_at
-- Prerequisite: 001_phase_0_initial.sql
-- Run in Supabase SQL Editor after 001_phase_0_initial.sql

alter table reading_list
  add column if not exists status text not null default 'unread'
    check (status in ('unread', 'reading', 'read', 'archived')),
  add column if not exists notes text,
  add column if not exists highlights jsonb default '[]'::jsonb,
  add column if not exists rating smallint check (rating between 1 and 5),
  add column if not exists read_at timestamptz,
  add column if not exists last_opened_at timestamptz;

create index if not exists reading_list_user_status_idx
  on reading_list(user_id, status);
