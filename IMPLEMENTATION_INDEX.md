# DataCampus Implementation Index

**Master guide for Week 1 build of Intent Classifier + Scoped Edit Tools**

---

## 📚 Document Library

### Strategic Documents (Read First)

| Document | Purpose | Read Time | Action |
|----------|---------|-----------|--------|
| **cd.md** | Guidance Model's strategic recommendations | 5 min | Read to understand the "why" |
| **WEEK1_IMPLEMENTATION_ROADMAP.md** | 5-day implementation plan with daily breakdown | 15 min | Your master timeline |

### Detailed Specifications (Refer While Building)

| Document | Purpose | Sections | Use When |
|----------|---------|----------|----------|
| **IMPLEMENTATION_SPEC_INTENT_CLASSIFIER.md** | Core spec for classifier + tools | 8 parts, 600+ lines | Building the main features |
| **IMPLEMENTATION_SPEC_INTEGRATION.md** | Integration + testing spec | 6 parts, 500+ lines | Wiring into ask/route.ts |

### Context Documents (Reference)

| Document | Purpose | Read Time | Use When |
|----------|---------|-----------|----------|
| **PROJECT_PROPOSAL_CONTEXT.md** | Technical deep dive on existing system | 30 min | Understanding current architecture |
| **PROPOSAL_ARCHITECTURE_DIAGRAM.md** | Visual flows, entity relationships | 20 min | Need to visualize data flow |
| **QUICK_REFERENCE.md** | One-page cheat sheet | 10 min | Quick lookups while coding |

---

## 🎯 Start Here: 30-Minute Orientation

1. **Read** `cd.md` (5 min)
   - Understand the core problem: "regenerate everything" instead of targeted edits
   - Understand the solution: 4-branch intent classifier
   - Understand why: "cheap to add now, expensive to retrofit later"

2. **Skim** `WEEK1_IMPLEMENTATION_ROADMAP.md` (10 min)
   - Overview section
   - Day-by-day plan (just the headers)
   - Success metrics

3. **Review** `IMPLEMENTATION_SPEC_INTENT_CLASSIFIER.md` (10 min)
   - Part 1: Overview
   - Part 2: Intent Classifier types & signatures
   - Example conversations (Part 6)

4. **Quick look** `IMPLEMENTATION_SPEC_INTEGRATION.md` (5 min)
   - Part 1: Integration points with ask/route.ts
   - Check you understand what files to modify

---

## 🗓️ Implementation Timeline

### Day 1: Intent Classifier
**File**: `datacampus/src/utils/intentClassifier.ts`  
**Reference**: IMPLEMENTATION_SPEC_INTENT_CLASSIFIER.md (Parts 2–3)  
**Tests**: Part 6, example messages  

**Key deliverable**: classifyIntent() function that routes to 5 intent types

### Day 2: Scoped Edit Tools (Tools 1–2)
**File**: `datacampus/src/app/api/proposals/[id]/scoped-edit/route.ts`  
**Reference**: IMPLEMENTATION_SPEC_INTENT_CLASSIFIER.md (Part 2)  

**Key deliverables**: 
- `updateCoverPageField()` 
- `regenerateChapterSection()`

### Day 3: Front Matter Tool + Version History
**Files**: 
- scoped-edit/route.ts (add Tool 3)
- Database migration
- `logVersionEntry()` function

**Reference**: IMPLEMENTATION_SPEC_INTENT_CLASSIFIER.md (Parts 2, 5)

### Day 4: Integration with ask/route.ts
**File**: `datacampus/src/app/api/proposals/[id]/ask/route.ts`  
**Reference**: IMPLEMENTATION_SPEC_INTEGRATION.md (Part 1)  

**Key deliverable**: Wire classifier + all handlers + graceful degradation

### Day 5: Testing + Polish
**Reference**: IMPLEMENTATION_SPEC_INTEGRATION.md (Parts 2–3)  

