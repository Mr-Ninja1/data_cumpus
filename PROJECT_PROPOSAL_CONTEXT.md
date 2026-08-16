# DataCampus Project Proposal System — Context & Current State

**Date**: 2026-08-14  
**Purpose**: Provide comprehensive context for enhancing project proposal generation features

---

## 1. WORKSPACE OVERVIEW

### Project Name
**DataCampus** — A YouTube-style campus resource hub that doubles as a smart academic workspace with AI-powered tools.

### Tech Stack
- **Frontend**: Next.js 14+, React, TypeScript, Tailwind CSS
- **Backend**: Next.js API Routes + Supabase (PostgreSQL)
- **AI Providers**: Claude (Anthropic), Gemini (Google) — both supported
- **Database**: Supabase PostgreSQL with custom schemas
- **File Storage**: Supabase Storage
- **Auth**: Supabase Auth (Google OAuth + email/password support planned)

### Project Structure
```
datacampus/
├── src/
│   ├── app/
│   │   ├── admin/
│   │   │   └── proposals/assets/page.tsx          [Admin setup UI]
│   │   ├── workspace/
│   │   │   └── proposals/[id]/page.tsx             [Student workspace]
│   │   └── api/
│   │       ├── proposals/                          [Proposal CRUD routes]
│   │       ├── admin/proposal-templates/           [Template management]
│   │       └── [id]/ routes like:
│   │           ├── generate/route.ts               [Main generation]
│   │           ├── ask/route.ts                    [Chat messaging]
│   │           ├── references/suggest/route.ts    [Auto-reference lookup]
│   │           ├── edit/route.ts                   [Revision logic]
│   │           ├── export/route.ts                 [Export as DOCX/PDF]
│   │           ├── upgrade-stage/route.ts          [Progress gate]
│   │           └── autopilot/route.ts              [Auto-progression]
│   ├── components/
│   │   ├── ProposalWorkspaceShell.tsx              [Main UI component]
│   │   └── ProposalCoverPagePreview.tsx            [Live cover preview]
│   └── utils/
│       ├── proposalSpec.ts                         [Chapter spec parsing]
│       ├── proposalTools.ts                        [Helpers: prompts, parsing]
│       ├── proposalFlow.ts                         [Workflow state logic]
│       ├── proposalDocx.ts                         [Export formatting]
│       ├── referenceDiscovery.ts                   [Reference lookup]
│       ├── projectTitle.ts                         [Title refinement]
│       └── proposalStandards.ts                    [Default standards]
├── public/                                         [Static assets]
└── scripts/
    └── process-jobs.js                             [Background job worker]
```

---

## 2. PROJECT PROPOSAL FEATURE — WHAT EXISTS NOW

### 2.1 Core Workflow (Student Side)

#### Entry Point
- **Route**: `/workspace/proposals` → "New Proposal" button
- **Process**:
  1. Student enters **project title**
  2. System **auto-refines** title (using `projectTitle.ts`) — removes noise, standardizes language
  3. Creates project with default metadata:
     - `stage`: `initial_proposal` (3-chapter requirement)
     - `workflow_mode`: `automated` or `guided` (instructor choice)
     - `doc_type`: `project_proposal`
  4. Project **auto-starts** with:
     - Cover page generation (if auto mode)
     - Reference discovery from title
     - Chapters populated with empty sections

#### Main Interface
- **Route**: `/workspace/proposals/[id]`
- **Component**: `ProposalWorkspaceShell.tsx`
- **Key features**:
  - **Left sidebar**: Chapter navigator with status indicators (pending → generating → complete)
  - **Main editor**: Live markdown editor + AI chat
  - **Right panel**: References sidebar + live cover page preview
  - **Bottom actions**: Save, Export, Import references
  - **Credit system**: Each generation costs credits; wallet topup available

