# Week 1 Implementation Roadmap

**Intent Classifier + Scoped Edit Tools**

**Timeline**: 5 days  
**Team size**: 1–2 developers  
**Scope**: Complete spec-driven implementation  
**Status**: Ready to build

---

## 📋 Overview

You're building a message-classification layer that routes "change this" requests to small, targeted tools instead of "regenerate everything."

### What This Fixes
- ❌ Can't edit cover page → ✅ `update_cover_page_field` tool
- ❌ Ignores instructions → ✅ `regenerate_chapter_section` tool  
- ❌ Feels rigid/overwrite → ✅ Graceful degradation for unsupported requests
- ❌ No edit history → ✅ Version tracking

### Key Insight (from `cd.md`)
> "Your system already has the hard infrastructure. What's missing is specifically the thing this whole conversation has been circling: a message-classification layer that routes 'change this' to a small tool instead of 'regenerate everything.'"

---

## 📚 Reference Documents

Before you start, read these in order:

1. **IMPLEMENTATION_SPEC_INTENT_CLASSIFIER.md** (Main spec)
   - Type definitions
   - Intent classifier implementation (all 5 branches)
   - 3 scoped edit tools
   - Version history
   - Example conversations

2. **IMPLEMENTATION_SPEC_INTEGRATION.md** (Integration & testing)
   - How to wire into ask/route.ts
   - Integration tests
   - Manual testing checklist
   - Deployment checklist

3. **cd.md** (Strategy)
   - Why this approach
   - The 4th branch (unsupported_reframe)
   - Why add this now vs. retrofit later

---

## 🗓️ Day-by-Day Plan

### Day 1: Intent Classifier Foundation (6–8 hours)

**Deliverable**: `intentClassifier.ts` with all 5 detection functions

**Tasks**:
1. Create file: `datacampus/src/utils/intentClassifier.ts`
2. Add type definitions:
   ```typescript
   type IntentType = "generation" | "section_edit" | "cover_page_edit" | 
                     "front_matter_edit" | "unsupported_reframe" | "chat"
   
   interface IntentClassification { ... }
   interface ClassifierContext { ... }
   ```

3. Implement main function:
   ```typescript
   export async function classifyIntent(
     userMessage: string,
     context: ClassifierContext
   ): Promise<IntentClassification>
   ```

4. Implement 5 detection functions:
   - `detectGenerationIntent()` — "Generate chapter X"
   - `detectSectionEditIntent()` — "Expand section 2.3"
   - `detectCoverPageEditIntent()` — "Change title to X"
   - `detectFrontMatterEditIntent()` — "Add acknowledgement"
   - `detectUnsupportedIntent()` — "Fix page break"

5. Add helper functions:
   - `chapterNameToNumber()`
   - `normalizeSection()`

6. Write unit tests (see IMPLEMENTATION_SPEC_INTENT_CLASSIFIER.md)

7. Test with 10 example messages

**Acceptance Criteria**:
- ✅ All type definitions compile
- ✅ All 5 detection functions implemented
- ✅ Unit tests pass
- ✅ Tested with example messages
- ✅ Confidence scores make sense (>0.85 for high confidence)

---

### Day 2: Scoped Edit Tools (8–10 hours)

**Deliverable**: `scoped-edit/route.ts` with 2 main tools + infrastructure

**Tasks**:

1. Create file: `datacampus/src/app/api/proposals/[id]/scoped-edit/route.ts`

2. Implement Tool 1: `update_cover_page_field()`
   - Takes: projectId, fieldName, newValue
   - Validates field name
   - Updates projects table
   - Logs to version history
   - Returns success/error

3. Implement Tool 2: `regenerate_chapter_section()`
   - Takes: projectId, chapterKey, sectionKey, reason, action, token
   - Loads current section
   - Loads spec for guidance
   - Builds targeted prompt (keep existing, fix specific aspect)
   - Calls LLM
   - Saves only that section
   - Logs to version history
   - Deducts 20 credits (not 50)

4. Create helper: `buildTargetedRegenerationPrompt()`
   - Includes section spec
   - Includes current content
   - Includes action instructions (expand/simplify/clarify/improve/rewrite)

5. Create helper: `extractSectionContent()`
   - Parses LLM response to extract just that section

6. Write unit tests

**Acceptance Criteria**:
- ✅ Tools compile and run
- ✅ Cover page field updates without regenerating chapters
- ✅ Section regeneration updates only that section
- ✅ Credits deducted correctly (20 vs 50)
- ✅ Version history created for each edit
- ✅ Tests pass

