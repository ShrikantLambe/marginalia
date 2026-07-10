-- Welcome Back: reading progress via the existing open beacon
-- Prerequisite: 016_discover.sql

alter table reading_list
  add column if not exists scroll_progress smallint not null default 0;