#### Chapter Generation
- **Stages**: `initial_proposal` (3 chapters) or `full_project` (6 chapters)
- **Initial Proposal chapters**:
  - **Chapter 1**: Introduction (1.1–1.9, including conceptual framework)
  - **Chapter 2**: Literature Review (2.1–2.5, with theme-based synthesis)
  - **Chapter 3**: Research Methodology (3.1–3.4)
  - **Front matter**: Cover page, table of contents
  - **Back matter**: References

- **Full Project chapters** (unlock after initial approved):
  - Chapters 4, 5, 6: System Design, Results, Conclusion
  - Additional diagrams, appendices

### 2.2 AI Generation Flow

#### API Endpoint: `/api/proposals/[id]/generate`
**Input**:
```typescript
{
  sectionKey: string          // e.g., "cover_page"
  chapterKey: string          // e.g., "chapter_1" 
  chapterTitle: string        // e.g., "Introduction"
  stage: "initial_proposal" | "full_project"
  promptText: string          // User's request
  creditsToSpend: number
  attachments?: AttachmentRecord[]
  references?: ProposalReference[]
}
```

**Process**:
1. **Authenticate** user via Supabase session
2. **Load spec** from `base_spec.json`:
   - Matches `chapterKey` to chapter definition
   - Extracts section requirements, guidance, diagrams needed
3. **Build rich prompt** including:
   - Chapter spec (all required sections + guidance)
   - Auto-matched templates (by school, department, doc type)
   - Existing content (if continuing chapter)
   - References (filtered for relevance)
4. **Call LLM** (Claude or Gemini based on user preference)
5. **Parse response** into structured markdown
6. **Save to DB**: Insert into `proposal_sections` table
7. **Update metadata**: Mark chapter as `generating` → `complete`
8. **Deduct credits**: Log transaction

**Key smart features**:
- ✅ **Template matching**: Auto-selects 3-5 best-match templates based on metadata scoring
- ✅ **Reference filtering**: Intelligently includes only 2-3 most-relevant references per section (not all)
- ✅ **Targeted continuation**: If user edits and asks for more, system only regenerates missing sections (not the whole chapter)
- ✅ **Section parsing**: Extracts from response using chapter spec structure; ensures section ordering

### 2.3 References Discovery

#### API Endpoint: `/api/proposals/[id]/references/suggest`
**Trigger**: Auto-called on project creation with title

**Process** (in `referenceDiscovery.ts`):
1. **Crossref API call** with project title as query
2. **Score results** by title overlap + citation count
3. **Deduplicate** and limit to top 10 results
4. **Return** with lookup metadata (status, timestamp, source)

**Features**:
- ✅ Smart dedup of self-citations and duplicates
- ✅ Filters out low-quality or irrelevant results
- ✅ Auto-called on project create; manual refresh available
- ✅ Caches results in `reference_lookup` table (avoids re-fetching)

### 2.4 Export & Formatting

#### API Endpoint: `/api/proposals/[id]/export`
**Formats**:
- DOCX (with styling, logo, page breaks, Table of Contents)
- HTML (for preview)

**Features**:
- ✅ **Cover page**: Includes school logo, student name, student ID, project title
- ✅ **Dynamic TOC**: Built from actual chapter headings (not hardcoded)
- ✅ **Citation formatting**: IEEE style (`[1]`, `[2]`) with full references
- ✅ **Diagram placeholders**: Sections marked with `[DIAGRAM: conceptual_framework]` inline
- ✅ **Progress notes**: Shows which diagrams still need hand-creation

### 2.5 Admin Setup & Configuration

#### Route: `/admin/proposals/assets`
**Capabilities**:
- ✅ **School branding**: Upload logo, set school name/short name
- ✅ **Proposal spec management**: 
  - Import/export spec JSON
  - Load `base_spec.json` directly
  - Edit and save custom specs
- ✅ **Template library**:
  - Upload documents as templates
  - Auto-index with embeddings (for semantic search)
  - Assign to school, department, document type, role