**Key deliverables**: Tests passing, manual checklist complete, ready to merge

---

## 🔑 Core Concepts (Remember These)

### The 5 Intent Types

```
1. "generation"           → User wants full chapter generated
2. "section_edit"         → User wants to edit/refine a specific section
3. "cover_page_edit"      → User wants to update cover page field
4. "front_matter_edit"    → User wants to add/edit front matter page
5. "unsupported_reframe"  → User asks for something we can't do
   └─ Response: "I can't guarantee that, but here's what I can do..."
```

### The 3 Scoped Edit Tools

```
Tool 1: updateCoverPageField(projectId, fieldName, newValue)
  - Updates: title, student_name, student_id, supervisor, department, academic_year
  - No chapter regeneration needed
  - Free (0 credits)

Tool 2: regenerateChapterSection(projectId, chapterKey, sectionKey, reason, action, token)
  - action: "rewrite" | "expand" | "simplify" | "clarify" | "improve"
  - Regenerates ONLY that section
  - Preserves other sections in chapter
  - Cost: 20 credits (vs 50 for full chapter)

Tool 3: insertFrontMatterPage(projectId, pageType, content, token)
  - pageType: "abstract" | "acknowledgement" | "dedication" | "toc"
  - Can auto-generate or use user-provided content
  - Creates if doesn't exist, updates if does
  - Cost: included in tool, no separate charge
```

### Why the 4th Branch Matters

Without `unsupported_reframe`, users hit silent failures:
```
User: "Fix page break on page 5"
System: (tries and fails silently, or uses wrong tool)
User: (frustrated)
```

With `unsupported_reframe`:
```
User: "Fix page break on page 5"
System: "I can't manage page breaks, but I can:
  1. Rewrite this section shorter
  2. Add a [PAGE_BREAK] marker
  Which helps?"
User: (understands boundary, chooses option)
```

### Version History

Every edit (tools 1–3) creates a version entry:
```sql
INSERT INTO proposal_section_versions (
  project_id, section_key, version_number, 
  content_md, changed_by, change_reason
)
```

This enables:
- Undo (revert to previous version)
- Audit trail (who changed what)
- Future diff view (see changes over time)

---

## 📂 File Locations

### New Files to Create
```
datacampus/src/utils/
├── intentClassifier.ts (NEW) — Main classifier logic

datacampus/src/utils/
├── gracefulDegradation.ts (NEW) — Unsupported intent handler

datacampus/src/app/api/proposals/[id]/
├── scoped-edit/ (NEW directory)
│   ├── route.ts — Three edit tools
│   └── __tests__/
│       └── unit.test.ts
```

### Files to Modify
```
datacampus/src/app/api/proposals/[id]/
└── ask/route.ts — Add intent classification + route handlers

database/
└── migrations/ — Add proposal_section_versions table
```

---

## 🧪 Testing Strategy

### Unit Tests (Day 2–3)
- `intentClassifier.test.ts`: Test all 5 detection functions
- `updateCoverPageField.test.ts`: Cover field updates
- `regenerateChapterSection.test.ts`: Section regeneration
- `insertFrontMatterPage.test.ts`: Front matter insertion
- `gracefulDegradation.test.ts`: Error message formatting

### Integration Tests (Day 4)
- `ask/route.test.ts`: Full flow tests
  - Generation intent → generate handler
  - Section edit intent → regenerate handler
  - Cover page edit → update handler
  - Front matter edit → insert handler
  - Unsupported intent → graceful degradation
  - Chat intent → conversation handler

### Manual Testing (Day 5)
- 20+ example conversations
- Edge cases (typos, ambiguous messages)
- Error scenarios
- Performance (latency, concurrency)

---

## 🚀 Launch Readiness

### Pre-Deployment Checklist
- [ ] All tests pass
- [ ] TypeScript strict: 0 errors
- [ ] ESLint: 0 errors
- [ ] Database migration tested locally
- [ ] Integration tests pass
- [ ] Manual testing complete
- [ ] Documentation updated
- [ ] Rollback script prepared
- [ ] Monitoring configured
- [ ] Support team trained