---

### Day 3: Front Matter Tool + Version History (8 hours)

**Deliverable**: Tool 3 complete + version history system working

**Tasks**:

1. Implement Tool 3: `insertFrontMatterPage()`
   - Takes: projectId, pageType, content, token
   - pageTypes: "abstract" | "acknowledgement" | "dedication" | "toc"
   - Creates new section if doesn't exist
   - Updates metadata.front_matter array
   - Logs to version history

2. Create database migration:
   ```sql
   CREATE TABLE proposal_section_versions (
     id UUID PRIMARY KEY,
     project_id UUID NOT NULL,
     section_key TEXT NOT NULL,
     version_number INT NOT NULL,
     content_md TEXT,
     changed_by TEXT,
     change_reason TEXT,
     metadata JSONB,
     created_at TIMESTAMP,
     updated_at TIMESTAMP,
     UNIQUE(project_id, section_key, version_number)
   );
   ```

3. Add version tracking to proposal_sections:
   ```sql
   ALTER TABLE proposal_sections ADD COLUMN current_version_number INT DEFAULT 1;
   ```

4. Implement `logVersionEntry()` function:
   - Called after each edit
   - Increments version number
   - Records what changed, who changed it, when
   - Updates pointer in proposal_sections

5. Implement helper: `generateFrontMatterContent()`
   - Uses LLM to auto-generate if user doesn't provide content
   - Prompts for acknowledgement, abstract, dedication

6. Test all 3 tools end-to-end

**Acceptance Criteria**:
- ✅ Front matter tool working
- ✅ Database migration successful
- ✅ Version history created on every edit
- ✅ Can view version history per section
- ✅ Tests pass

---

### Day 4: Integration with ask/route.ts (8–10 hours)

**Deliverable**: Intent classifier wired into production flow

**Tasks**:

1. Modify `datacampus/src/app/api/proposals/[id]/ask/route.ts`:
   - Import classifyIntent
   - Add classification call before routing
   - Add switch statement for 6 intent types

2. Implement 6 handler functions in ask/route.ts:
   - `handleGenerationIntent()` — call existing generate logic
   - `handleSectionEditIntent()` — call regenerateChapterSection
   - `handleCoverPageEditIntent()` — call updateCoverPageField
   - `handleFrontMatterEditIntent()` — call insertFrontMatterPage
   - `handleUnsupportedIntent()` — show alternatives
   - `handleConversationIntent()` — call existing conversation logic

3. Add helper functions:
   - `extractChapterKeyFromSection()`
   - `extractValueFromMessage()`
   - `extractContentFromMessage()`

4. Create graceful degradation handler:
   - File: `datacampus/src/utils/gracefulDegradation.ts`
   - Function: `buildUnsupportedIntentResponse()`
   - Returns message + suggestions

5. Wire up error handling:
   - All tools return proper error responses
   - No silent failures

6. Integration tests:
   - Test each intent type routing to correct handler
   - Test error cases
   - Test edge cases (ambiguous messages, typos)

**Acceptance Criteria**:
- ✅ Compiles without errors
- ✅ All 6 handlers implemented
- ✅ Integration tests pass
- ✅ Tested with 20 example conversations
- ✅ Error responses user-friendly

---

### Day 5: Testing + Polish (6–8 hours)

**Deliverable**: Fully tested, production-ready system

**Tasks**:

1. Run complete test suite:
   - Unit tests: intentClassifier
   - Unit tests: all 3 tools
   - Integration tests: ask/route.ts
   - All pass

2. Manual testing checklist (see IMPLEMENTATION_SPEC_INTEGRATION.md):
   - Test all 6 intent types
   - Test edge cases
   - Test error handling
   - Test graceful degradation

3. Performance testing:
   - Measure latency of intent classification
   - Measure latency of each tool
   - Ensure <1 second response time

4. Documentation:
   - Update API docs
   - Document the 4 branches
   - Add example conversations to code comments

5. Prepare deployment:
   - Database migration script
   - Rollback script
   - Monitoring alerts
   - Feature flag (if using one)

6. Review checklist:
   - Code quality: TypeScript strict, ESLint clean
   - Test coverage: >90%
   - No hardcoded test data
   - Error messages are helpful

**Acceptance Criteria**:
- ✅ All tests pass
- ✅ Manual testing complete
- ✅ Performance acceptable (<1 sec)
- ✅ Documentation complete
- ✅ Deployment ready
- ✅ Ready for PR review

---

## 🎯 Success Metrics

### End of Week 1