- ✅ **Chunk-based retrieval**: Templates split into small text chunks for context matching

---

## 3. KEY DATA MODELS

### Tables (Supabase)

#### `projects` (Project Headers)
```typescript
{
  id: string                              // UUID
  user_id: string                         // Student
  title: string                           // Original student input
  department: string
  supervisor: string | null
  academic_year: string
  current_step: "chapter_1" | "chapter_2" | ...
  status: "draft" | "submitted" | "approved"
  metadata: {
    workflow_mode: "automated" | "guided"
    doc_type: "project_proposal"
    original_title: string                // Pre-refinement
    title_refined: string                 // Post-refinement
    chapters: ChapterEntry[]              // Tracks status of each chapter
    stage: "initial_proposal" | "full_project"
    workflow: {
      mode: "automated" | "guided"
      status: "idle" | "generating" | "paused"
      current_chapter_key: string
      next_chapter_key: string
      completed_chapter_keys: string[]
      chapter_queue: string[]             // For autopilot
      last_action: string
      updated_at: timestamp
    }
  }
}
```

#### `proposal_sections` (Chapter Content)
```typescript
{
  id: string
  project_id: string
  section_key: string                    // "chapter_1", "cover_page", etc.
  title: string
  content_md: string                     // Full markdown
  status: "pending" | "generating" | "complete" | "incomplete"
  updated_at: timestamp
}
```

#### `proposal_references` (Auto-discovered + Manual)
```typescript
{
  id: string
  project_id: string
  title: string
  author: string
  year: number
  source: string                         // "crossref", "manual", etc.
  citation_key: string                   // For citation callouts
  url: string | null
  journal: string | null
  publisher: string | null
  doi: string | null
}
```

#### `reference_lookup` (Caching)
```typescript
{
  project_id: string
  status: "success" | "partial" | "failed"
  message: string                        // "Found 8 results"
  searched_at: timestamp
  references: ProposalReference[]        // Serialized
  source: "crossref" | "manual"
}
```

#### `user_wallets` (Credit System)
```typescript
{
  user_id: string
  balance_credits: number
  updated_at: timestamp
}
```

#### `wallet_transactions` (Audit Trail)
```typescript
{
  user_id: string
  kind: "generation" | "topup"
  credits_delta: number
  cash_amount: number | null
  currency: string
  status: "pending" | "complete" | "failed"
  metadata: { ... }
}
```

#### `proposal_templates` (Admin Library)
```typescript
{
  id: string
  user_id: string                       // Admin who uploaded
  title: string                         // Template name
  description: string
  file_path: string                     // In Supabase Storage
  metadata: {
    school: string
    doc_type: string
    role: string                        // student, lecturer, admin
  }
  approved: boolean
  is_public: boolean
}
```

#### `template_chunks` (For Semantic Search)
```typescript
{
  template_id: string
  chunk_index: number
  chunk_text: string
  embedding: vector                     // pgvector
}
```

#### `document_specs` (Proposal Structure Definitions)
```typescript
{
  id: string
  key: string                           // "zut_it_se"
  title: string
  description: string
  spec_md: string                       // Markdown version
  spec_json: Record<string, any>        // JSON structure (base_spec.json)
  approved: boolean
  is_public: boolean
}
```

---

## 4. BASE SPEC (`base_spec.json`) — THE BACKBONE

**Location**: `C:\Users\Administrator\data_cumpus\base_spec.json`

**Purpose**: Single source of truth for project proposal structure at ZUT ZICTC

