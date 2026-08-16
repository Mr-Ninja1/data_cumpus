# DataCampus Proposal System — Quick Reference Guide

**One-page cheat sheet for developers**

---

## Core Files You Need to Know

| File | Purpose | When to Edit |
|------|---------|----------|
| `base_spec.json` | Master proposal structure (chapters 1–6, sections, requirements) | When ZUT standards change |
| `proposalSpec.ts` | Parse spec by chapter key; extract section requirements | When adding new chapter types |
| `proposalFlow.ts` | Workflow state logic (progression, completion checks) | When changing workflow rules |
| `proposalTools.ts` | Build prompts, parse responses, handle sections | When improving generation quality |
| `referenceDiscovery.ts` | Crossref API lookup and dedup | When changing reference search |
| `projectTitle.ts` | Auto-refine student input | When improving title cleanup |
| `proposalDocx.ts` | Export formatting (DOCX generation) | When changing document format |
| `ProposalWorkspaceShell.tsx` | Main UI component | When improving UX |
| `ProposalCoverPagePreview.tsx` | Live cover page rendering | When changing cover layout |
| `generate/route.ts` | Main generation endpoint (spec load → LLM → parse → save) | When improving generation logic |
| `ask/route.ts` | Chat interaction within a chapter | When adding chat features |
| `edit/route.ts` | Revision/edit endpoint | When improving revision mode |
| `export/route.ts` | Export to DOCX/HTML | When changing export behavior |
| `upgrade-stage/route.ts` | Unlock chapters 4–6 (progression gate) | When changing unlock rules |

---

## Generation Flow in 5 Steps

```
1. Load Spec
   base_spec.json → extract chapter definition (1.1–1.9)

2. Match Templates
   Load proposal_templates, score by: school match, doc type match
   Retrieve top 3–5 + extract text chunks

3. Prepare Context
   - Chapter spec (sections + guidance)
   - Template examples (3–5 best matches)
   - Project metadata (title, dept, supervisor)
   - Filtered references (top 2–3 most relevant)

4. Call LLM
   POST to Claude/Gemini API with system prompt + context + user request

5. Parse & Save
   Extract sections from response (by heading numbers)
   Save to proposal_sections table
   Deduct credits from wallet
   Update workflow metadata
   Return to UI
```

---

## Key Tables (Simplified)

```
projects
├─ id, user_id, title, department, supervisor, academic_year
├─ current_step (chapter_1, chapter_2, ...)
├─ status (draft, submitted, approved)
└─ metadata (workflow state, chapters, stage, spec_key)

proposal_sections
├─ id, project_id, section_key (chapter_1, chapter_2, cover_page, etc.)
├─ title, content_md, status (pending, generating, complete, incomplete)
└─ updated_at

proposal_references
├─ id, project_id, title, author, year, source (crossref, manual)
├─ citation_key ([1], [2], etc.), url, doi
└─ journal, publisher

proposal_templates
├─ id, user_id (admin), title, file_path (in storage)
├─ metadata (school, doc_type, role)
└─ approved, is_public

template_chunks
├─ template_id, chunk_index, chunk_text, embedding (pgvector)
└─ (for semantic search in generate flow)

document_specs
├─ id, key (zut_it_se), title, spec_json (≈ base_spec.json)
├─ approved, is_public
└─ (per-school proposal standards)

user_wallets
├─ user_id, balance_credits, updated_at

wallet_transactions
├─ user_id, kind (generation, topup), credits_delta
├─ status (pending, complete, failed)
└─ metadata (project_id, chapter_key, reason)
```

---

## Critical Paths (When Things Must Happen)

### **On Project Create**
```
1. Auto-refine title (projectTitle.ts)
2. Create project record in DB
3. Auto-trigger reference discovery (referenceDiscovery.ts)
   → Crossref API call
   → Save to reference_lookup
4. If auto-mode: auto-generate cover page
5. Initialize workflow metadata
   stage: "initial_proposal"
   completed_chapters: []
   current_chapter: "chapter_1"
```

### **On Generate Request**
```
1. Check user auth + credit balance
2. Load spec (base_spec.json or custom)
3. Extract chapter definition
4. Load + score templates
5. Build prompt (spec + templates + context + references)
6. Call LLM
7. Parse response by section number
8. Save each section to proposal_sections
9. Deduct credits
10. Update workflow metadata (mark chapter complete)
11. Check: is_initial_proposal_ready()
    → If yes, unlock upgrade button
    → If no, suggest next chapter
```

### **On Upgrade to Full Project**
```
1. Check isInitialProposalReady() — ALL 3 chapters must be complete
2. Create proposal_sections for chapters 4, 5, 6
3. Update metadata.stage = "full_project"
4. Return unlocked state + new chapter list
```

### **On Export**
```
1. Fetch all proposal_sections for project
2. Fetch all proposal_references
3. Build markdown (with TOC, section headers, citations)
4. Apply IEEE citation style
5. Convert markdown to DOCX
6. Embed school logo
7. Save export record to DB
8. Return downloadable blob
```

---

## Important Constants

