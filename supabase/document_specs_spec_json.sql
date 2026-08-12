-- Adds structured, chapter-keyed spec storage to document_specs.
-- spec_md remains for legacy/human-readable markdown specs.
-- spec_json holds the machine-readable structure extracted (once) from an
-- uploaded guidance document, so generation can pull only the relevant
-- chapter's fragment instead of the whole document every time.
alter table public.document_specs add column if not exists spec_json jsonb;
