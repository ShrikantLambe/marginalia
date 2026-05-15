-- Phase 7: reader view — article content + structured highlights table
-- Prerequisite: 010_atomic_usage_check.sql

-- 1. Add article content columns to reading_list
alter table reading_list
  add column if not exists article_html          text,
  add column if not exists article_text          text,
  add column if not exists author                text,
  add column if not exists site_name             text,
  add column if not exists hero_image_url        text,
  add column if not exists word_count            int,
  add column if not exists reading_time_minutes  int;

-- 2. Create structured highlights table (replaces highlights jsonb column)
create table if not exists highlights (
  id              uuid primary key default gen_random_uuid(),
  user_id         text not null,
  item_id         uuid not null references reading_list(id) on delete cascade,
  text            text not null,
  note            text,
  position_start  int,
  position_end    int,
  created_at      timestamptz not null default now()
);

alter table highlights disable row level security;

create index if not exists highlights_item_idx on highlights(item_id, position_start);
create index if not exists highlights_user_idx on highlights(user_id, created_at desc);

-- 3. Migrate existing jsonb highlights to the new table (only if column exists)
do $$
declare
  r   record;
  h   jsonb;
  col_exists boolean;
begin
  select exists (
    select 1 from information_schema.columns
    where table_name = 'reading_list' and column_name = 'highlights'
  ) into col_exists;

  if not col_exists then
    return;
  end if;

  for r in
    select id, user_id, highlights
    from reading_list
    where highlights is not null and jsonb_array_length(highlights) > 0
  loop
    for h in select jsonb_array_elements(r.highlights)
    loop
      if (h->>'text') is not null and (h->>'text') != '' then
        insert into highlights (user_id, item_id, text, created_at)
        values (
          r.user_id,
          r.id,
          h->>'text',
          coalesce((h->>'created_at')::timestamptz, now())
        )
        on conflict do nothing;
      end if;
    end loop;
  end loop;
end;
$$;

-- 4. Drop the old jsonb highlights column
alter table reading_list drop column if exists highlights;
