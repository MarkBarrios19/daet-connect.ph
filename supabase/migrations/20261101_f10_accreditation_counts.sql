-- The home page's "Travel with people from here" band shows two numbers: how
-- many operators and how many guides the Tourism Office has accredited.
--
-- Anonymous visitors cannot select tours_operators or tours_guides (see
-- 20261101_f8_reviews.sql), and they have no business reading those rows — only
-- the counts. This returns the two integers and nothing else.
--
-- Read-only, stable, one row. Safe to re-run.

create or replace function public.tours_accreditation_counts()
returns table (operators integer, guides integer)
language sql
stable
security definer
set search_path = public
as $$
  select
    (select count(*)::integer from public.tours_operators where accreditation_status = 'approved'),
    (select count(*)::integer from public.tours_guides    where accreditation_status = 'approved');
$$;

comment on function public.tours_accreditation_counts() is
  'Approved operator and guide counts for the public home page. Returns counts only, never rows.';

revoke all on function public.tours_accreditation_counts() from public;
grant execute on function public.tours_accreditation_counts() to anon, authenticated;
