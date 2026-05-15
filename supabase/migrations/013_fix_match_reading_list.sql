-- Fix match_reading_list: drop highlights column reference, add Phase 7 metadata fields.
-- Run after 011_phase_7_reader.sql (which dropped the highlights jsonb column).

drop function if exists public.match_reading_list(text, text, float, integer);

create function match_reading_list(
  query_embedding  text,
  match_user_id    text,
  match_threshold  float,
  match_count      int
)
returns table (
  id                      uuid,
  user_id                 text,
  url                     text,
  title                   text,
  summary                 text,
  tags                    text[],
  created_at              timestamptz,
  status                  text,
  notes                   text,
  rating                  smallint,
  read_at                 timestamptz,
  last_opened_at          timestamptz,
  embedding_model         text,
  embedded_at             timestamptz,
  editorial_note          text,
  editorial_references    uuid[],
  editorial_generated_at  timestamptz,
  author                  text,
  site_name               text,
  hero_image_url          text,
  word_count              int,
  reading_time_minutes    int,
  similarity              float
)
language sql stable
as $$
  select
    id, user_id, url, title, summary, tags, created_at,
    status, notes, rating, read_at, last_opened_at,
    embedding_model, embedded_at,
    editorial_note, editorial_references, editorial_generated_at,
    author, site_name, hero_image_url, word_count, reading_time_minutes,
    (1 - (embedding <=> query_embedding::vector))::float as similarity
  from reading_list
  where user_id = match_user_id
    and embedding is not null
    and (1 - (embedding <=> query_embedding::vector)) > match_threshold
  order by embedding <=> query_embedding::vector
  limit match_count;
$$;