**Key sections**:
```json
{
  "doc_type": "project_proposal",
  "program_scope": "ZICTC College — IT/Software Engineering",
  "stages": {
    "initial_proposal": {
      "chapters": [1, 2, 3],
      "front_matter": ["cover_page", "table_of_contents"],
      "back_matter": ["references"],
      "required_diagrams": ["conceptual_framework"]
    },
    "full_project": {
      "chapters": [1, 2, 3, 4, 5, 6],
      "required_diagrams": [7 UML diagram types]
    }
  },
  "citation_style": "numbered_bracket [3], [2]",
  "chapters": [
    {
      "chapter": 1,
      "title": "Introduction",
      "sections": [
        { "number": "1.1", "title": "Background of the Study", "description": "..." },
        { "number": "1.2", "title": "Problem Statement", "description": "..." },
        // ... 1.3–1.9
      ]
    },
    // Chapter 2: Literature Review (with dynamic subsections from references)
    // Chapter 3: Research Methodology
  ]
}
```

**What makes it special**:
- ✅ Extracted from real ZUT examples (not generic guides)
- ✅ Includes **correction notes** where real proposals differ from the generic guide
- ✅ Specifies **subsection generation rules** (e.g., Ch. 2.3 should have `[theme] — [citation]` format)
- ✅ Marks fields as **dynamic** (e.g., 1.7 Conceptual Framework has subsections derived from project title/objectives)
- ✅ Confirms **citation style** is IEEE numbered brackets, not APA author-year

---

## 5. CURRENT FEATURES CHECKLIST

### What's Fully Wired ✅

1. **Project Creation & Title Refinement**
   - Auto-clean student input (remove duplicates, typos, standardize)
   - Easy undo to revert to original

2. **Auto-Reference Discovery**
   - Crossref API integration
   - Intelligent scoring + dedup
   - Caches results (no re-fetching)

3. **Chapter Generation**
   - Template matching (metadata-based semantic scoring)
   - Multi-provider LLM support (Claude, Gemini)
   - Per-section credit costs
   - Targeted continuation (fill missing sections without rewriting)

4. **Proposal Metadata Tracking**
   - Workflow state (idle, generating, paused)
   - Chapter completion tracking
   - Locked progression gate (3-chapter proposal must be "complete" before unlocking chapters 4–6)

5. **Live Cover Page Preview**
   - Shows school logo, student name, student ID
   - Updates as user enters info
   - Matches export format

6. **Export (DOCX + HTML)**
   - IEEE-style citations
   - Dynamic table of contents
   - Diagram placeholders
   - Styled for submission

7. **Reference Management**
   - Manual add/edit
   - Auto-discovery
   - Save to project
   - Filtered citation inclusion (smart, not exhaustive)

8. **Admin Setup Console**
   - Logo upload & branding
   - Template library management
   - Spec import/export
   - Chunk-based template indexing

### What's Partial or Needs Enhancement [~]

1. **Autopilot Mode**
   - Route exists (`/autopilot`)
   - Logic: queue chapters, auto-generate sequentially
   - **Gap**: No background job system — only works while browser open
   - **Potential**: Could integrate with `process-jobs.js` worker for true background execution

2. **Edit/Revise Flow**
   - Route exists (`/edit`)
   - **Gap**: User must specify exactly what to change — no smart "re-read what's there, keep good parts, fix the rest" mode
   - **Potential**: Could add intent classification (keep/remove/enhance per section)

