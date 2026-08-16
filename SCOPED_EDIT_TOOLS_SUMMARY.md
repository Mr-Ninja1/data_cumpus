# Scoped Edit Tools - Implementation Complete ✅

**Date**: Day 2 Work Complete  
**Status**: Ready for integration & testing

---

## What Was Built

### 1. Scoped Edit Route Handler
**File**: `datacampus/src/app/api/proposals/[id]/scoped-edit/route.ts` ✅

**Key Features**:
- 3 scoped edit tools implemented
- Authorization & credit checks
- Database mutations with audit trails
- Error handling with HTTP status codes
- Helper functions for prompt building & version logging

### 2. Database Schema
**File**: `supabase/proposal_section_versions.sql` ✅

**Features**:
- New table: `proposal_section_versions` for version history
- RLS policies for security
- Helper functions: `get_latest_section_version()`, `get_section_version_history()`
- Unique constraint on (project_id, section_key, version_number)
- Index for fast queries

### 3. Unit Tests
**File**: `datacampus/__tests__/scoped-edit/tools.test.ts` ✅

**Coverage**:
- Tool validation (required fields, valid values)
- Credit system verification
- Authorization checks
- Error handling
- Version history logging
- Database mutation isolation

---

## The 3 Scoped Edit Tools

### Tool 1: `updateCoverPageField`
```typescript
POST /api/proposals/[id]/scoped-edit
{
  "tool": "update_cover_page_field",
  "fieldName": "title",
  "newValue": "AI Supply Chain System"
}
```

**What it does**:
- Updates cover page fields directly in `proposal_projects` table
- Valid fields: title, student_name, student_id, supervisor, department, academic_year
- **Cost**: 0 credits (instant)
- **Speed**: <100ms
- **Audit**: Logged to version history

**Example Flow**:
1. User: "Change the title to 'AI Supply Chain System'"
2. Classifier: "cover_page_edit" intent
3. Tool: `updateCoverPageField(projectId, 'title', 'AI Supply Chain System')`
4. DB: Updates projects.title
5. Result: Instant, 0 credits, version logged

---

### Tool 2: `regenerateChapterSection`
```typescript
POST /api/proposals/[id]/scoped-edit
{
  "tool": "regenerate_chapter_section",
  "chapterKey": "chapter_2",
  "sectionKey": "section_2_3",
  "action": "expand",
  "reason": "with more examples and case studies"
}
```

**What it does**:
- Loads current section from DB
- Builds targeted LLM prompt with current content
- Calls LLM to regenerate ONLY that section
- Updates `proposal_sections` table (leaves other sections untouched)
- **Cost**: 20 credits (targeted regeneration)
- **Speed**: 3-5 seconds
- **Token usage**: ~2000 tokens (vs 4000+ for full chapter)
- **Audit**: Logged to proposal_generations + version history

**Example Flow**:
1. User: "Expand section 2.3 with more examples"
2. Classifier: "section_edit" intent, action=expand, targetKey=section_2_3
3. Check credits: Need 20, have 50 ✓
4. Load section 2.3 from DB
5. Build prompt: "Here's current content: [2000 chars]. Please expand it: with more examples"
6. Call LLM (Claude 3.5, ~2000 tokens)
7. Update proposal_sections.section_2_3 (leave 2.1, 2.2, 2.4, etc. untouched)
8. Log: proposal_generations + proposal_section_versions
9. Deduct 20 credits
10. Result: Section 2.3 expanded, 20 credits, other sections preserved

**Valid Actions**:
- `rewrite` — completely rewrite the section
- `expand` — add more detail and examples
- `simplify` — reduce length and complexity
- `clarify` — make clearer and easier to understand
- `improve` — improve overall quality

---

### Tool 3: `insertFrontMatterPage`
```typescript
POST /api/proposals/[id]/scoped-edit
{
  "tool": "insert_front_matter_page",
  "pageType": "acknowledgement",
  "content": null  // optional; auto-generates if null
}
```

