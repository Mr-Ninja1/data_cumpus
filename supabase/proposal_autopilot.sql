-- Autopilot: lets a student ask the assistant to keep drafting a proposal
-- in the background until it's actually done, without needing to send a
-- message for every chapter. Deliberately lightweight — two small columns
-- plus a partial index for the worker's polling query, no new tables.
-- Safe to re-run.

alter table public.proposal_projects
  add column if not exists autopilot_enabled boolean not null default false;

alter table public.proposal_projects
  add column if not exists autopilot_status text not null default 'idle';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'proposal_projects_autopilot_status_check'
  ) then
    alter table public.proposal_projects
      add constraint proposal_projects_autopilot_status_check
      check (autopilot_status in ('idle', 'queued', 'running', 'completed', 'failed', 'paused_insufficient_credits'));
  end if;
end $$;

-- Partial index: only rows actually on autopilot are ever scanned by the
-- worker's poll query, so this stays cheap even with many stored proposals.
create index if not exists proposal_projects_autopilot_idx
  on public.proposal_projects (autopilot_status, updated_at)
  where autopilot_enabled = true;