3. **Workflow Progression**
   - Gate logic exists (can't unlock chapter 4+ until 1–3 are complete)
   - **Gap**: No intelligent bundling (should offer "auto-fill all remaining sections" in a chapter)
   - **Potential**: Add "Quick fill" button that asks model for all missing sections in one call

4. **UI/UX Polish**
   - Workspace layout works but could be more responsive
   - Edit mode vs. view mode could be clearer
   - Progress indication could be more visual

### What's Missing [ ]

1. **Background Job System**
   - `process-jobs.js` exists but not wired to proposal generation
   - Would enable true autopilot (continue even if browser closes)
   - Could send notifications when done

2. **Revision Tracking**
   - No version history (can't see what changed, when, why)
   - Could be useful for teacher feedback

3. **Plagiarism Awareness**
   - Export has no originality check or citation audit
   - Could flag if text matches any reference too closely

4. **Customizable Specs per School**
   - Currently `base_spec.json` is global
   - Should allow per-school variations (e.g., different required chapters)
   - Admin UI exists but could be smoother

5. **Multi-Stage Completion Flow**
   - Initial → Full can unlock, but no "submit for feedback" or "ready for review" state
   - Could benefit from formal submission + teacher feedback loop

---

## 6. KEY FILES & THEIR ROLES

| File | Purpose | Key Functions |
|------|---------|---|
| `base_spec.json` | Master proposal structure definition | JSON chapters, sections, requirements |
| `proposalSpec.ts` | Parse & extract spec by chapter key | `parseStructuredSpec()`, `extractMarkdownSectionForChapter()` |
| `proposalFlow.ts` | Workflow state & progression logic | `isInitialProposalReady()`, chapter queue management |
| `proposalTools.ts` | Prompt building & response parsing | `buildChapterGenerationGuidance()`, `parseRequiredInputs()` |
| `proposalStandards.ts` | Default standards + school guardrails | Fallback when no custom spec available |
| `referenceDiscovery.ts` | Auto-lookup references from Crossref | Dedup, score, return top results |
| `projectTitle.ts` | Title refinement (cleanup, standardize) | Reusable for any project type |
| `proposalDocx.ts` | Export formatting & DOCX generation | IEEE citation, TOC, logo embedding |
| `ProposalWorkspaceShell.tsx` | Main UI component | State management, chat interface, navigation |
| `ProposalCoverPagePreview.tsx` | Live cover page rendering | Server-side branding fetch, layout |
| `generate/route.ts` | Main LLM generation endpoint | Spec loading, prompt building, API call, parsing |
| `ask/route.ts` | Chat interaction endpoint | Intent classification, context retrieval |
| `edit/route.ts` | Revision endpoint | Diff-based regeneration (partial) |
| `export/route.ts` | DOCX/HTML export endpoint | Formatting, citation, TOC building |
| `upgrade-stage/route.ts` | Unlock full project (gate enforcement) | Checks completion, transitions metadata |
| `references/suggest/route.ts` | Reference discovery endpoint | Crossref call, caching |

---

## 7. IMPORTANT ARCHITECTURAL NOTES

### 1. **Spec Resolution Pattern**
Every time a chapter is generated:
1. Take `chapterKey` (e.g., `"chapter_1"`)
2. Load `base_spec.json` (or custom spec from DB)
3. Extract chapter definition (sections 1.1–1.9, guidance, etc.)
4. **Inject into prompt** before LLM call
5. LLM response gets **parsed by section number** to validate structure

**Why this matters**: Without this, the model has no guardrails and might miss required sections or reorder them.

### 2. **Credit System**
- Each chapter generation costs ~10–50 credits (depends on length/complexity)
- User must have sufficient balance before generation starts
- Logged to `wallet_transactions` for audit trail
- Admin can grant free credits or adjust pricing

### 3. **Template Matching**
Happens **before** LLM call:
1. Score templates by: school match, department match, doc type match, role match
2. Retrieve top 3–5 matches
3. Extract chunks from best matches
4. **Inject as context** in system prompt (not as reference citations — as structural examples)

### 4. **Reference Filtering**
- Auto-discovery finds 8–10 candidates
- **Generation** only includes 2–3 most-relevant per section (to avoid overwhelming the model)
- User can manually add more before generation

### 5. **Workflow State Machine**
```
CREATE → (auto-generate cover if auto mode)
  ↓
CHAPTER 1–3 GENERATION (user can ask, or autopilot runs)
  ↓
IS_INITIAL_PROPOSAL_READY? (all three chapters complete, not just "complete" but fully fleshed)
  → YES: Unlock "Continue to Full Project" button
  → NO: "Keep working on Chapter X" message
  ↓
CHAPTERS 4–6 GENERATION (only if unlocked)
  ↓
READY TO EXPORT (all 6 chapters + front/back matter)
```

---

## 8. WHAT TO REPORT TO GUIDANCE MODEL

**Use this structure when asking for enhancement recommendations**:

### Current Strengths
- ✅ Core generation pipeline is solid (spec → template matching → LLM → parsing → save)
- ✅ Reference discovery works automatically on project creation
- ✅ Proposal structure closely matches real ZUT examples (via `base_spec.json`)
- ✅ Cover page preview live (matches export)
- ✅ Export format (DOCX) is submission-ready
- ✅ Multi-provider LLM support (Claude, Gemini)
- ✅ Credit system prevents abuse
- ✅ Template library + semantic search for context matching

### Partial/Incomplete
- [~] **Autopilot**: Route exists but requires browser-open; no background jobs
- [~] **Edit/Revision**: Can change content but no smart "keep good, fix bad" mode
- [~] **Progression flow**: Gate works but no multi-step submission/feedback loop
- [~] **UI polish**: Functional but could be more intuitive for students
- [~] **Customization per school**: Admin can upload specs, but no per-school variation yet

### Known Gaps
- [ ] **Background job system**: `process-jobs.js` exists but unused; would unlock true autopilot
- [ ] **Revision history**: No version tracking
- [ ] **Plagiarism tools**: No similarity check or citation audit
- [ ] **Formal submission workflow**: No "submit for review" → "teacher feedback" → "revise" loop
- [ ] **Multi-school support**: Currently assumes single school; scaling to multiple schools needs work

### Questions for Guidance Model
1. Should we build a proper background job system (AWS SQS-style) for autopilot?
2. Should we add teacher feedback loop (submit → review → revise cycle)?
3. Should we implement plagiarism/similarity checking for due diligence?
4. Should we support multi-school scenarios from the start, or optimize for single-school first?
5. Should revision history be stored, or just allow live editing?

---

## 9. QUICK START FOR ENHANCEMENT

If you're adding a new feature, here's the mental model:

1. **Identify the chapter/section** it affects (use `base_spec.json` keys)
2. **Update spec if needed** (edit `base_spec.json`, test with `proposalSpec.ts` parser)
3. **Add any new metadata** (e.g., diagram type, required fields) to `proposal_sections` or `projects.metadata`
4. **Build prompt fragment** (use `proposalTools.ts` helpers to extract spec, format guidance)
5. **Inject into generation** (modify `generate/route.ts` to pass new context to LLM)
6. **Test parsing** (ensure model response gets extracted correctly by section)
7. **Validate export** (ensure new content appears correctly in DOCX/HTML)
8. **Update UI** if needed (`ProposalWorkspaceShell.tsx` for chapter nav; `ProposalCoverPagePreview.tsx` for preview)

---

## 10. REFERENCES & LINKS

- **Base spec**: `C:\Users\Administrator\data_cumpus\base_spec.json`
- **Workflow transcript**: `C:\Users\Administrator\data_cumpus\AI Project Proposal Workspace Workflow.md` (very detailed, includes all recent changes)
- **Feature checklist**: `C:\Users\Administrator\data_cumpus\datacampus\FEATURE_CHECKLIST.md`
- **Dev plan**: `C:\Users\Administrator\data_cumpus\datacampus\DEVELOPMENT_PLAN.md`
- **Notes on idea**: `C:\Users\Administrator\data_cumpus\idea.md` (notes on spec resolution)

---

**END OF CONTEXT DOCUMENT**

This document is ready to share with your Guidance Model. It provides:
- ✅ Clear overview of what exists
- ✅ Detailed description of current features (with code references)
- ✅ Known gaps and partial features
- ✅ Architectural decisions and why they matter
- ✅ Question template for asking for guidance

Next step: Show this to your Guidance Model and ask which features to enhance first!
