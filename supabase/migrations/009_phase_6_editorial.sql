-- Phase 6: editorial annotations
-- Run in Supabase SQL Editor after 008_usage_log.sql

alter table reading_list
  add column if not exists editorial_note       text,
  add column if not exists editorial_references uuid[] default '{}',
  add column if not exists editorial_generated_at timestamptz;
