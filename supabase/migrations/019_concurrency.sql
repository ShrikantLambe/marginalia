-- Concurrency hardening
-- Prerequisite: 018_failed_items.sql

-- 1. Make the daily usage check race-free.
-- The previous version did SELECT count(*) then a conditional INSERT with no
-- locking, so K concurrent calls at (limit - 1) could all pass and overshoot
-- the cap. A per-user transaction-scoped advisory lock serializes concurrent
-- calls for the SAME user (different users hash to different keys and never
-- contend). The lock releases automatically at the end of the function's
-- implicit transaction.
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
  perform pg_advisory_xact_lock(hashtext(p_user_id)::bigint);

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

-- 2. Atomic reading-progress update (replaces a read-modify-write in the open
-- beacon). scroll_progress only ever moves up; reaching 100% marks the item
-- read. A single UPDATE means concurrent beacons can't regress progress.
create or replace function record_reading_progress(
  p_item_id  uuid,
  p_user_id  text,
  p_progress int default null
)
returns void
language sql
as $$
  update reading_list
  set last_opened_at = now(),
      scroll_progress = case
        when p_progress is null then scroll_progress
        else greatest(scroll_progress, p_progress)
      end,
      status = case
        when p_progress >= 100 and status not in ('read', 'archived') then 'read'
        else status
      end,
      read_at = case
        when p_progress >= 100 and status not in ('read', 'archived') then now()
        else read_at
      end
  where id = p_item_id and user_id = p_user_id;
$$;
