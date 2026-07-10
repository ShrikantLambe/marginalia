-- Extraction failure becomes a first-class state + draft title backfill
-- Prerequisite: 017_scroll_progress.sql

-- 1. Extend the status taxonomy with 'failed'
alter table reading_list drop constraint if exists reading_list_status_check;
alter table reading_list
  add constraint reading_list_status_check
  check (status in ('queued', 'reading', 'read', 'archived', 'failed'));

-- 2. Machine-readable failure reason ('pdf' | 'empty_extract' | 'fetch_error')
alter table reading_list
  add column if not exists failure_reason text;

-- 3. Data fix: rows where an extraction-failure message was stored as the
--    summary. Flip them to failed, clear the corrupt tags, and delete their
--    embeddings so semantic search / themes / brief routing are clean again.
update reading_list
set status = 'failed',
    failure_reason = case
      when summary ilike '%pdf%' then 'pdf'
      else 'empty_extract'
    end,
    summary = null,
    tags = null,
    embedding = null,
    embedding_model = null,
    embedded_at = null,
    editorial_note = null,
    editorial_references = '{}'
where status != 'failed'
  and (
    summary ilike '%unreadable content%'
    or summary ilike '%cannot be summarized%'
    or summary ilike '%unable to summarize%'
    or summary ilike '%cannot access the content%'
    or summary ilike '%does not contain any article content%'
    or exists (
      select 1 from unnest(coalesce(tags, '{}')) t
      where t ilike '%unreadable%' or t ilike '%error%'
    )
  );

-- 4. Past Drafts polish: no synthesis should render as "Untitled draft"
update syntheses
set title = 'Draft · ' || to_char(created_at, 'Mon DD')
where title is null or title = '';
