-- Phase 3: reading themes via DBSCAN clustering
-- Run in Supabase SQL Editor after 005_unique_url_per_user.sql

create extension if not exists vector;

create table if not exists reading_themes (
  id           uuid primary key default gen_random_uuid(),
  user_id      text not null,
  name         text not null,
  description  text,
  centroid     vector(768),
  item_ids     uuid[] not null,
  item_count   int generated always as (array_length(item_ids, 1)) stored,
  generated_at timestamptz not null default now(),
  user_renamed boolean default false
);

create index if not exists reading_themes_user_idx
  on reading_themes(user_id, generated_at desc);
