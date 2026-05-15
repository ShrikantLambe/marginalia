-- Phase 5: Briefs — question-driven reading

create table if not exists briefs (
  id            uuid primary key default gen_random_uuid(),
  user_id       text not null,
  question      text not null,
  description   text,
  embedding     vector(768),
  status        text not null default 'open'
                check (status in ('open', 'drafting', 'closed', 'archived')),
  closed_reason text,
  created_at    timestamptz not null default now(),
  closed_at     timestamptz
);

create table if not exists brief_items (
  brief_id       uuid not null references briefs(id) on delete cascade,
  item_id        uuid not null references reading_list(id) on delete cascade,
  added_at       timestamptz not null default now(),
  added_by       text not null check (added_by in ('user', 'auto')),
  similarity     real,
  user_dismissed boolean not null default false,
  primary key (brief_id, item_id)
);

create index if not exists briefs_user_status_idx on briefs(user_id, status);
create index if not exists brief_items_brief_idx  on brief_items(brief_id, added_at desc);
create index if not exists brief_items_item_idx   on brief_items(item_id);

alter table briefs      disable row level security;
alter table brief_items disable row level security;