**Code Quality**:
- ✅ 0 TypeScript errors
- ✅ 0 ESLint errors
- ✅ >90% test coverage
- ✅ All manual tests pass

**Functionality**:
- ✅ Intent classifier routes 95%+ correctly
- ✅ All 3 tools work as specified
- ✅ Version history tracks all edits
- ✅ Graceful degradation prevents silent failures

**Performance**:
- ✅ Intent classification: <100ms
- ✅ Scoped edit: <2 seconds
- ✅ No memory leaks
- ✅ Handles concurrent requests

**Usability**:
- ✅ Users can edit cover page without regenerating chapters
- ✅ Users can edit sections without regenerating whole chapter
- ✅ Users understand when request is unsupported (clear message)
- ✅ System feels responsive, not rigid

---

## 📦 Files Created/Modified

### New Files
- `datacampus/src/utils/intentClassifier.ts`
- `datacampus/src/utils/gracefulDegradation.ts`
- `datacampus/src/app/api/proposals/[id]/scoped-edit/route.ts`
- `datacampus/src/app/api/proposals/[id]/scoped-edit/__tests__/unit.test.ts`
- `datacampus/src/app/api/proposals/[id]/ask/__tests__/integration.test.ts`
- Database migrations (proposal_section_versions table)

### Modified Files
- `datacampus/src/app/api/proposals/[id]/ask/route.ts` (add intent classification)
- `datacampus/src/utils/proposalTools.ts` (might add helpers)

---

## 🚀 Quick Start Commands

```bash
# Day 1: Start building
cd datacampus
npm install

# Check TypeScript
npx tsc --noEmit

# Run tests as you build
npm test

# Format code
npx prettier --write src/

# Lint
npx eslint src/ --fix
```

---

## ⚠️ Common Pitfalls to Avoid

1. **Don't forget version logging**
   - Every edit must log to proposal_section_versions
   - Without this, you can't implement undo/history later

2. **Don't over-complicate intent detection**
   - Simple regex patterns work fine
   - 95% accuracy is good enough; fallback to "chat"
   - Don't try to handle every edge case day 1

3. **Don't skip unsupported_reframe branch**
   - It's cheap to add now
   - Retrofitting later is expensive
   - Users appreciate understanding the boundary

4. **Don't hardcode test data**
   - Use fixtures/factories
   - Clean up after tests

5. **Don't forget error handling**
   - Every tool can fail (LLM timeout, DB error, etc.)
   - Return helpful error messages
   - Never silently fail

---

## 📞 Questions During Implementation?

### If you get stuck on...

**Intent Classification**:
- See examples in IMPLEMENTATION_SPEC_INTENT_CLASSIFIER.md Part 6
- Test with: `classifyIntent("Your test message", mockContext)`

**Scoped Edit Tools**:
- Check spec extraction in proposalSpec.ts (already exists)
- Look at existing generate/route.ts for LLM calling pattern
- Follow the same credit deduction pattern

**Integration**:
- Reference existing ask/route.ts structure
- Keep new handlers short (delegate to tool functions)
- Use consistent error response format

**Testing**:
- Look at existing API tests in datacampus for patterns
- Mock Supabase calls: `jest.mock("@supabase/supabase-js")`
- Use test factories for creating mock data

---

## 📈 What Comes Next (Week 2+)

**Week 1 = Intent Classifier + Scoped Edit Tools** ✓  
**Week 2 = Citation-Fidelity Check + Version History UI**  
**Week 3 = Background Jobs for Autopilot**  

---

## 🎓 Key Files to Reference While Building

- `projectTitle.ts` — Similar text processing pattern
- `proposalSpec.ts` — How to load and parse specs
- `referenceDiscovery.ts` — How to call external APIs
- `generate/route.ts` — How to build prompts and call LLM
- `proposalTools.ts` — Helper functions for proposal work
- Existing tests — Testing patterns in the codebase

---

## Final Checklist Before Starting Day 1

- [ ] Read IMPLEMENTATION_SPEC_INTENT_CLASSIFIER.md (Part 1 & 2)
- [ ] Read IMPLEMENTATION_SPEC_INTEGRATION.md (Part 1 & 2)
- [ ] Read cd.md (understand the 4th branch)
- [ ] Understand the 5 intent types
- [ ] Understand the 3 scoped edit tools
- [ ] Understand why version history matters
- [ ] Have Docker/local DB running
- [ ] Have IDE set up with linting
- [ ] Read existing code patterns
- [ ] Ask questions before starting!

---

**Ready to build? Start with Day 1: Intent Classifier**

Good luck! 🚀

