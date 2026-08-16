# Quick Build Reference - Days 2–3 ✅ Complete

**Status**: Scoped edit tools & database schema ready. Awaiting Day 4 integration.

---

## Files Created/Ready

| File | Lines | Purpose | Status |
|------|-------|---------|--------|
| `scoped-edit/route.ts` | 450+ | 3 edit tools | ✅ READY |
| `askIntentHandlers.ts` | 350+ | Intent routing | ✅ READY |
| `proposal_section_versions.sql` | 150+ | DB schema + helpers | ✅ READY |
| `tools.test.ts` | 200+ | Unit tests (30+ cases) | ✅ READY |
| `intentClassifier.ts` | 430 | Intent detection | ✅ (Day 1) |

---

## The 3 Tools

### Tool 1: `updateCoverPageField`
```typescript
POST /api/proposals/[id]/scoped-edit
{
  "tool": "update_cover_page_field",
  "fieldName": "title", // "student_name", "supervisor", etc.
  "newValue": "New Title"
}
```
- **Cost**: 0 credits
- **Speed**: <100ms
- **Example**: Change title instantly

---

### Tool 2: `regenerateChapterSection`
```typescript
POST /api/proposals/[id]/scoped-edit
{
  "tool": "regenerate_chapter_section",
  "chapterKey": "chapter_2",
  "sectionKey": "section_2_3",
  "action": "expand", // "rewrite", "simplify", "clarify", "improve"
  "reason": "with more examples"
}
```
- **Cost**: 20 credits (vs 50 for full chapter)
- **Speed**: 3–5s (LLM call)
- **Example**: Expand one section without touching others

---

### Tool 3: `insertFrontMatterPage`
```typescript
POST /api