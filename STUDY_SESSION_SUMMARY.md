# DataCampus Project Proposal System — Study Session Summary

**Date**: 2026-08-14  
**Agent**: Zed Coding Assistant  
**Task**: Study workspace + identify features for enhancement  
**Output**: 3 comprehensive briefing documents

---

## What I Found

### 1. **The Core System** ✅

You have a fully functional **AI-assisted project proposal generation system** where:

- **Students** enter a project title and the system auto-generates a complete proposal following ZUT's official structure
- **AI** uses template matching, auto-discovered references, and school-specific guidance to write proposal chapters
- **Professors** can configure school branding, manage proposal templates, and define proposal standards
- **Exports** produce submission-ready DOCX files with proper formatting, citations, and diagrams

**Key insight**: The architecture is **spec-driven** — every chapter generation is guided by `base_spec.json` (extracted from real ZUT examples), not generic templates. This ensures proposals match your school's exact requirements.

### 2. **What's Fully Built** ✅

| Feature | Status | Key File |
|---------|--------|----------|
| Project creation + auto-title refinement | ✅ Complete | `projectTitle.ts` |
| Reference auto-discovery (Crossref API) | ✅ Complete | `referenceDiscovery.ts` |
| Main chapter generation engine | ✅ Complete | `generate/route.ts` |
| Template semantic matching | ✅ Complete | `generate/route.ts` |
| Workflow progression gate (3→6 chapters) | ✅ Complete | `proposalFlow.ts`, `upgrade-stage/route.ts` |
| Live cover page preview | ✅ Complete | `ProposalCoverPagePreview.tsx` |
| Export to DOCX (IEEE citations, TOC) | ✅ Complete | `proposalDocx.ts`, `export/route.ts` |
| Credit system (fair usage billing) | ✅ Complete | Wallet tables + transaction logging |
| Admin console (branding, templates, specs) | ✅ Complete | `/admin/proposals/assets` |
| Multi-provider LLM support (Claude, Gemini) | ✅ Complete | Both providers available in `generate/route.ts` |

### 3. **What's Partial** [~]

| Feature | What's Missing | Effort | Priority |
|---------|---|---|---|
| **Autopilot** | No background job system; stops if user closes browser | Medium | High |
| **Edit/Revise** | Regenerates entire section; no smart "keep-good, fix-bad" mode | Medium | Medium |
| **UI Polish** | Functional but utilitarian; could be more intuitive | Medium | Low |
| **Multi-School Support** | Schema ready but not fully tested/namespaced | Low | Low–Medium |

### 4. **What's Missing** [ ]

| Feature | Why It Matters | Effort | Priority |
|---------|---|---|---|
| **Background Jobs** | Students want to start generation and close the app | 1–2 weeks | High |
| **Submission Workflow** | Schools need formal "student → teacher → approval" flow | 2–3 weeks | High |
| **Edit with Merging** | Students don't want to lose their good writing when revising | 1 week | Medium |
| **Version History** | Needed for audit trail and student undo | 1 week | Medium |
| **Plagiarism Check** | Due diligence for academic integrity | 2–3 weeks | Medium |
| **Smart Suggestions** | "Your methodology is weak here" = delightful UX | 2–3 weeks | Low–Medium |
| **Teacher Rubric Integration** | Teachers can inject their requirements | 2–3 weeks | Low–Medium |

---

## The Three Documents I Created

### 📄 **Document 1: PROJECT_PROPOSAL_CONTEXT.md**
**Use case**: Deep dive for your team

**Contents**:
- Workspace overview (tech stack, project structure)
- Current features checklist (what works, what's partial, what's missing)
- Complete database schema (12 tables, relationships, data types)
- All API endpoints (21 routes explained)
- Key files and their roles
- Architectural decisions and why they matter
- Important notes on spec resolution, credit system, template matching

**Length**: ~500 lines (very detailed)

**When to use it**: 
- Onboarding new team members
- Planning database migrations
- Understanding how references flow through the system
- Debugging API issues

---

### 📋 **Document 2: PROPOSAL_ARCHITECTURE_DIAGRAM.md**
**Use case**: Visual learner? Need to understand the flow?

**Contents**:
- High-level student workflow (diagram with 10 steps)
- Database schema map (visual entity relationships)
- API endpoint map (all routes + input/output)
- Detailed data flow for a generation request (11 steps: auth → spec load → template match → LLM → parse → save → credits → return)
- Summary of architectural principles

**Length**: ~400 lines (diagrams + explanations)

**When to use it**:
- You need to explain the system to a professor or stakeholder
- Planning a new feature (need to see where it fits)
- Debugging a request's path through the system
- Onboarding a developer who needs to understand the pipeline

---

### 🎯 **Document 3: GUIDANCE_MODEL_BRIEFING.md**
**Use case**: Ready-to-share with your Guidance Model for recommendations**

