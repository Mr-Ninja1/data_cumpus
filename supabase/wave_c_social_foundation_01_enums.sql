-- Wave C — STEP 1 of 2 (run this ALONE, then click Run / commit)
--
-- PostgreSQL requires new enum values to be committed before they can be
-- referenced in policies or defaults. Do NOT combine this file with
-- wave_c_social_foundation.sql in one batch.
--
-- Run order so far:
--   1) supabase/saves.sql
--   2) supabase/wave_b_migration.sql
--   3) THIS FILE  ← run alone, wait for success
--   4) supabase/wave_c_social_foundation.sql

alter type public.role_enum add value if not exists 'trusted_contributor';
alter type public.role_enum add value if not exists 'moderator';
alter type public.role_enum add value if not exists 'admin';
alter type public.role_enum add value if not exists 'owner';
