-- Add metadata to proposal_generations so generation payloads can store attachments and extra info
-- Idempotent migration

alter table public.proposal_generations
  add column if not exists metadata jsonb not null default '{}'::jsonb;

-- Optionally add an index for queries that filter by keys in metadata (example)
-- create index if not exists proposal_generations_metadata_idx on public.proposal_generations ((metadata->'attachments'));
