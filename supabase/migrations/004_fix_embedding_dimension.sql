-- Fix: gemini-embedding-001 returns 3072 dimensions, not 768.
-- Also resolves the overloaded match_reading_list ambiguity.
-- Run in Supabase SQL Editor.

-- 1. Drop conflicting RPC overloads
drop function if exists public.match_reading_list(public.vector, text, float, integer);
drop function if exists public.match_reading_list(text, text, float, integer);

-- 2. Drop HNSW index (depends on column type)
drop index if exists reading_list_embedding_idx;

-- 3. Resize embedding column to 3072
alter table reading_list drop column if exists embedding;
alter table reading_list add column embedding vector(3072);

-- 4. Recreate HNSW index
create index reading_list_embedding_idx
  on reading_list using hnsw (embedding vector_cosine_ops);

-- 5. Recreate RPC with correct dimension and text parameter
create function match_reading_list(
  query_embedding  text,
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
    (1 - (embedding <=> query_embedding::vector))::float as similarity
  from reading_list
  where user_id = match_user_id
    and embedding is not null
    and (1 - (embedding <=> query_embedding::vector)) > match_threshold
  order by embedding <=> query_embedding::vector
  limit match_count;
$$;