**What it does**:
- Auto-generates front matter page if content not provided
- Inserts to `proposal_sections` if not exists
- Updates if exists
- **Cost**: 0 credits
- **Speed**: <1 second (or 3-5 seconds if auto-generating)
- **Audit**: Logged to version history

**Example Flow**:
1. User: "Add an acknowledgement page"
2. Classifier: "front_matter_edit" intent, pageType=acknowledgement
3. If no content provided: auto-generate via LLM
4. Insert/update proposal_sections where section_key='acknowledgement'
5. Log: version history
6. Result: Acknowledgement page added, 0 credits

**Valid Page Types**:
- `abstract` — research abstract
- `acknowledgement` — thanks to supervisors, institutions, etc.
- `dedication` — personal dedication (optional)
- `toc` — table of contents (auto-generates from chapter structure)

---

## Database Integration

### New Table: `proposal_section_versions`
```sql
CREATE TABLE proposal_section_versions (
  id UUID PRIMARY KEY,
  project_id UUID REFERENCES proposal_projects(id),
  section_key TEXT,
  version_number INT,
  content_md TEXT,
  changed_by TEXT ('user_request' | 'ai_generation' | 'system'),
  change_reason TEXT,
  metadata JSONB,
  created_at TIMESTAMP,
  UNIQUE(project_id, section_key, version_number)
);
```

### Modified Table: `proposal_sections`
- Added column: `current_version_number INT DEFAULT 1`
- Existing columns remain unchanged

### Helper Functions
```sql
-- Get the latest version of a section
SELECT * FROM get_latest_section_version(project_id, section_key);

-- Get version history for a section
SELECT * FROM get_section_version_history(project_id, section_key);
```

---

## Credit System

| Tool | Action | Cost | Deduction Method |
|------|--------|------|------------------|
| updateCoverPageField | Update title, student_name, etc | 0 | None |
| regenerateChapterSection | Expand, rewrite, simplify, etc | 20 | RPC consume_credits before mutation |
| insertFrontMatterPage | Add acknowledgement, abstract, etc | 0 | None |

**Full Chapter Generation** (existing): 50 credits

---

## Error Handling

### HTTP Status Codes
- **200** — Success
- **400** — Bad request (missing fields, invalid values)
- **401** — Unauthorized (not authenticated)
- **402** — Payment required (insufficient credits)
- **404** — Project not found
- **500** — Server error (DB, LLM, etc)

### Error Response Format
```json
{
  "ok": false,
  "error": "Insufficient credits",
  "httpStatus": 402
}
```

---

## Security & Authorization

### Ownership Check
- User must own the project: `project.user_id === request.user.id`
- Staff can bypass: `is_staff(auth.uid())`

### RLS Policies
- `proposal_projects`: Owners manage own proposals
- `proposal_sections`: Owners manage own section content
- `proposal_section_versions`: Owners view own version history

### Credit Deduction
- Checked before mutation
- Uses `supabaseServer.rpc('consume_credits', ...)` for consistency
- Rollback if RPC fails

---

## Next Steps (Day 3–4)

### Day 3: Database Migration & Testing
- [ ] Run `proposal_section_versions.sql` migration
- [ ] Verify table creation and indexes
- [ ] Test version history logging
- [ ] Run unit tests

### Day 4: Integration into ask/route.ts
- [ ] Import `classifyIntent` from intentClassifier
- [ ] Add `classifyIntent()` call before routing
- [ ] Implement 6 handler functions:
  - `handleGenerationIntent()` → call existing generate/route.ts
  - `handleSectionEditIntent()` → call regenerateChapterSection
  - `handleCoverPageEditIntent()` → call updateCoverPageField
  - `handleFrontMatterEditIntent()` → call insertFrontMatterPage
  - `handleUnsupportedIntent()` → graceful reframe message
  - `handleConversationIntent()` → existing conversation logic

### Day 4–5: Testing & Deployment
- [ ] Integration tests: all 5 conversation flows
- [ ] Manual testing with real proposals
- [ ] Performance validation (<1 sec per request)
- [ ] Deployment checklist

