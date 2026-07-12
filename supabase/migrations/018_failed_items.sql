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
--
--    IMPORTANT: match ONLY on anchored failure phrasings that begin the
--    summary — never a bare '%pdf%' / '%error%' substring, which would
--    destroy a legitimate article *about* PDFs or errors. These are the exact
--    phrases the pre-018 summarizer emitted when Gemini reported it could not
--    parse the input.
update reading_list
set status = 'failed',
    failure_reason = case
      when summary ilike '%raw pdf%' or summary ilike '%pdf format%' then 'pdf'
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
    summary ilike 'The provided article content is in a raw pdf%'
    or summary ilike 'This content is unreadable%'
    or summary ilike '%cannot be summarized as it contains no%'
    or summary ilike '%does not contain any article content%'
    or summary ilike '%cannot access the content of the provided url%'
  );

-- 4. Past Drafts polish: no synthesis should render as "Untitled draft"
update syntheses
set title = 'Draft · ' || to_char(created_at, 'Mon DD')
where title is null or title = '';
