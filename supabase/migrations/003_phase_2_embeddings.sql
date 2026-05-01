-- Phase 2: semantic search via pgvector
-- Run in Supabase SQL Editor after 002_phase_1_status_notes.sql

create extension if not exists vector;

alter table reading_list
  add column if not exists embedding       vector(768),
  add column if not exists embedding_model text,
  add column if not exists embedded_at     timestamptz;

-- HNSW index for cosine similarity searches
create index if not exists reading_list_embedding_idx
  on reading_list using hnsw (embedding vector_cosine_ops);

-- RPC function for semantic search — returns full row + similarity score
create or replace function match_reading_list(
  query_embedding  vector(768),
  match_user_id    text,
  match_threshold  float,
  match_count      int
)
returns table (
  id              uuid,
  user_id         text,
  url             text,
  title           text,
  summary         text,
  tags            text[],
  created_at      timestamptz,
  status          text,
  notes           text,
  highlights      jsonb,
  rating          smallint,
  read_at         timestamptz,
  last_opened_at  timestamptz,
  similarity      float
)
language sql stable
as $$
  select
    id, user_id, url, title, summary, tags, created_at,
    status, notes, highlights, rating, read_at, last_opened_at,
    (1 - (embedding <=> query_embedding))::float as similarity
  from reading_list
  where user_id = match_user_id
    and embedding is not null
    and (1 - (embedding <=> query_embedding)) > match_threshold
  order by embedding <=> query_embedding
  limit match_count;
$$;
