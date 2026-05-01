-- Fix: drop conflicting match_reading_list overloads (one with vector param,
-- one with text param) and recreate with a single text-param version.
-- The embedding column stays vector(768) — we truncate via outputDimensionality
-- in the API call so the schema needs no changes.
-- Run in Supabase SQL Editor.

-- 1. Drop both overloads
drop function if exists public.match_reading_list(public.vector, text, float, integer);
drop function if exists public.match_reading_list(text, text, float, integer);

-- 2. Recreate with a single unambiguous signature
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