```typescript
// Credit costs
CHAPTER_GENERATION_COST = 50  // per chapter
SECTION_CONTINUATION_COST = 20 // per missing section

// Workflow stages
INITIAL_PROPOSAL = "initial_proposal"   // 3 chapters
FULL_PROJECT = "full_project"           // 6 chapters

// Chapter keys
CHAPTER_1 = "chapter_1"  // Introduction
CHAPTER_2 = "chapter_2"  // Literature Review
CHAPTER_3 = "chapter_3"  // Methodology
CHAPTER_4 = "chapter_4"  // System Design
CHAPTER_5 = "chapter_5"  // Results
CHAPTER_6 = "chapter_6"  // Conclusion

// Section keys
COVER_PAGE = "cover_page"
TABLE_OF_CONTENTS = "table_of_contents"
REFERENCES = "references"

// Status values
STATUS_PENDING = "pending"
STATUS_GENERATING = "generating"
STATUS_COMPLETE = "complete"
STATUS_INCOMPLETE = "incomplete"
```

---

## Common Queries

```sql
-- Get all projects for a user
SELECT * FROM projects WHERE user_id = ? ORDER BY updated_at DESC

-- Get all sections of a chapter
SELECT * FROM proposal_sections 
WHERE project_id = ? AND section_key = ? 
ORDER BY created_at

-- Get references for a project
SELECT * FROM proposal_references WHERE project_id = ?

-- Check initial proposal readiness
SELECT COUNT(*) FROM proposal_sections 
WHERE project_id = ? AND chapter_key IN ('chapter_1', 'chapter_2', 'chapter_3') 
AND status = 'complete'
-- If count = 3, can unlock full project

-- Get user's credit balance
SELECT balance_credits FROM user_wallets WHERE user_id = ?

-- Get top templates by school
SELECT id, title, metadata FROM proposal_templates 
WHERE metadata->>'school' = ? AND approved = true
ORDER BY metadata->>'role' DESC
LIMIT 5
```

---

## Environment Variables You Need

```bash
# Database
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=eyJhbGc...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGc... # Server-side only

# AI Providers
ANTHROPIC_API_KEY=sk-ant-...
GOOGLE_GENERATIVE_AI_API_KEY=AIza...

# Storage
NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET=proposals-storage

# Optional: Crossref (no key needed, but rate-limit aware)
CROSSREF_EMAIL=your-email@school.edu

# Optional: Plagiarism (if using Turnitin or Copyscape)
TURNITIN_API_KEY=...
```

---

## Debugging Checklist

**Generation failed?**
```
❑ User has enough credits?
❑ base_spec.json is valid JSON?
❑ Chapter key exists in spec? (chapter_1, chapter_2, ...)
❑ LLM API key is valid?
❑ Response parsing worked? (check logs for section extraction)
❑ Database insert succeeded? (check proposal_sections table)
```

**References not showing?**
```
❑ Crossref API returned results?
❑ Results saved to reference_lookup table?
❑ Reference dedup logic removed duplicates correctly?
❑ UI filter isn't hiding them?
```

**Export broken?**
```
❑ All sections exist in DB?
❑ Logo file exists in storage?
❑ Markdown to DOCX conversion succeeded?
❑ Citation style applied correctly?
```

**Workflow gate not unlocking?**
```
❑ All 3 chapters exist in proposal_sections?
❑ All 3 chapters have status = 'complete' (not 'incomplete')?
❑ isInitialProposalReady() returns true?
❑ UI checking the right flag?
```

---

## Performance Notes

```
Generation latency: 30–120 seconds (depends on chapter size, LLM speed)
  → Can be improved with streaming responses
  → Can be moved to background jobs for true async

Reference lookup: 2–5 seconds (Crossref API + local processing)
  → Cached in reference_lookup; re-fetch only on user request

Export generation: 10–30 seconds (markdown → DOCX conversion)
  → No streaming yet; could be backgrounded

Database queries: <100ms per query (with proper indexing)
  → Ensure proposal_sections has index on (project_id, chapter_key)
  → Ensure proposals has index on (user_id, updated_at)
```

---

## Useful Commands

```bash
# Run locally
npm run dev

# Test single endpoint
curl -X POST http://localhost:3000/api/proposals/[id]/generate \
  -H "Authorization: Bearer [token]" \
  -H "Content-Type: application/json" \
  -d '{"chapterKey":"chapter_1","sectionKey":"chapter_1","promptText":"...","creditsToSpend":50}'

# Check database (Supabase CLI)
supabase db list

# View logs
npm run dev 2>&1 | grep ERROR

# TypeScript check
npx tsc --noEmit

# Lint
npx eslint src/
```

---

## Links to Detailed Docs

- **Full context**: `PROJECT_PROPOSAL_CONTEXT.md` (database, routes, files)
- **Architecture diagrams**: `PROPOSAL_ARCHITECTURE_DIAGRAM.md` (flows, data paths)
- **Briefing for Guidance Model**: `GUIDANCE_MODEL_BRIEFING.md` (recommendations)
- **Summary**: `STUDY_SESSION_SUMMARY.md` (overview, next steps)

---

**Last Updated**: 2026-08-14  
**For questions**: Check the full docs above, or review `base_spec.json` for proposal structure questions.

