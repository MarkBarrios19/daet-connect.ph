-- Daily count of assistant messages, per signed-in account or per device.
--
-- Decisions 5, 18 and 37 in docs/TRIP_PLANNER.md: a visitor who is not signed
-- in gets 3 messages a day with full AI answers, a signed-in visitor 20; after
-- that the assistant answers in basic mode. The day is the Manila calendar day.
--
-- The count used to live in each server's memory, which Vercel resets whenever
-- it starts a new instance, so it could not count a whole day.
--
-- caller is "u:<user id>" or "d:<random device id from a cookie>". Device ids
-- rather than IP addresses: many Philippine phones share one address through
-- their carrier. Only the server (service role) reads or writes this table.
--
-- Re-running this file is safe.

create table if not exists public.tours_ai_usage (
  caller text not null check (char_length(caller) between 3 and 80),
  day date not null,
  messages integer not null default 0 check (messages >= 0),
  primary key (caller, day)
);

alter table public.tours_ai_usage enable row level security;
-- No policies: anon and authenticated cannot see or change it.
revoke all on public.tours_ai_usage from anon, authenticated;

-- Counts one message and returns the day's total, in one statement so two
-- messages sent at once can't both read the old count.
create or replace function public.tours_ai_count_message(p_caller text, p_day date)
returns integer
language sql
security definer
set search_path = public
as $$
  insert into public.tours_ai_usage as u (caller, day, messages)
  values (p_caller, p_day, 1)
  on conflict (caller, day) do update set messages = u.messages + 1
  returning u.messages;
$$;

revoke all on function public.tours_ai_count_message(text, date) from public, anon, authenticated;
grant execute on function public.tours_ai_count_message(text, date) to service_role;

-- Old rows are no use after the day ends; keep a week for support questions.
create or replace function public.tours_ai_usage_prune()
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.tours_ai_usage where day < (now() at time zone 'Asia/Manila')::date - 7;
$$;

revoke all on function public.tours_ai_usage_prune() from public, anon, authenticated;
grant execute on function public.tours_ai_usage_prune() to service_role;
