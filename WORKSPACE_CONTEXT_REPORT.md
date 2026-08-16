# DataCampus Project Proposal System - Workspace Context Report

**Date**: 2026-08-14  
**Status**: Ready to build Phase 2 (Scoped Edit Tools)

---

## Executive Summary

The DataCampus project proposal system has **completed strategic planning** and **started Day 1 implementation** (Intent Classifier). We are now ready to begin **Day 2-5**: building the 3 scoped edit tools and integrating them into the ask/route.ts handler.

### Key Business Outcome
Transform from **"regenerate everything"** (inefficient, wastes credits) to **"edit intelligently"** (targeted tools, faster feedback, better UX).

---

## Part A: Project Landscape

### Project Structure
- **Root**: `C:\Users\Administrator\data_cumpus\`
- **Frontend/API**: `datacampus/` (Next.js with TypeScript)
- **Database**: Supabase with 12 tables (all audit trails in place)
- **Multi-provider LLM**: Claude, Gemini, local-stub

### Core Features Already Exist ✅
1. **Chapter Generation** — `generate/route.ts` + `chapterGenerationEngine.ts`
   - Loads spec → builds prompt → calls LLM → parses → saves
2. **Conversational Ask** — `ask/route.ts`
   - General questions about the proposal (no editing)
3. **Database Schema** — All the infrastructure for versioning/audit is ready
4. **Workflow State** — `proposalFlow.ts` handles progression logic
5. **Spec Parsing** — `proposalSpec.ts` knows how to extract chapter/section definitions

### Project Proposal Page (UI Entry Point)
- **Path**: `datacampus/src/app/workspace/proposals/[id]/page.tsx`
- **Type**: React client component
- **Shows**: 
  - List of chapters (cover page, TOC, chapters 1–6 for full project)
  - Draft status for each section
  - Workspace shell with messaging interface

### Proposal Workspace Shell Component
- **Handles**: User input → sends message to API
- **Endpoints called**: 
  - `/api/proposals/[id]/ask` — ask/chat (no edits)
  - `/api/proposals/[id]/generate` — full chapter generation
  - `/api/proposals/[id]/autopilot` — automated progression

---

## Part B: What We Already Have Built

### 1. Intent Classifier ✅ (Day 1 - COMPLETE)
**File**: `datacampus/src/utils/intentClassifier.ts`

**Status**: Fully implemented, not yet integrated.

**What it does**:
- Classifies user messages into 6 types:
  1. **generation** — "Generate chapter 1"
  2. **section_edit** — "Expand section 2.3 with examples"
  3. **cover_page_edit** — "Change student name to Alice"
  4. **front_matter_edit** — "Add acknowledgement page"
  5. **unsupported_reframe** — "Fix the page break on page 5" (gracefully decline)
  6. **chat** — General conversation

**Key functions**:
- `classifyIntent(userMessage, context)` — Main dispatcher
- `detectGenerationIntent()` — Regex: "generate|write|create" + "chapter X"
- `detectSectionEditIntent()` — Regex: "rewrite|expand|simplify" + "section X.Y"
- `detectCoverPageEditIntent()` — Regex: "title|student name|supervisor|etc"
- `detectFrontMatterEditIntent()` — Regex: "abstract|acknowledgement|dedication|toc"
- `detectUnsupportedIntent()` — Regex: "page break|page number|formatting|bold|etc"

**Type Definitions**:
```typescript
type IntentType = "generation" | "section_edit" | "cover_page_edit" | 
                  "front_matter_edit" | "unsupported_reframe" | "chat"

