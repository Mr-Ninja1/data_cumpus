# DataCampus Project Proposal System — Briefing for Guidance Model

**Prepared**: 2026-08-14  
**Purpose**: Request guidance on which features to enhance next

---

## Executive Summary

**DataCampus** is a smart academic workspace where students write AI-assisted project proposals guided by their school's standards.

### Current Status
- ✅ **Core pipeline works**: Student enters title → AI generates chapter → save to DB → export to DOCX
- ✅ **Smart context matching**: Auto-discovered references, template examples, school standards
- ✅ **Multi-provider LLM**: Supports Claude and Gemini
- ✅ **Credit system**: Fair usage with transparent costs
- ✅ **Export quality**: DOCX with proper formatting, citations, logo
- 🟡 **Autopilot incomplete**: Can generate sequentially but requires browser open (no background jobs)
- 🟡 **Revision weak**: Can edit but no smart "keep-good, fix-bad" mode
- ❌ **No submission workflow**: No formal "submit for feedback" → "teacher reviews" → "student revises" loop
- ❌ **No version history**: Can't track changes or see what was edited when

---

## What Exists (Fully Implemented)

### 1. **Project Creation & Auto-Refinement**
- Student enters any title → system auto-cleans (removes typos, noise, standardizes)
- Easy undo to revert to original
- **File**: `projectTitle.ts`

### 2. **Reference Auto-Discovery**
- Crossref API lookup from project title
- Intelligent scoring, deduplication
- Results cached (no re-fetching)
- Called automatically on project creation
- **File**: `referenceDiscovery.ts`

### 3. **Main Generation Engine**
- Takes chapter key + user prompt
- Loads `base_spec.json` (ZUT-specific proposal structure)
- Semantic template matching (school, department, doc type)
- Builds rich prompt with:
  - Chapter spec (all required sections + guidance)
  - Best-matching template examples (3–5)
  - Project metadata
  - Top 2–3 filtered references
- Calls LLM (Claude or Gemini)
- Parses response by section number
- Saves to DB with proper structure
- Deducts credits from wallet
- **File**: `generate/route.ts`

### 4. **Chapter Navigation & Progression Gate**
- 3-chapter "initial proposal" must be complete before unlocking chapters 4–6 ("full project")
- Workflow state tracks: current chapter, completed chapters, next chapter
- Chapters marked as: pending → generating → complete (or incomplete if user abandons)
- **Files**: `proposalFlow.ts`, `upgrade-stage/route.ts`

### 5. **Live Cover Page Preview**
- Shows school logo, student name, student ID, project title
- Updates in real-time as user enters data
- Matches export format exactly
- **File**: `ProposalCoverPagePreview.tsx`

### 6. **Export to DOCX**
- IEEE-style citations `[1], [2], ...`
- Dynamic table of contents (built from actual chapter headings)
- School logo embedded
- Diagram placeholders `[DIAGRAM: conceptual_framework]`
- Submission-ready formatting
- **File**: `proposalDocx.ts`, `export/route.ts`

### 7. **Admin Console**
- Logo upload & school branding
- Template library management (upload, index, chunk)
- Spec import/export (including `base_spec.json`)
- Schema for multi-school support (ready but not fully wired)
- **Route**: `/admin/proposals/assets`

### 8. **Credit System**
- Each generation costs credits (0–50 depending on chapter size)
- Wallet balance tracked per user
- Transactions logged for audit
- Admin can grant credits
- **Tables**: `user_wallets`, `wallet_transactions`

---

## What's Partially Implemented (Needs Work)

### 1. **Autopilot Mode** [~]
- **What exists**: Route `/api/proposals/[id]/autopilot`, logic to queue chapters and generate sequentially
- **Current limitation**: Requires browser to stay open; stops if user closes tab or refreshes
- **Why incomplete**: No background job system (no AWS SQS, no Supabase RLS-safe job queue)
- **What's needed**:
  - Option A: Wire `process-jobs.js` (exists but unused) to Supabase job queue
  - Option B: Use Supabase Edge Functions + PG NOTIFY for async jobs
  - Option C: Deploy separate worker (e.g., Node.js Lambda, railway.app)
- **Impact**: High — students want to start generation and leave the app

### 2. **Edit/Revision Flow** [~]
- **What exists**: Route `/api/proposals/[id]/edit`, logic to load section + regenerate
- **Current limitation**: User must specify exactly what to change; no smart "preserve good parts" mode
- **Why incomplete**: No diff-based revision; just overwrites
- **What's needed**:
  1. Show user current section
  2. Ask: "What should change?" (keep/remove/enhance)
  3. Generate only missing/broken parts
  4. Merge smartly (don't delete user's good writing)
  5. Show user the diff before saving
