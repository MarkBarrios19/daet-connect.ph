-- "Was this helpful? Yes / No" under each assistant answer (decisions 26 and 29
-- in docs/TRIP_PLANNER.md). Recorded only: no account is attached, and only the
-- server (service role) writes or reads it.
--
-- Re-running this file is safe.

create table if not exists public.tours_ai_feedback (
  id uuid primary key default gen_random_uuid(),
  helpful boolean not null,
  mode text not null check (mode in ('ai', 'basic')),
  question text check (question is null or char_length(question) <= 300),
  answer text not null check (char_length(answer) between 1 and 600),
  page text check (page is null or char_length(page) <= 200),
  created_at timestamptz not null default now()
);

alter table public.tours_ai_feedback enable row level security;
revoke all on public.tours_ai_feedback from anon, authenticated;

create index if not exists idx_tours_ai_feedback_created on public.tours_ai_feedback (created_at desc);