**Contents**:
- Executive summary (what DataCampus is, current status)
- What exists fully (8 features, with files/routes)
- What's partial (4 features, what's needed, why)
- What's missing (7 features, effort estimates, recommendations)
- Recommendation framework based on priority (student experience vs. teacher trust vs. data integrity)
- Technical debt & risks
- Metrics to track
- **7 specific questions to ask your Guidance Model**
- Attached docs list

**Length**: ~400 lines

**When to use it**:
- **This is your briefing to the Guidance Model** — copy/paste or share this to ask for recommendations on which features to enhance
- Team decision-making meetings ("which feature should we build next?")
- Stakeholder communication ("here's what we have, here's what's missing")

---

## Key Insights From My Study

### 🎯 **The "Why" Behind Design Choices**

1. **Spec-driven generation** (not template-driven)
   - Why: Ensures proposals match your school's exact structure
   - Benefit: Easy to add new schools (just upload new spec)
   - Risk: If spec is wrong, all generations are wrong
   - **Action**: Keep `base_spec.json` as the source of truth

2. **Template matching via metadata + embeddings**
   - Why: Find relevant examples before LLM call
   - Benefit: Reduces hallucinations; outputs match local style
   - Risk: Embedding quality depends on template library size
   - **Action**: Grow template library (examples = better outputs)

3. **Credit system**
   - Why: Fair usage, prevents abuse, creates revenue model
   - Benefit: Can monetize; budgets are predictable
   - Risk: If too expensive, students don't use feature
   - **Action**: Monitor usage patterns; adjust pricing

4. **Workflow gate (3 chapters → 6 chapters)**
   - Why: Ensures quality before committing to full project
   - Benefit: Clear progression; teachers can provide feedback mid-way
   - Risk: Some students may abandon after initial
   - **Action**: Track completion rates; improve step 3 if <80% progress to step 4

### ⚠️ **Risks to Be Aware Of**

1. **Autopilot incomplete** — students will ask "can I go to sleep and come back to a finished proposal?" Current answer: "no". This is a credibility issue.

2. **No submission workflow** — hard to enforce "approved" vs. "draft". Teacher feedback can't be stored.

3. **No plagiarism check** — you're generating text; need way to audit originality. This is a legal/ethics issue if scaling.

4. **Single school assumption in places** — works for ZUT now, but doesn't cleanly scale if adding more schools.

5. **No version history** — if teacher asks "what did your original draft say?", you can't answer.

### 🚀 **Biggest Opportunities**

1. **Background jobs for autopilot** (high impact, medium effort)
   - Once students can "set and forget", adoption will jump

2. **Submission + feedback workflow** (high impact, medium-high effort)
   - Formalizes the student→teacher loop; makes it feel like a real academic process

3. **Edit with smart merging** (medium impact, low-medium effort)
   - Simple to build, huge UX improvement ("don't delete my good writing")

4. **Version history** (medium impact, low effort)
   - Quick to add; opens up new features (audit trail, undo, diff view)

---

## How to Use These Documents

### **Step 1: Share With Guidance Model** ✅
Send `GUIDANCE_MODEL_BRIEFING.md` + ask it the 7 questions at the end.

**Expected output**: Ranked list of features to build, timeline estimates, architecture recommendations

### **Step 2: Technical Planning**
Once you have Guidance Model's recommendations, use `PROJECT_PROPOSAL_CONTEXT.md` to:
- Identify which files to modify
- Plan database changes
- Design new API routes
- Estimate implementation effort

### **Step 3: Communication**
Use `PROPOSAL_ARCHITECTURE_DIAGRAM.md` to:
- Brief your team
- Document decisions
- Plan code reviews

### **Step 4: Build**
Once you're building, keep all 3 docs nearby as reference. Update them as you code (keep docs in sync with reality).

---

## Your Next Move

1. **Read** `GUIDANCE_MODEL_BRIEFING.md` (this is your briefing)
2. **Share it** with your Guidance Model along with the 7 questions at the end
3. **Collect feedback** on which features to prioritize
4. **Use** `PROJECT_PROPOSAL_CONTEXT.md` for technical details once you start building
5. **Reference** `PROPOSAL_ARCHITECTURE_DIAGRAM.md` when you need to see the full flow

---

## Files Created

All files are in `C:\Users\Administrator\data_cumpus\`:

1. **PROJECT_PROPOSAL_CONTEXT.md** — Technical deep-dive (10 sections, ~500 lines)
2. **PROPOSAL_ARCHITECTURE_DIAGRAM.md** — Visual flows + diagrams (~400 lines)
3. **GUIDANCE_MODEL_BRIEFING.md** — Recommendations briefing (~400 lines)
4. **STUDY_SESSION_SUMMARY.md** — This file (summary + how-to)



**Created by**: Zed Coding Assistant  
**Time**: 2026-08-14  
**Status**: Ready for review & consultation
