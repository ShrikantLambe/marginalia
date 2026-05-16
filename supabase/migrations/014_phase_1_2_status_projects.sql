-- Phase 1 + 2: Status collapse, tag provenance, Projects model
-- Prerequisite: 013_fix_match_reading_list.sql

-- ── Phase 1A: Collapse status enum ──────────────────────────────────────────
-- Old: unread | reading | read | archived
-- New: queued  | reading | read | archived  (inbox is a nav concept, not a status)

-- 1. Drop old check constraint
alter table reading_list drop constraint if exists reading_list_status_check;

-- 2. Migrate data: unread → queued
update reading_list set status = 'queued' where status = 'unread';

-- 3. Add new constraint
alter table reading_list
  add constraint reading_list_status_check
  check (status in ('queued', 'reading', 'read', 'archived'));

-- 4. Change default
alter table reading_list alter column status set default 'queued';

-- ── Phase 1B: Tag provenance ─────────────────────────────────────────────────
-- user_tags tracks which tags the user explicitly added (vs LLM-extracted)
alter table reading_list
  add column if not exists user_tags text[] not null default '{}';

-- ── Phase 2: Projects model ──────────────────────────────────────────────────

create table if not exists projects (
  id          uuid primary key default gen_random_uuid(),
  user_id     text not null,
  name        text not null,
  emoji       text not null default '📁',
  color       text,
  description text,
  status      text not null default 'active'
              check (status in ('active', 'paused', 'archived')),
  sort_order  int not null default 0,
  created_at  timestamptz not null default now()
);

alter table projects disable row level security;

create index if not exists projects_user_idx
  on projects(user_id, status, sort_order);

-- Many-to-many: items can belong to multiple projects
create table if not exists project_items (
  project_id uuid not null references projects(id) on delete cascade,
  item_id    uuid not null references reading_list(id) on delete cascade,
  added_at   timestamptz not null default now(),
  primary key (project_id, item_id)
);

alter table project_items disable row level security;

create index if not exists project_items_project_idx
  on project_items(project_id, added_at desc);
create index if not exists project_items_item_idx
  on project_items(item_id);

-- Link syntheses to a project (nullable — existing drafts are unassigned)
alter table syntheses
  add column if not exists project_id uuid references projects(id) on delete set null;
