#!/usr/bin/env node
// Pushes the real base_spec.json chapter/section structure into
// document_specs.spec_json for the proposal spec key the generate route
// actually looks up ("zut-it-final-year-proposal" by default). Re-runnable —
// safe to re-run any time base_spec.json changes.
//
// Root cause this fixes: generate/route.ts correctly resolves specKey ->
// document_specs row -> spec_json -> getChapterSpecFragment(chapterKey) and
// splices that fragment into the model prompt. If that row's spec_json is
// null/shallow, getChapterSpecFragment legitimately returns '' and chapters
// fall back to the generic per-chapter guidance only — which is exactly the
// "shallow chapter" symptom. This script makes sure the row actually holds
// the full spec instead of asking anyone to hand-paste JSON into a textarea.
//
// Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in env.
// Run from the datacampus/ directory: node ./scripts/seed-proposal-spec.js
// Optional: SEED_USER_ID=<uuid> to pick which staff user owns the row.
// Optional: PROPOSAL_SPEC_KEY=<key> to seed a different spec key.

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Minimal .env loader (no dotenv dependency needed) — only fills in vars
// that aren't already set in the process environment, and never logs them.
function loadDotEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const contents = fs.readFileSync(filePath, 'utf8');
  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (key && !(key in process.env)) process.env[key] = value;
  }
}

loadDotEnvFile(path.resolve(__dirname, '..', '.env.local'));
loadDotEnvFile(path.resolve(__dirname, '..', '.env'));

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SERVICE_KEY || !SUPABASE_URL) {
  console.error('Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const SPEC_KEY = process.env.PROPOSAL_SPEC_KEY || 'zut-it-final-year-proposal';
const BASE_SPEC_PATH = path.resolve(__dirname, '..', '..', 'base_spec.json');
const STAFF_ROLES = ['moderator', 'admin', 'owner'];

function normalizeChapterKey(chapter) {
  if (chapter.key) return chapter.key;
  const number = chapter.number ?? chapter.chapter;
  return typeof number === 'number'
    ? `chapter_${number}`
    : String(chapter.title || '').toLowerCase().replace(/\s+/g, '_');
}

/** Parses "4.1 Introduction" / "5.2 Results" style summary strings from
 * later_stage_chapters_summary into a minimal section shape. */
function parseSummarySection(raw) {
  const text = String(raw || '').trim();
  const match = text.match(/^(\d+(?:\.\d+)*)\s+([^(]+?)(\s*\(.*\))?$/);
  if (!match) return { title: text };
  return {
    number: match[1],
    title: match[2].trim(),
    description: match[3] ? match[3].trim().replace(/^\(|\)$/g, '') : undefined,
  };
}

function buildFrontMatter(baseSpec) {
  const coverGuidance = baseSpec.logo_asset_note
    ? `Cover page — no strict mandated layout; keep it professional and prioritize the user's specific formatting requests over any default template. ${baseSpec.logo_asset_note}`
    : "Cover page — no strict mandated layout; keep it professional and prioritize the user's specific formatting requests over any default template.";

  return [
    { key: 'cover_page', guidance: coverGuidance },
    {
      key: 'table_of_contents',
      guidance:
        'Table of contents listing the cover page, chapters (with their numbered sections), and references, built after chapters are drafted — never typed by hand or generated before the chapters it lists.',
    },
    {
      key: 'abstract',
      guidance:
        'A concise (200-350 word) summary of the problem, approach, and expected outcome — written after Chapters 1-3 exist so it accurately reflects the project. Required only at the full_project stage.',
    },
    {
      key: 'acknowledgement',
      guidance:
        'A brief, personal acknowledgement thanking supervisors, institution, and anyone who supported the project. Keep tone sincere and short. Required only at the full_project stage.',
    },
  ];
}

function buildBackMatter(baseSpec) {
  const citationStyle = baseSpec.citation_style || 'numbered_bracket (e.g. [3], [2])';
  return [
    {
      key: 'references',
      guidance: `Reference list rendered deterministically from references.json, in ${citationStyle} citation style. Never AI-written — pure data rendering. Every in-text citation must match an entry here.`,
    },
    {
      key: 'appendices',
      guidance:
        'Supplementary material (raw data, extended diagrams, code listings) that supports but does not belong in the main chapters. Required only at the full_project stage.',
    },
  ];
}

function transform(baseSpec) {
  const chapters = (baseSpec.chapters || []).map((chapter) => ({
    key: normalizeChapterKey(chapter),
    number: chapter.number ?? chapter.chapter,
    title: chapter.title,
    sections: chapter.sections || [],
    required_inputs: chapter.required_inputs,
    notes: chapter.notes,
  }));

  const laterChapters = (baseSpec.later_stage_chapters_summary || []).map((chapter) => ({
    key: normalizeChapterKey(chapter),
    number: chapter.number ?? chapter.chapter,
    title: chapter.title,
    sections: Array.isArray(chapter.sections) ? chapter.sections.map(parseSummarySection) : [],
    notes: chapter.note,
  }));

  return {
    doc_type: baseSpec.doc_type,
    citation_style: baseSpec.citation_style,
    logo_asset_note: baseSpec.logo_asset_note,
    stages: baseSpec.stages,
    front_matter: buildFrontMatter(baseSpec),
    back_matter: buildBackMatter(baseSpec),
    chapters: [...chapters, ...laterChapters],
    extraction_notes: baseSpec.extraction_notes,
  };
}

async function resolveOwnerUserId(supabase, existingUserId) {
  if (existingUserId) return existingUserId;
  if (process.env.SEED_USER_ID) return process.env.SEED_USER_ID;

  const { data, error } = await supabase
    .from('profiles')
    .select('id,role')
    .in('role', STAFF_ROLES)
    .limit(1)
    .maybeSingle();

  if (error || !data) {
    console.error(
      'No existing document_specs row and no staff user found in profiles. Set SEED_USER_ID=<your user uuid> and re-run.'
    );
    process.exit(1);
  }
  return data.id;
}

async function main() {
  if (!fs.existsSync(BASE_SPEC_PATH)) {
    console.error(`Could not find base_spec.json at ${BASE_SPEC_PATH}`);
    process.exit(1);
  }

  const baseSpec = JSON.parse(fs.readFileSync(BASE_SPEC_PATH, 'utf8'));
  const specJson = transform(baseSpec);

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
  const { data: existing } = await supabase.from('document_specs').select('id,user_id').eq('key', SPEC_KEY).maybeSingle();
  const userId = await resolveOwnerUserId(supabase, existing?.user_id);

  const { data, error } = await supabase
    .from('document_specs')
    .upsert(
      {
        key: SPEC_KEY,
        title: 'ZICTC / ZUT IT Final Year Proposal Standard',
        description: baseSpec.program_scope || 'Official chapter/section structure for the final year project proposal.',
        spec_md: '',
        spec_json: specJson,
        examples: [],
        user_id: userId,
        is_public: true,
        approved: true,
      },
      { onConflict: 'key' }
    )
    .select()
    .single();

  if (error) {
    console.error('Failed to seed proposal spec:', error.message);
    process.exit(1);
  }

  const chapterCount = specJson.chapters.length;
  const sectionCount = specJson.chapters.reduce((sum, c) => sum + (c.sections || []).length, 0);
  console.log(`Seeded document_specs["${SPEC_KEY}"] (id: ${data.id}) with ${chapterCount} chapters, ${sectionCount} top-level sections.`);
  console.log('Chapters:', specJson.chapters.map((c) => `${c.key} (${(c.sections || []).length} sections)`).join(', '));
}

main();
