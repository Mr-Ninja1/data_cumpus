# DataCampus Project Proposal System — Architecture Diagram

## High-Level Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         STUDENT WORKFLOW                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  1. Enter Title                                                             │
│         ↓                                                                    │
│  2. Auto-Refine Title (projectTitle.ts)                                    │
│         ↓                                                                    │
│  3. Create Project (initial_proposal stage)                                │
│         ↓                                                                    │
│  ┌──────────────────────────────────────────────────────────────┐           │
│  │ 4. Reference Discovery (auto-called)                         │           │
│  │    - Crossref API lookup from title                          │           │
│  │    - Score & deduplicate results                             │           │
│  │    - Cache in reference_lookup table                         │           │
│  └──────────────────────────────────────────────────────────────┘           │
│         ↓                                                                    │
│  ┌──────────────────────────────────────────────────────────────┐           │
│  │ 5. Interactive Generation Loop                              │           │
│  │    ┌─────────────────────────────────────────────────────┐  │           │
│  │    │ User: "Generate Chapter 1"  OR                      │  │           │
│  │    │ User: "Tell me more about X" (chat mode)           │  │           │
│  │    └─────────────────────────────────────────────────────┘  │           │
│  │              ↓                                                │           │
│  │    ┌─────────────────────────────────────────────────────┐  │           │
│  │    │ Intent Classification (classify-intent/route.ts)   │  │           │
│  │    │ → "generate_chapter" | "chat" | "refine_section"  │  │           │
│  │    └─────────────────────────────────────────────────────┘  │           │
│  │              ↓                                                │           │
│  │    FOR GENERATION:                                          │           │
│  │    ┌─────────────────────────────────────────────────────┐  │           │
│  │    │ Generate Handler (generate/route.ts)               │  │           │
│  │    │ 1. Load base_spec.json                              │  │           │
│  │    │ 2. Extract chapter definition by key                │  │           │
│  │    │ 3. Load templates (semantic search)                 │  │           │
│  │    │ 4. Build rich prompt with:                          │  │           │
│  │    │    - Chapter spec (all required sections)           │  │           │
│  │    │    - Top 3-5 template chunks (as examples)          │  │           │
│  │    │    - Project metadata (title, dept, supervisor)     │  │           │
│  │    │    - Filtered references (2-3 most relevant)        │  │           │
│  │    │ 5. Call LLM (Claude or Gemini)                      │  │           │
│  │    │ 6. Parse response by section number                 │  │           │
│  │    │ 7. Save to proposal_sections table                  │  │           │
│  │    │ 8. Deduct credits from wallet                       │  │           │
│  │    │ 9. Update project metadata (status, workflow)       │  │           │
│  │    └─────────────────────────────────────────────────────┘  │           │
│  │              ↓                                                │           │
│  │    FOR CHAT (ask/route.ts):                                 │           │
│  │    ┌─────────────────────────────────────────────────────┐  │           │
│  │    │ Chat Handler                                        │  │           │
│  │    │ 1. Retrieve current chapter context                 │  │           │
│  │    │ 2. Append user message to history                   │  │           │
│  │    │ 3. Call LLM with full conversation                 │  │           │
│  │    │ 4. Return response + suggest next step              │  │           │
│  │    └─────────────────────────────────────────────────────┘  │           │
│  │                                                               │           │
│  │    EDITING MODE (edit/route.ts):                            │           │
│  │    ┌─────────────────────────────────────────────────────┐  │           │
│  │    │ Edit Handler                                        │  │           │
│  │    │ 1. Show user current section content                │  │           │
│  │    │ 2. Get revision request (keep/remove/enhance)       │  │           │
│  │    │ 3. Regenerate only missing parts                    │  │           │
│  │    │ 4. Merge with existing (don't overwrite good)       │  │           │
│  │    └─────────────────────────────────────────────────────┘  │           │
│  └──────────────────────────────────────────────────────────────┘           │
│         ↓ (repeat for all 3 chapters)                                       │
│                                                                              │
│  6. Check: Is Initial Proposal Ready?                                      │
│         (proposalFlow.ts: isInitialProposalReady)                          │
│         - All 3 chapters exist? ✓                                          │
│         - No "incomplete" chapters? ✓                                       │
│         - Yes? → Unlock "Upgrade to Full Project" button                   │
│         - No? → "Keep working on Chapter X" message                        │
│         ↓                                                                   │
│  ┌──────────────────────────────────────────────────────────────┐          │
│  │ 7. OPTIONAL: Upgrade to Full Project (upgrade-stage/route)  │          │
│  │    - Create chapters 4, 5, 6                                 │          │
│  │    - Change metadata.stage to "full_project"                 │          │
│  │    - Return new workflow state                               │          │
│  │    (User repeats step 5 for chapters 4–6)                    │          │
│  └──────────────────────────────────────────────────────────────┘          │
│         ↓                                                                   │
│  8. Manual Add References (optional)                                       │
│         - User can paste/search references                                 │
│         - Saved to proposal_references table                               │
│         - Available for next generation                                    │
│         ↓                                                                   │
│  9. Live Cover Page Preview                                               │
│         - Shows: school logo, title, student name, student ID              │
│         - Updates as user enters metadata                                  │
│         - Component: ProposalCoverPagePreview.tsx                         │
│         ↓                                                                   │
│  10. Export to DOCX / HTML                                                │
│         (export/route.ts)                                                  │
│         - Fetch all sections from DB                                       │
│         - Build markdown (with TOC, citation style)                        │
│         - Convert to DOCX with styling                                     │
│         - Download file                                                    │
│         - Save export record to DB (metadata: stage, chapter count, etc.)  │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Database Schema Map

```
┌──────────────────┐
│   user_wallets   │
├──────────────────┤
│ user_id (PK)     │──┐
│ balance_credits  │  │
│ updated_at       │  │
└──────────────────┘  │
                      │
                      │ user_id (FK)
                      ↓
              ┌──────────────────────┐
              │ wallet_transactions  │
              ├──────────────────────┤
              │ id                   │
              │ user_id (FK)         │
              │ kind (generation...) │
              │ credits_delta        │
              │ status               │
              │ metadata             │
              └──────────────────────┘


┌──────────────────┐
│   profiles       │
├──────────────────┤
│ id (PK) [user]   │
│ display_name     │
│ role             │ (student, admin, ...)
│ metadata         │
└──────────────────┘
  │
  │ user_id (FK)
  ↓
┌──────────────────────┐
│   projects           │
├──────────────────────┤
│ id (PK)              │
│ user_id (FK) ────────→ profiles
│ title                │
│ department           │
│ supervisor           │
│ academic_year        │
│ current_step         │ (chapter_1, chapter_2, ...)
│ status               │ (draft, submitted, approved)
│ metadata ──────────┐ │ (workflow, chapters[], stage, ...)
│ updated_at         │ │
└──────────────────────┘ │
  │                      │
  │ project_id (FK)      └─→ Workflow state:
  ↓                           - mode: "automated" | "guided"
┌──────────────────────┐     - status: "idle" | "generating"
│ proposal_sections    │     - current_chapter_key
├──────────────────────┤     - next_chapter_key
│ id (PK)              │     - completed_chapter_keys[]
│ project_id (FK)      │     - chapter_queue[]
│ section_key          │     - last_action
│ title                │     - updated_at
│ content_md           │
│ status               │  (pending, generating, complete, incomplete)
│ updated_at           │
└──────────────────────┘
  │
  │ (per-chapter content)
  │
  └─→ Chapters 1–6 sections exist here
  │   - Chapter 1: 1.1–1.9 (each section as separate row or merged)
  │   - Chapter 2: 2.1–2.5
  │   - Chapter 3: 3.1–3.4
  │   - Chapters 4–6: (only if stage="full_project")


┌──────────────────────┐
│ proposal_references  │
├──────────────────────┤
│ id (PK)              │
│ project_id (FK) ─────→ projects
│ title                │
│ author               │
│ year                 │
│ source               │ (crossref, manual)
│ citation_key         │ ([1], [2], ...)
│ url                  │
│ journal              │
│ publisher            │
│ doi                  │
└──────────────────────┘
  │
  │ (discovered + manual references)
  │


┌──────────────────────┐
│  reference_lookup    │
├──────────────────────┤
│ project_id (PK) ─────→ projects
│ status               │ (success, partial, failed)
│ message              │
│ searched_at          │
│ references (array)   │ (serialized from proposal_references)
│ source               │ (crossref)
└──────────────────────┘
  │
  │ (caches auto-discovery results)
  │


┌──────────────────────────┐
│  proposal_templates      │
├──────────────────────────┤
│ id (PK)                  │
│ user_id (FK) ────────────→ profiles (admin)
│ title                    │
│ description              │
│ file_path                │ (Supabase Storage)
│ metadata ────────┐       │ (school, doc_type, role)
│ approved         │       │
│ is_public        │       │
└──────────────────────────┘ │
  │                          │
  │ template_id (FK)         └─→ Matching scoring:
  ↓                              - school: "ZUT" / "other"
┌──────────────────────────┐    - doc_type: "project_proposal"
│  template_chunks         │    - role: "student" / "lecturer"
├──────────────────────────┤    - combined score: 0–100
│ id (PK)                  │
│ template_id (FK)         │
│ chunk_index              │
│ chunk_text               │
│ embedding (pgvector)     │ (for semantic search)
└──────────────────────────┘
  │
  │ (injected into prompt as examples)
  │


┌──────────────────────────┐
│   document_specs         │
├──────────────────────────┤
│ id (PK)                  │
│ key                      │ (zut_it_se, generic, ...)
│ title                    │
│ description              │
│ spec_md                  │ (readable spec)
│ spec_json ───────────────→ base_spec.json structure
│ approved                 │
│ is_public                │
│ updated_at               │
└──────────────────────────┘
  │
  │ (selected per project)
  │ (drives chapter generation)
  │


┌──────────────────────────┐
│ proposal_exports         │
├──────────────────────────┤
│ id (PK)                  │
│ project_id (FK) ─────────→ projects
│ format                   │ (docx, html, pdf)
│ file_path                │
│ status                   │ (success, failed)
│ metadata ────────┐       │ (stage, chapter_count, ref_count)
│ created_at       │       │
└──────────────────────────┘ │
                             │ (audit trail of exports)
                             │
```

---

## API Endpoint Map

```
POST /api/proposals
├─ Create new project with title
├─ Input: { title, department, stage }
├─ Output: { project with metadata }
└─ Triggers: Auto title refinement, auto reference discovery


GET /api/proposals
├─ List all projects for logged-in user
└─ Output: [ { project 1 }, { project 2 }, ... ]


GET /api/proposals/[id]
├─ Fetch single project + all sections
├─ Output: { project, sections[], references[] }
└─ Hydrates workspace UI


PATCH /api/proposals/[id]
├─ Update project metadata (title, supervisor, etc.)
├─ Input: { title?, department?, supervisor?, metadata? }
└─ Output: { updated project }


POST /api/proposals/[id]/generate
├─ Main generation endpoint
├─ Input: { chapterKey, sectionKey, promptText, creditsToSpend, references[] }
├─ Flow:
│  1. Load base_spec.json
│  2. Extract chapter definition
│  3. Load templates (semantic match)
│  4. Build rich prompt
│  5. Call LLM
│  6. Parse response by section
│  7. Save sections
│  8. Deduct credits
│  9. Update workflow metadata
└─ Output: { content_md, chapters_updated[], new_status, remaining_credits }


POST /api/proposals/[id]/ask
├─ Chat interaction (for refinement within a chapter)
├─ Input: { message, chapterKey, attachments[] }
├─ Flow:
│  1. Classify intent (generate | refine | chat)
│  2. Retrieve current section context
│  3. Call LLM
│  4. Return response + next_step hint
└─ Output: { response, suggested_next_action }


POST /api/proposals/[id]/edit
├─ Revision endpoint (smart partial regeneration)
├─ Input: { sectionKey, revisionRequest }
├─ Flow:
│  1. Load current section
│  2. Identify what to keep vs. regenerate
│  3. Call LLM with "preserve this part, fix that part" instruction
│  4. Merge new with old
└─ Output: { updated_section_md, merge_status }


POST /api/proposals/[id]/references/suggest
├─ Auto-discover references
├─ Input: { query (or empty → uses project.title) }
├─ Flow:
│  1. Check if cached in reference_lookup
│  2. If not: call Crossref API
│  3. Score & deduplicate
│  4. Save cache
│  5. Return references
└─ Output: { references[], lookup_metadata }


POST /api/proposals/[id]/references
├─ Manual reference add/update
├─ Input: { references[] }
└─ Output: { saved_references[] }


POST /api/proposals/[id]/export
├─ Export to DOCX or HTML
├─ Input: { format: "docx" | "html" }
├─ Flow:
│  1. Fetch all sections
│  2. Build markdown + TOC
│  3. Apply citation style
│  4. Convert to format
│  5. Save export record
│  6. Return downloadable blob
└─ Output: { file_blob, file_name }


POST /api/proposals/[id]/upgrade-stage
├─ Unlock chapters 4–6 (initial → full project)
├─ Input: (empty)
├─ Flow:
│  1. Check isInitialProposalReady()
│  2. If not ready: error
│  3. If ready: create chapters 4–6, update metadata.stage
│  4. Return updated project
└─ Output: { updated_project, new_stage, unlocked_chapters }


POST /api/proposals/[id]/autopilot
├─ Auto-generate remaining chapters sequentially
├─ Input: { mode: "full_project" | "remaining_chapters" }
├─ Flow:
│  1. Build chapter queue from stage definition
│  2. For each chapter: POST to generate (without user input)
│  3. Wait for response, save, move to next
│  4. Stop when all complete or error
├─ NOTE: Currently browser-dependent; could be moved to background job
└─ Output: { progress: { completed_chapters, current_chapter, total } }


---

GET /api/admin/proposal-templates
├─ List all templates
└─ Output: { templates[], chunk_counts_by_template }


POST /api/admin/proposal-templates
├─ Upload new template
├─ Input: { file, title, description, metadata }
└─ Output: { template_id }


POST /api/admin/proposal-templates/index/route.ts
├─ Index template (split into chunks, compute embeddings)
├─ Input: { template_id }
└─ Output: { chunks_inserted, embedding_status }


POST /api/admin/proposal-templates/generate-embeddings/route.ts
├─ Bulk re-compute embeddings for all chunks
├─ (Useful after model upgrade or recompute strategy change)
└─ Output: { updated_chunks_count, status }


GET/POST /api/workspace/school-branding/route.ts
├─ Fetch school logo + metadata
├─ POST: Update school branding (logo upload, name, etc.)
└─ Output: { school_name, logo_path, metadata }


GET /api/admin/document-specs/route.ts
├─ List all proposal specs (base_spec.json + custom variants)
└─ Output: { specs[] }


---

Web UI Routes:

GET /workspace/proposals
├─ List projects (My Proposals page)
└─ Shows: title, stage, status, last_updated

GET /workspace/proposals/[id]
├─ Main workspace (edit + generate interface)
├─ Component: ProposalWorkspaceShell
└─ Shows: chapters, chat, references, cover preview

GET /admin/proposals/assets
├─ Admin setup console
├─ Allows: logo upload, template management, spec editing
└─ Components: Settings forms, template library UI
```

---

## Data Flow: Generation Request

```
User: "Generate Chapter 1 Introduction"
│
├─ POST /api/proposals/[id]/generate
│  │ { chapterKey: "chapter_1", sectionKey: "chapter_1", promptText: "..." }
│  │
│  ├─ [1] Auth & Validation
│  │   ├─ Verify user owns project
│  │   ├─ Check credit balance (≥ 50 credits)
│  │   └─ Validate project exists
│  │
│  ├─ [2] Load Spec
│  │   ├─ Fetch document_specs where key = project.metadata.spec_key
│  │   │  (or default: base_spec.json)
│  │   │
│  │   └─ Parse spec_json to extract:
│  │       Chapter 1 definition:
│  │       - 1.1 Background of the Study (description: "...")
│  │       - 1.2 Problem Statement
│  │       - ... 1.3–1.9
│  │       - Conceptual Framework (diagram required)
│  │
│  ├─ [3] Load Templates
│  │   ├─ Search for best-match templates:
│  │   │   school_match (project.school = template.metadata.school)
│  │   │   doc_type_match (project_proposal = template.metadata.doc_type)
│  │   │   department_match (optional bonus)
│  │   │
│  │   └─ Score templates 0–100, retrieve top 3–5
│  │       Load their chunks (template_chunks) and extract snippets
│  │
│  ├─ [4] Load References
│  │   ├─ Fetch all proposal_references for project
│  │   ├─ Filter to top 2–3 by relevance (using metadata, keywords)
│  │   └─ Format for citation in prompt
│  │
│  ├─ [5] Build Prompt
│  │   │
│  │   ├─ System Prompt:
│  │   │  "You are an academic proposal writing assistant. Follow these rules:
│  │   │   - Write for Chapter 1: Introduction (1.1–1.9)
│  │   │   - Include all required sections in order
│  │   │   - Use IEEE citation style [1], [2], ...
│  │   │   - Sections:
│  │   │     1.1 Background (3–4 paragraphs, establish context)
│  │   │     1.2 Problem Statement (concise, clear focus)
│  │   │     1.3 Aim and Objectives
│  │   │       1.3.1 Research Aim
│  │   │       1.3.2 Research Objectives
│  │   │     1.4 Research Questions
│  │   │     1.5 Scope and Limitations
│  │   │     1.6 Significance of the Study
│  │   │     1.7 Conceptual Framework (identify 2-4 pillars from objectives)
│  │   │     1.8 Organization of the Report
│  │   │     1.9 Summary
│  │   │   - Include [DIAGRAM: conceptual_framework] placeholder
│  │   │   - Use school-specific guidance where applicable"
│  │   │
│  │   ├─ Context:
│  │   │  "Project Title: [title]
│  │   │   Department: [dept]
│  │   │   Supervisor: [supervisor]
│  │   │   Academic Year: [year]
│  │   │   
│  │   │   Key Problem Area: [extracted from title/description]
│  │   │
│  │   │   Available References:
│  │   │   [1] Smith et al., 2024, "..." — Crossref
│  │   │   [2] Johnson, 2023, "..." — Crossref"
│  │   │
│  │   ├─ Template Examples:
│  │   │  "Example 1 (top-match template, best school/doc_type fit):
│  │   │   1.1 Background: [first 300 chars of example]
│  │   │   1.2 Problem: [first 300 chars of example]
│  │   │   ...
│  │   │
│  │   │   Example 2 (second best):
│  │   │   [...]"
│  │   │
│  │   └─ User Prompt:
│  │      "[promptText from user]
│  │       Generate Chapter 1 Introduction for the project described above.
│  │       Return markdown with clear section headers."
│  │
│  ├─ [6] Call LLM
│  │   ├─ Provider: project.metadata.last_generation_provider || "claude"
│  │   ├─ Model: "claude-3-5-sonnet" or "gemini-2-0"
│  │   ├─ Max tokens: 4000
│  │   └─ Temperature: 0.7
│  │
│  ├─ [7] Parse Response
│  │   │
│  │   └─ Extract section markers from markdown:
│  │       # 1.1 Background of the Study
│  │       [content]
│  │       # 1.2 Problem Statement
│  │       [content]
│  │       ...
│  │       → Store each as separate record with section_key: "chapter_1_section_1_1"
│  │
│  ├─ [8] Save to Database
│  │   │
│  │   └─ INSERT/UPDATE proposal_sections:
│  │       { project_id, section_key: "chapter_1", title: "Introduction",
│  │         content_md: "[full markdown]", status: "complete", updated_at: NOW }
│  │
│  ├─ [9] Deduct Credits
│  │   │
│  │   └─ UPDATE user_wallets
│  │       SET balance_credits = balance_credits - 50
│  │       INSERT wallet_transactions
│  │       { user_id, kind: "generation", credits_delta: -50,
│  │         metadata: { project_id, chapter_key: "chapter_1", ... } }
│  │
│  ├─ [10] Update Workflow Metadata
│  │   │
│  │   └─ UPDATE projects SET metadata = 
│  │       { chapters: [..., { chapter_key: "chapter_1", status: "complete", ... }],
│  │         workflow: { completed_chapter_keys: [..., "chapter_1"],
│  │                     last_action: "generated chapter_1",
│  │                     updated_at: NOW }
│  │
│  └─ [11] Return Response
│     { content_md: "[chapter markdown]",
│       chapters_updated: ["chapter_1"],
│       new_status: "complete",
│       new_workflow_state: { ... },
│       remaining_credits: 1950,
│       next_suggested_action: "Chapter 2 Literature Review" }
│
└─ UI Updates:
   ├─ Show generated content in editor
   ├─ Update chapter 1 status to "complete" (green checkmark)
   ├─ Show remaining credits
   ├─ Suggest next chapter: "Continue to Chapter 2?"
   ├─ Update cover page preview
   └─ Auto-save to local state
```

---

## Summary

This architecture ensures:

1. **Spec-driven generation**: Every chapter knows its exact structure before LLM call
2. **Contextual matching**: Templates + references are injected as examples/context, not overrides
3. **Section-level control**: User can refine individual sections without regenerating the whole chapter
4. **Credit fairness**: Clear cost per action, transparent billing
5. **Modular flow**: Each step (auth → spec load → template match → LLM → parse → save) is independent
6. **Database audit trail**: Every action logged (generations, exports, credit transactions)
7. **Scalable templates**: New schools/formats just add a new spec; no code changes needed