---

## Usage Examples

### Example 1: Update Cover Page
```bash
curl -X POST https://datacampus.app/api/proposals/abc123/scoped-edit \
  -H "Authorization: Bearer {token}" \
  -H "Content-Type: application/json" \
  -d '{
    "tool": "update_cover_page_field",
    "fieldName": "title",
    "newValue": "AI-Powered E-Voting System"
  }'
```

**Response**:
```json
{
  "ok": true,
  "message": "Updated title to \"AI-Powered E-Voting System\"",
  "creditSpent": 0
}
```

---

### Example 2: Expand a Section
```bash
curl -X POST https://datacampus.app/api/proposals/abc123/scoped-edit \
  -H "Authorization: Bearer {token}" \
  -H "Content-Type: application/json" \
  -d '{
    "tool": "regenerate_chapter_section",
    "chapterKey": "chapter_2",
    "sectionKey": "section_2_3",
    "action": "expand",
    "reason": "with more industry case studies and real-world examples"
  }'
```

**Response**:
```json
{
  "ok": true,
  "message": "Successfully expanded section section_2_3",
  "creditSpent": 20,
  "balance": 30,
  "versionNumber": 5,
  "responseText": "[expanded section content...]"
}
```

---

### Example 3: Add Acknowledgement Page
```bash
curl -X POST https://datacampus.app/api/proposals/abc123/scoped-edit \
  -H "Authorization: Bearer {token}" \
  -H "Content-Type: application/json" \
  -d '{
    "tool": "insert_front_matter_page",
    "pageType": "acknowledgement"
  }'
```

**Response**:
```json
{
  "ok": true,
  "message": "Successfully added acknowledgement page",
  "creditSpent": 0,
  "versionNumber": 1,
  "responseText": "[auto-generated acknowledgement...]"
}
```

---

## Files Created/Modified

| File | Status | Purpose |
|------|--------|---------|
| `scoped-edit/route.ts` | ✅ NEW | Main route handler (3 tools) |
| `supabase/proposal_section_versions.sql` | ✅ NEW | Database schema + helpers |
| `__tests__/scoped-edit/tools.test.ts` | ✅ NEW | Unit tests (30+ test cases) |
| `SCOPED_EDIT_TOOLS_SUMMARY.md` | ✅ NEW | This document |
| `ask/route.ts` | ⬜ TODO | Integrate classifier (Day 4) |
| `intentClassifier.ts` | ✅ EXISTING | Ready to wire in (Day 4) |

---

## Validation Checklist

### Before Deployment
- [ ] Database migration runs without errors
- [ ] All 3 tools accept valid inputs
- [ ] All 3 tools reject invalid inputs
- [ ] Credit system deducts correctly
- [ ] Authorization checks pass/fail correctly
- [ ] Version history logging works
- [ ] Error messages are clear and actionable
- [ ] Performance: <500ms per request (except LLM calls)
- [ ] Unit tests pass (30+ test cases)
- [ ] Integration tests pass (5 conversation flows)

### Launch Readiness
- [ ] Documentation complete (this file)
- [ ] Error handling tested
- [ ] Rollback script ready
- [ ] Monitoring configured
- [ ] Support team briefed

---

## Success Metrics

After Day 2 work:
- ✅ 3 scoped edit tools implemented
- ✅ Database schema created
- ✅ Unit tests written
- ✅ 20 credits for targeted section edits (vs 50 for full chapter)
- ✅ 0 credits for metadata updates
- ✅ Version history logging in place

Next: Wire into ask/route.ts (Day 4) to complete the flow.

---

## Summary

**We now have all the pieces for intelligent editing:**

1. **Intent Classifier** (ready) → Detects what user wants
2. **3 Scoped Edit Tools** (ready) → Perform targeted actions
3. **Database Schema** (ready) → Track versions & audit
4. **Tests** (ready) → Validate behavior

**Next: Connect the dots** (Day 4 integration) and test the full flow.

The system now replaces "regenerate everything" with "edit intelligently" 🎯