### Post-Launch Metrics to Track
- Intent classification accuracy (goal: >95%)
- Tool adoption rate (goal: >30% of interactions)
- Avg credits per session (goal: -20% vs baseline)
- Error rate (goal: <1%)
- User satisfaction (goal: positive feedback)

---

## ❓ FAQ

### Q: Do I need to modify the LLM calling logic?
**A**: No. You use the existing LLM patterns from `generate/route.ts`. The difference is you're targeting a specific section with a smaller prompt, not generating an entire chapter.

### Q: What if the LLM response for a section is incomplete?
**A**: That's the user's problem to fix. They can ask again with "expand this" or "clarify section X". That's the whole point — targeted edits, not perfection on first try.

### Q: Should I implement undo/redo on Day 1?
**A**: No. Version history is stored; UI for browsing versions is future work. For now, just log versions. Users can ask "what was the previous version?" and you show it manually.

### Q: What about credit costs?
**A**: 
- Full chapter generation: 50 credits
- Section regeneration: 20 credits
- Cover page field edit: 0 credits (instant)
- Front matter insertion: 0 credits (instant)

### Q: How do I handle ambiguous messages?
**A**: Classify with lower confidence, include a note like "Did you mean section 1.2? I'm not 100% sure." Then ask. Don't silently guess.

### Q: What if user says "Generate" without specifying a chapter?
**A**: Classify as "chat", ask "Which chapter would you like me to generate?" or suggest the next incomplete chapter.

---

## 💻 Development Setup

### Required
- Node.js 18+
- TypeScript
- Docker (for local Supabase)
- IDE with TypeScript support

### Recommended Tools
- Jest for testing
- Prettier for formatting
- ESLint for linting
- Supabase CLI for migrations

### Before You Start
```bash
cd datacampus
npm install
npm run dev # Should start on localhost:3000
npm test   # Run existing tests to verify setup
```

---

## 📞 Getting Help

### If you need...

**Clarification on intent types**: See cd.md + IMPLEMENTATION_SPEC_INTENT_CLASSIFIER.md Part 6 examples

**Understanding existing code**: See QUICK_REFERENCE.md or PROJECT_PROPOSAL_CONTEXT.md

**Help with LLM prompt building**: See `generate/route.ts` for existing pattern

**Help with version history**: See proposalFlow.ts for similar patterns

**Help with TypeScript**: See existing utils (proposalSpec.ts, referenceDiscovery.ts)

**Help with tests**: See existing API tests in datacampus (e.g., /api/proposals tests)

---

## 📊 Success Dashboard (Track Weekly)

```
Week 1 Progress:
├─ Day 1: Intent Classifier [████░░░░░░] 40% of day complete
├─ Day 2: Scoped Tools 1-2 [░░░░░░░░░░] 0% of day complete
├─ Day 3: Tool 3 + Versions [░░░░░░░░░░] 0% of day complete
├─ Day 4: Integration [░░░░░░░░░░] 0% of day complete
└─ Day 5: Testing [░░░░░░░░░░] 0% of day complete

Metrics:
├─ Tests passing: 0/50
├─ Code coverage: 0%
├─ TypeScript errors: 0
├─ ESLint warnings: 0
└─ Manual tests passed: 0/20
```

---

## 🎬 Next Step

**Start with**: WEEK1_IMPLEMENTATION_ROADMAP.md → Day 1 section

**Then reference**: IMPLEMENTATION_SPEC_INTENT_CLASSIFIER.md → Part 2 (Intent Classifier)

**Questions?** Check the FAQ above or reference the spec documents.

---

**Last Updated**: 2026-08-14  
**Status**: Ready for implementation  
**Estimated Effort**: 40–50 hours (1 developer, 1 week)  
**Team Size**: 1–2 developers  

