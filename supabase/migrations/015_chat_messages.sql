-- Contextual Q&A, passage deep-dive, and proactive reading-behavior insights
-- Prerequisite: 014_phase_1_2_status_projects.sql

create table if not exists chat_messages (
  id            uuid primary key default gen_random_uuid(),
  user_id       text not null,
  item_id       uuid not null references reading_list(id) on delete cascade,
  highlight_id  uuid references highlights(id) on delete cascade,
  role          text not null check (role in ('user', 'assistant')),
  content       text not null,
  trigger       text not null default 'manual'
                check (trigger in ('manual', 'proactive')),
  context_note  text,
  created_at    timestamptz not null default now()
);

alter table chat_messages disable row level security;

create index if not exists chat_messages_item_idx on chat_messages(item_id, created_at);
create index if not exists chat_messages_highlight_idx on chat_messages(highlight_id, created_at);
create index if not exists chat_messages_user_idx on chat_messages(user_id, created_at desc);