- **Impact**: Medium-high — students want to iterate without redoing everything

### 3. **UI/UX Polish** [~]
- **What exists**: Functional workspace (chapters sidebar, editor, chat, references panel)
- **Current limitation**: Feels utilitarian; could be more intuitive for students
- **Why incomplete**: No focused UX polish pass; team prioritized backend logic
- **What's needed**:
  1. Clearer visual states (generating / complete / needs work)
  2. Better chapter navigation (drag-to-reorder, collapse/expand)
  3. Word count progress bars
  4. Section completion checkmarks
  5. Mobile responsiveness improvement
  6. Undo/redo for edits
- **Impact**: Low – works, but not delightful

### 4. **Multi-School Support** [~]
- **What exists**: Admin can upload specs per school, DB schema supports it
- **Current limitation**: Single-school assumption in some places (e.g., logo path doesn't namespace by school)
- **Why incomplete**: Would need to verify every school's branding, specs, and scale template library
- **Impact**: Medium – if you're only serving ZUT now, can skip; important for growth later

---

## What's Missing (Not Started)

### 1. **Background Job System for Autopilot** [ ]
- **Why it matters**: Students want to say "finish my proposal" and come back later
- **Effort**: Medium (1–2 weeks with testing)
- **Recommendation**: Start here if autopilot is a priority
- **Options**:
  - Option A: **Supabase job queue** (built-in, easiest)
    ```typescript
    // In generate/route.ts, instead of:
    const response = await model.generate(...);
    // Use:
    const jobId = await queueJob({ projectId, chapterKey, ... });
    // Job runs async, sends notification when done
    ```
  - Option B: **Separate Node.js worker** (more flexible, harder to host)
  - Option C: **AWS Lambda** (auto-scales, costs more)

### 2. **Formal Submission & Feedback Workflow** [ ]
- **What's missing**: 
  - "Submit for Review" button (locks proposal, notifies teacher)
  - Teacher review interface (read-only view, leave comments on sections)
  - "Request Revisions" (mark sections as incomplete, suggest fixes)
  - Student revision + resubmit
- **Why it matters**: Schools need formal workflow (student drafts → teacher approves → student submits)
- **Effort**: Medium (2–3 weeks including UI)
- **Files to create**: 
  - `proposal_submissions` table (submission records)
  - `submission_feedback` table (comments per section)
  - `/api/proposals/[id]/submit` endpoint
  - `/api/proposals/[id]/feedback` endpoint
  - Teacher review UI component

### 3. **Revision History / Version Tracking** [ ]
- **What's missing**: Can't see "what changed when" or revert to old versions
- **Why it matters**: Teachers might ask "show me your original draft"; students might want to undo
- **Effort**: Low–Medium (1 week)
- **Solution**: Store snapshots of each section in `proposal_section_versions` table
  ```typescript
  {
    id, project_id, section_key, content_md, version_number,
    changed_by (user_id | "ai"), change_reason, created_at
  }
  ```

### 4. **Plagiarism / Similarity Checking** [ ]
- **What's missing**: No audit of how much text comes from references vs. is original
- **Why it matters**: Academic integrity — schools need assurance students aren't just copying references
- **Effort**: Medium (2–3 weeks including integrations)
- **Options**:
  - Option A: **Turnitin API** (professional, costs per check)
  - Option B: **Copyscape API** (similar)
  - Option C: **In-house similarity** (compare sections against references in proposal_references)
  - **Recommendation**: Start with Option C (free, fast); upgrade to Turnitin if needed

### 5. **Smart Suggestion System** [ ]
- **What's missing**: 
  - "Your methodology section is weak — try adding more detail here"
  - "You're missing a diagram in Chapter 1.7"
  - "This reference doesn't support your claim in 1.2 — consider reordering"
- **Why it matters**: Transforms tool from "just generate" to "understand and guide"
- **Effort**: Medium (2–3 weeks for good UX)
- **How it works**:
  1. After each generation, run a "QA check" against the spec
  2. Flag missing sections, weak citations, diagram gaps
  3. Show user a checklist: "✓ 1.1–1.6 complete, ⚠ 1.7 missing diagram, ✗ Need 2 more references"
  4. Offer "Fill this gap" buttons

### 6. **Teacher Guidance Integration** [ ]
- **What's missing**: Teachers can't feed in their own rubric or preferences
- **Why it matters**: Some teachers have specific requirements (e.g., "must include SWOT analysis")
- **Effort**: Medium (2–3 weeks)
- **How it works**:
  1. Teacher uploads rubric/requirements as PDF/text
  2. System extracts key criteria
  3. Prompts include those criteria
  4. Export includes a "rubric checklist" page showing how proposal aligns

### 7. **Multi-Language Support** [ ]
- **What's missing**: Everything is in English
- **Why it matters**: ZUT might have Shona-speaking regions
- **Effort**: High (4+ weeks, ongoing translation work)
- **Current recommendation**: Skip for now unless explicit requirement

---

## Recommendation Framework

### **If you want students to feel "wow, this really helps me":**
Priority order:
1. **Background jobs for autopilot** (high impact, medium effort)
2. **Edit/revise with smart merging** (medium impact, medium effort)
3. **Submission workflow** (high impact, medium-high effort)
4. **UI/UX polish** (low impact, medium effort)

### **If you want teachers/admins to feel "I can trust this":**
Priority order:
1. **Formal submission + feedback workflow** (medium impact, medium effort)
2. **Version history** (low impact, low effort)
3. **Plagiarism checking** (high impact, medium-high effort)
4. **Smart suggestions** (medium impact, medium effort)

### **If you're prioritizing data integrity & audit:**
1. **Version history** (low effort, high value)
2. **Submission audit trail** (part of workflow)
3. **Plagiarism audit** (medium effort, high value)

### **If you're prioritizing user experience:**
1. **UI/UX polish** (medium effort, high delight)
2. **Edit/revise smart mode** (medium effort, high utility)
3. **Autopilot background jobs** (medium effort, high utility)

---

## Technical Debt & Risks

### Current Issues
1. **No background job system**: Limits autopilot; proposals can't auto-complete
2. **No version history**: Can't audit changes; students can't "undo"
3. **Single-school assumption**: Admin branding/specs work, but some paths aren't namespaced
4. **Template library not fully scaled**: Works, but embedding search not tested at scale
5. **No submission workflow**: Hard to enforce "no resubmission after approval"

### What to Fix Before Major Scaling
1. **Background jobs** (required for autopilot feature to feel real)
2. **Multi-school support** (schema is ready; just needs testing + edge case handling)
3. **Plagiarism check** (needed before public launch, especially if students are paying)

---

## Data & Metrics to Track

Once enhanced, monitor:

```
Proposal Generation:
- Avg chapters per proposal (should trend 4–6 over time)
- Time from create → export (target: <1 hour for initial, <2 hours for full)
- Regeneration rate (how often do students hit "retry"? if >50%, quality issue)
- Credit usage per chapter (watch for outliers)

Student Behavior:
- % of projects that hit initial_proposal_ready gate (goal: >80%)
- % that upgrade to full_project (goal: >50%)
- Avg iterations per section (if >3, maybe refinement tools needed)
- Abandon rate (if >20%, UX issue)

Teacher/Admin:
- % of submissions received (if <50%, submission flow not clear)
- Avg feedback turnaround (if you add review workflow)
- Appeals rate (if >5%, rubric/standards unclear)

Costs:
- Avg credits per proposal (monitor LLM cost trends)
- Waste (generations that user never uses)
```

---

## Next Steps

**Show this document + the two context docs to your Guidance Model with these questions:**

1. **Autopilot**: Is it critical to ship a background job system, or is browser-based "generate sequentially" good enough as an MVP?

2. **Submission workflow**: Should we formalize student → teacher submission + feedback, or keep it informal (students export and email)?

3. **Revision experience**: Should edit/revise be smart (preserve good parts, fix bad), or is "regenerate section" good enough?

4. **Timeline**: Which features would you recommend in:
   - Week 1 (quick wins)
   - Weeks 2–4 (medium effort)
   - Month 2 (high effort, high impact)

5. **Scope**: Are we building for:
   - ZUT only (optimize for that one school)
   - Any school in Zimbabwe (multi-school from the start)
   - Global scale (design for all schools everywhere)

6. **Monetization**: Should we:
   - Keep proposals free, sell other AI tools (exams, assignments)
   - Charge per proposal (credit system as is, but with real money)
   - Freemium (3 free proposals/month, pay for more)

7. **Safety/Trust**: Do we need plagiarism checking before launch?

---

## Attached Documents

1. **`PROJECT_PROPOSAL_CONTEXT.md`**: Full technical breakdown of what exists, database schema, API routes, key files
2. **`PROPOSAL_ARCHITECTURE_DIAGRAM.md`**: Flow diagrams, data flow maps, endpoint reference
3. **`GUIDANCE_MODEL_BRIEFING.md`**: This document

---

**Ready to share with your Guidance Model!**

