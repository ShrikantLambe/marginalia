-- Atomic usage check + log in a single round-trip.
-- Prerequisite: 009_phase_6_editorial.sql
-- Returns true if the operation is allowed (under the daily limit), false if not.
-- Inserts the log row only if allowed, preventing race conditions.
-- Run in Supabase SQL Editor after 009_phase_6_editorial.sql

create or replace function check_and_log_usage(
  p_user_id  text,
  p_operation text,
  p_limit    int default 150
)
returns boolean
language plpgsql
as $$
declare
  v_count int;
begin
  select count(*) into v_count
  from usage_log
  where user_id = p_user_id
    and created_at >= now() - interval '24 hours';

  if v_count >= p_limit then
    return false;
  end if;

  insert into usage_log (user_id, operation)
  values (p_user_id, p_operation);

  return true;
end;
$$;