interface IntentClassification {
  type: IntentType
  confidence: number
  targetKey?: string        // "chapter_1", "section_2_3", "title"
  targetType?: string       // "chapter" | "section" | "field" | "page"
  requestedAction?: string  // "rewrite" | "expand" | "simplify" | "improve"
  unsupportedReason?: string
  suggestedAlternatives?: string[]
}
```

---

## Part C: What We Need to Build (Days 2–5)

### Phase 1: 3 Scoped Edit Tools (Days 2–3)
**New File**: `datacampus/src/app/api/proposals/[id]/scoped-edit/route.ts`

These are the tools that *replace* "regenerate everything":

#### Tool 1: `updateCoverPageField(projectId, fieldName, newValue)`
- **Cost**: 0 credits (instant, no LLM call)
- **Valid fields**: title, student_name, student_id, supervisor, department, academic_year
- **Action**: Update `proposal_projects` table directly
- **Logging**: Create entry in `proposal_section_versions` table
- **Example**: User says "Change the title to 'AI Supply Chain System'" → Tool updates DB row in 10ms

#### Tool 2: `regenerateChapterSection(projectId, chapterKey, sectionKey, action, reason, token)`
- **Cost**: 20 credits (targeted, not full chapter 50)
- **Parameters**: 
  - `action` ∈ {rewrite, expand, simplify, clarify, improve}
  - `reason` = user's instruction (e.g., "with more examples")
- **Process**:
  1. Load current section content from DB
  2. Extract section spec from `base_spec.json`
  3. Build targeted prompt: "Here's the current content: [content]. Please [action] it: [reason]"
  4. Call LLM (~2000 tokens, not 4000)
  5. Parse response for ONLY that section
  6. Save to `proposal_sections` table (don't touch other sections)
  7. Create version history entry
- **Example**: User says "Expand section 2.3 with more examples" → Tool regenerates ONLY 2.3

#### Tool 3: `insertFrontMatterPage(projectId, pageType, content, token)`
- **Cost**: 0 credits (included in tool)
- **pageType** ∈ {abstract, acknowledgement, dedication, toc}
- **Process**:
  1. If no content provided: auto-generate via LLM (or user provides content)
  2. Insert new row to `proposal_sections` if doesn't exist
  3. Update if exists
  4. Create version history entry
- **Example**: User says "Add an acknowledgement page" → Tool auto-generates and inserts

### Phase 2: Integration into ask/route.ts (Day 4)
**Modify**: `datacampus/src/app/api/proposals/[id]/ask/route.ts`

**Changes**:
1. Import `classifyIntent` from intentClassifier
2. Call it on incoming message BEFORE routing
3. Add 6 handler functions:
   ```typescript
   handleGenerationIntent()      → call existing generate logic
   handleSectionEditIntent()     → call regenerateChapterSection tool
   handleCoverPageEditIntent()   → call updateCoverPageField tool
   handleFrontMatterEditIntent() → call insertFrontMatterPage tool
   handleUnsupportedIntent()     → show "I can't do that, but I can..." response
   handleConversationIntent()    → existing conversation logic
   ```

4. Error handling & graceful degradation

### Phase 3: Database Changes
**New table**: `proposal_section_versions`
```sql
CREATE TABLE proposal_section_versions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects(id),
  section_key TEXT NOT NULL,
  version_number INT NOT NULL,
  content_md TEXT NOT NULL,
  changed_by TEXT NOT NULL, -- "user_request" | "ai_generation"
  change_reason TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(project_id, section_key, version_number)
);
```

**Modify table**: `proposal_sections`
```sql
ALTER TABLE proposal_sections ADD COLUMN current_version_number INT DEFAULT 1;
```

### Phase 4: Testing & Deployment (Day 5)
- Unit tests for each tool
- Integration tests for all 5 conversation flows
- Database migration + rollback script
- Manual testing checklist
- Performance validation (<1 sec per request)

---

## Part D: Guidance Model Strategy (from cd.md)

**Key insight**: The system already has all the hard infrastructure (generation pipeline, database, LLM providers). What's missing is a **message-classification layer** that routes "change this" to a **small, targeted tool** instead of always regenerating the whole chapter.

### The 4 Branches (Decision Tree)
1. **Generation** → Use existing `generate/route.ts` (no change)
2. **Section Edit** → Call `regenerateChapterSection` (20 credits, targeted)
3. **Cover Page Edit** → Call `updateCoverPageField` (0 credits, instant)
4. **Front Matter Edit** → Call `insertFrontMatterPage` (0 credits)
5. **Unsupported Reframe** → Show user what IS possible (new branch!)
6. **Chat** → Existing conversation (no change)

### Why the 4th Branch Matters
Users ask for things like "Fix the page break on page 5" or "Make this bold." These are **render-dependent**, not **structural anchors**. The system can't guarantee them because:
- Page numbers change after regeneration
- Formatting is applied during export, not in content

**Solution**: Detect early, reframe to user: "I can't control page breaks, but I can: (1) rewrite this section shorter, (2) add a [PAGE_BREAK] marker you can move in Word."

This is **cheap to add now** (while decision tree is being built), **expensive to retrofit later** (after tools are done).

---

## Part E: Key Files Reference

| File | Purpose | Status | Notes |
|------|---------|--------|-------|
| `intentClassifier.ts` | 5-branch intent classifier | ✅ DONE | Ready to integrate |
| `ask/route.ts` | Conversational endpoint | ⚠️ MODIFY | Need to call classifier |
| `scoped-edit/route.ts` | 3 edit tools | ❌ BUILD | Days 2–3 |
| `generate/route.ts` | Full chapter generation | ✅ EXISTS | Reuse pattern |
| `base_spec.json` | Proposal structure definition | ✅ EXISTS | Load sections from here |
| `proposalSpec.ts` | Functions to parse spec | ✅ EXISTS | Use to extract section defs |
| `chapterGenerationEngine.ts` | Core generation pipeline | ✅ EXISTS | Reference for LLM calling |
| `proposal_section_versions` table | Version history | ❌ CREATE | New table (Day 2) |
| `IMPLEMENTATION_SPEC_INTENT_CLASSIFIER.md` | Detailed specs | ✅ EXISTS | Full implementation guide |
| `IMPLEMENTATION_SPEC_INTEGRATION.md` | Integration guide | ✅ EXISTS | Wiring instructions |
| `cd.md` | Strategic guidance | ✅ EXISTS | Explains "why" |

---

## Part F: Test Scenarios (Validation)

### Test 1: Generation Intent
```
User: "Generate chapter 1"
System: classifyIntent → type=generation
Handler: calls existing generate/route.ts
Result: Full chapter 1 generated
```

### Test 2: Section Edit Intent
```
User: "Expand section 2.3 with more examples"
System: classifyIntent → type=section_edit, action=expand, targetKey=section_2_3
Handler: calls regenerateChapterSection(projectId, chapter_2, section_2_3, expand, "with more examples")
Result: Only section 2.3 regenerated, 20 credits deducted, version history logged
```

### Test 3: Cover Page Edit Intent
```
User: "Change the title to 'AI Supply Chain System'"
System: classifyIntent → type=cover_page_edit, targetKey=title
Handler: calls updateCoverPageField(projectId, title, "AI Supply Chain System")
Result: Instant update, 0 credits, version history logged
```

### Test 4: Unsupported Intent (Reframe)
```
User: "Fix the page break so the diagram is on page 5"
System: classifyIntent → type=unsupported_reframe, reason="page breaks...", alternatives=[...]
Handler: shows graceful degradation message
Result: User sees "I can't manage page breaks, but I can: (1) rewrite this section shorter (2) add a [PAGE_BREAK] marker"
```

### Test 5: Front Matter Intent
```
User: "Add an acknowledgement page"
System: classifyIntent → type=front_matter_edit, pageType=acknowledgement
Handler: calls insertFrontMatterPage(projectId, acknowledgement, null)
Result: Auto-generates acknowledgement via LLM, inserts to DB, 0 credits, version history logged
```

---

## Part G: Critical Implementation Notes

### ✅ DO
1. **Log every edit to version history** — If you skip this, can't implement undo later
2. **Only regenerate the target section** — If user asks to edit section 1.2, ONLY regenerate 1.2
3. **Use simple regex for classification** — 95% accuracy is good enough; ambiguous → fall back to chat
4. **Charge correct credits**: Full chapter = 50, Section edit = 20, Field edit = 0
5. **Reference existing patterns** — Look at `generate/route.ts` for LLM calling, spec injection, parsing

### ❌ DON'T
1. ❌ Forget version logging — Every edit must create version entry
2. ❌ Regenerate the whole chapter when editing one section — This defeats the purpose
3. ❌ Build undo/history UI yet — Just store versions; UI is future work
4. ❌ Silently fail on unsupported requests — Always show user what you CAN do
5. ❌ Add complicated AI logic to classifier — Keep it simple (regex)
6. ❌ Over-engineer the regeneration prompt — Keep it simple: "Here's current content. Please [action] it: [reason]"

---

## Part H: Next Immediate Actions

### ✅ Today's Work (You are here)
1. Read this context report
2. Read `cd.md` (understand strategy)
3. Read `IMPLEMENTATION_SPEC_INTENT_CLASSIFIER.md` Part 2 (the 3 tools)

### ⬜ Tomorrow (Day 2)
1. Create `scoped-edit/route.ts` with all 3 tools
2. Build `updateCoverPageField()` function
3. Build `regenerateChapterSection()` function
4. Build `insertFrontMatterPage()` function
5. Build helper functions (version logging, prompt building)
6. Unit test each tool

### ⬜ Day 3
1. Finish tool tests
2. Create database migration script for `proposal_section_versions` table
3. Test all tools end-to-end

### ⬜ Day 4
1. Modify `ask/route.ts` to call `classifyIntent`
2. Add 6 handler functions
3. Integration tests

### ⬜ Day 5
1. Manual testing (all 5 scenarios above)
2. Performance validation
3. Deployment checklist

---

## Summary: You Have Everything

✅ **Strategic guidance** (cd.md)  
✅ **Detailed specs** (IMPLEMENTATION_SPEC_*.md)  
✅ **Day 1 work done** (intentClassifier.ts)  
✅ **Database schema ready** (all existing tables)  
✅ **LLM integration patterns** (existing generate/route.ts)  
✅ **Workflow state logic** (proposalFlow.ts)  

🔨 **You're ready to build.**

No ambiguity. All decisions documented. All patterns established. All tools specified.

**Ready to start Day 2 work?**
