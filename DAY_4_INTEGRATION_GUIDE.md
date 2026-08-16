# Day 4 Integration Guide: Wire Intent Classifier into ask/route.ts

**Timeline**: 1 day (4–6 hours)  
**Scope**: Connect classifier + handlers to the main ask endpoint  
**Dependencies**: Days 1–3 complete (intentClassifier.ts, scoped-edit/route.ts, askIntentHandlers.ts)

---

## Overview

**Current state**: We have:
- ✅ Intent classifier (`intentClassifier.ts`) — classifies user messages
- ✅ 3 scoped edit tools (`scoped-edit/route.ts`) — perform targeted edits
- ✅ Handler functions (`askIntentHandlers.ts`) — route intents to actions
- ⬜ ask/route.ts — still using old "always conversation" logic

**Goal**: Integrate classifier into ask/route.ts so every user message is routed intelligently.

---

## Architecture: Before & After

### Before (Current)
```
User Message
    ↓
ask/route.ts
    ↓
[Always] runModel({...conversation...})
    ↓
Generic LLM conversation reply
```

**Problem**: Can't handle "generate chapter 1" or "change title" — always treats as conversation.

### After (Day 4)
```
User Message
    ↓
ask/route.ts
    ↓
classifyIntent(message)
    ↓
[Decision Tree]
├─ generation      → call /api/proposals/[id]/generate
├─ section_edit    → call /api/proposals/[id]/scoped-edit (regenerateChapterSection)
├─ cover_page_edit → call /api/proposals/[id]/scoped-edit (updateCoverPageField)
├─ front_matter    → call /api/proposals/[id]/scoped-edit (insertFrontMatterPage)
├─ unsupported     → graceful reframe message
└─ chat            → runModel({...conversation...})
    ↓
Smart, contextual response
```

**Benefit**: Same endpoint, but now understands edit requests.

---

## Files to Modify

### 1. ask/route.ts — Main Integration

**Location**: `datacampus/src/app/api/proposals/[id]/ask/route.ts`

**Changes**:
1. Import classifier and handlers
2. Call classifyIntent() after loading project
3. Route based on classification
4. Return appropriate response

---

## Step-by-Step Implementation

### Step 1: Add Imports

Replace this:
```typescript
import { NextRequest, NextResponse } from 'next/server';
import { getAuthedUser } from '@/utils/serverAuth';
import { supabaseServer } from '@/utils/supabaseServerClient';
import { runModel } from '@/utils/models';

export const runtime = 'nodejs';
```

With this:
```typescript
import { NextRequest, NextResponse } from 'next/server';
import { getAuthedUser } from '@/utils/serverAuth';
import { supabaseServer } from '@/utils/supabaseServerClient';
import { runModel } from '@/utils/models';
import { classifyIntent, ClassifierContext } from '@/utils/intentClassifier';
import { routeIntent, AskHandlerInput } from '@/utils/askIntentHandlers';

export const runtime = 'nodejs';
```

---

### Step 2: Add Classifier Call

After project load (line 37), add:

```typescript
  if (projectError || !project) {
    return NextResponse.json({ error: 'Proposal not found' }, { status: 404 });
  }

  // ===== NEW: CLASSIFY INTENT =====
  const classifierContext: ClassifierContext = {
    projectId: id,
    projectMetadata: project.metadata,
    currentChapterKey: project.current_step,
    existingContent: {}, // Could load from proposal_sections if needed
  };

  const classification = await classifyIntent(message, classifierContext);
  // ===== END NEW =====

  const metadata = (project.metadata || {}) as Record<string, unknown>;
  // ... rest of code
```

---

### Step 3: Route Based on Classification

Replace the entire LLM call section (lines 45–68) with:

```typescript
  // ===== ROUTE BASED ON CLASSIFICATION =====
  const handlerInput: AskHandlerInput = {
    projectId: id,
    userId: user.id,
    userMessage: message,
    classification,
    provider,
    model,
    project,
    token: req.headers.get('authorization') || '',
  };

  const handlerResult = await routeIntent(handlerInput);

  if (!handlerResult.ok) {
    return NextResponse.json(
      { error: handlerResult.error || handlerResult.reply },
      { status: handlerResult.httpStatus || 500 }
    );
  }

  return NextResponse.json({
    reply: handlerResult.reply,
    action: handlerResult.action,
    creditSpent: handlerResult.creditSpent,
    balance: handlerResult.balance,
  });
  // ===== END ROUTING =====
```

---

### Step 4: Final Code

Here's the complete modified ask/route.ts:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { getAuthedUser } from '@/utils/serverAuth';
import { supabaseServer } from '@/utils/supabaseServerClient';
import { runModel } from '@/utils/models';
import { classifyIntent, ClassifierContext } from '@/utils/intentClassifier';
import { routeIntent, AskHandlerInput } from '@/utils/askIntentHandlers';

export const runtime = 'nodejs';

type ChapterEntry = { chapter_key?: string; title?: string; content_md?: string };

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getAuthedUser(req);
  if (!user || !supabaseServer) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const message = String(body.message || '').trim();
  const provider = body.provider || process.env.MODEL_PROVIDER || 'local-stub';
  const model = body.model || 'default';

  if (!message) {
    return NextResponse.json({ error: 'Missing message' }, { status: 400 });
  }

  const { data: project, error: projectError } = await supabaseServer
    .from('proposal_projects')
    .select('*')
    .eq('id', id)
    .eq('user_id', user.id)
    .maybeSingle();

  if (projectError || !project) {
    return NextResponse.json({ error: 'Proposal not found' }, { status: 404 });
  }

  // ===== NEW: CLASSIFY INTENT =====
  const classifierContext: ClassifierContext = {
    projectId: id,
    projectMetadata: project.metadata,
    currentChapterKey: project.current_step,
    existingContent: {},
  };

  const classification = await classifyIntent(message, classifierContext);
  // ===== END NEW =====

  // ===== ROUTE BASED ON CLASSIFICATION =====
  const handlerInput: AskHandlerInput = {
    projectId: id,
    userId: user.id,
    userMessage: message,
    classification,
    provider,
    model,
    project,
    token: req.headers.get('authorization') || '',
  };

  const handlerResult = await routeIntent(handlerInput);

  if (!handlerResult.ok) {
    return NextResponse.json(
      { error: handlerResult.error || handlerResult.reply },
      { status: handlerResult.httpStatus || 500 }
    );
  }

  return NextResponse.json({
    reply: handlerResult.reply,
    action: handlerResult.action,
    creditSpent: handlerResult.creditSpent,
    balance: handlerResult.balance,
  });
  // ===== END ROUTING =====
}
```

---

## Testing Checklist

### Unit Tests
- [ ] Run: `npm test -- scoped-edit/tools.test.ts`
- [ ] All 30+ tests pass

### Integration Tests: All 5 Conversation Flows

#### Test 1: Generation Intent
```
Input: "Generate chapter 1"
Classifier: type=generation, confidence=0.95, targetKey=chapter_1
Handler: handleGenerationIntent → POST /api/proposals/[id]/generate
Expected: ✅ Chapter 1 generated, 50 credits, success message
```

Test code:
```bash
curl -X POST http://localhost:3000/api/proposals/abc123/ask \
  -H "Content-Type: application/json" \
  -d '{"message": "Generate chapter 1"}'
```

Expected response:
```json
{
  "reply": "✅ Generated chapter_1. I've created the content and saved it to your proposal.",
  "action": "generation_complete",
  "creditSpent": 50,
  "balance": 50
}
```

---

#### Test 2: Section Edit Intent
```
Input: "Expand section 2.3 with more examples"
Classifier: type=section_edit, confidence=0.9, targetKey=section_2_3, action=expand
Handler: handleSectionEditIntent → POST /api/proposals/[id]/scoped-edit
Expected: ✅ Section 2.3 expanded, 20 credits, version logged
```

Test code:
```bash
curl -X POST http://localhost:3000/api/proposals/abc123/ask \
  -H "Content-Type: application/json" \
  -d '{"message": "Expand section 2.3 with more examples and case studies"}'
```

Expected response:
```json
{
  "reply": "✅ Updated section_2_3 (expand). Changes saved with version history.",
  "action": "section_edit_complete",
  "creditSpent": 20,
  "balance": 30
}
```

---

#### Test 3: Cover Page Edit Intent
```
Input: "Change the title to 'AI Supply Chain System'"
Classifier: type=cover_page_edit, confidence=0.95, targetKey=title
Handler: handleCoverPageEditIntent → POST /api/proposals/[id]/scoped-edit
Expected: ✅ Title updated, 0 credits, instant
```

Test code:
```bash
curl -X POST http://localhost:3000/api/proposals/abc123/ask \
  -H "Content-Type: application/json" \
  -d '{"message": "Change the title to AI Supply Chain System"}'
```

Expected response:
```json
{
  "reply": "✅ Updated cover page: title → \"AI Supply Chain System\"",
  "action": "cover_page_edit_complete",
  "creditSpent": 0
}
```

---

#### Test 4: Unsupported Intent (Reframe)
```
Input: "Fix the page break on page 5"
Classifier: type=unsupported_reframe, confidence=0.95, reason=..., alternatives=[...]
Handler: handleUnsupportedIntent → graceful message
Expected: User shown "I can't do that, but I can..." with alternatives
```

Test code:
```bash
curl -X POST http://localhost:3000/api/proposals/abc123/ask \
  -H "Content-Type: application/json" \
  -d '{"message": "Fix the page break so the diagram is on page 5"}'
```

Expected response:
```json
{
  "reply": "❌ I can't do that directly. Page breaks are determined by the PDF renderer, not the content itself\n\nBut I can help in these ways:\n1. I can rewrite this section to be shorter, which will push content down\n2. I can add a [PAGE_BREAK] marker for you to adjust manually in Word\n\nWould any of these work for you?",
  "action": "unsupported_reframed"
}
```

---

#### Test 5: Conversation Intent
```
Input: "What's in chapter 2 right now?"
Classifier: type=chat, confidence=0.5 (low confidence fallback)
Handler: handleConversationIntent → runModel({...})
Expected: LLM answers conversationally, no mutations
```

Test code:
```bash
curl -X POST http://localhost:3000/api/proposals/abc123/ask \
  -H "Content-Type: application/json" \
  -d '{"message": "What is the current status of chapter 2?"}'
```

Expected response:
```json
{
  "reply": "[LLM response about chapter 2 status based on project metadata]",
  "action": "conversation_answered"
}
```

---

#### Test 6: Front Matter Intent
```
Input: "Add an acknowledgement page"
Classifier: type=front_matter_edit, confidence=0.95, targetKey=acknowledgement
Handler: handleFrontMatterEditIntent → POST /api/proposals/[id]/scoped-edit
Expected: ✅ Acknowledgement page auto-generated and inserted, 0 credits
```

Test code:
```bash
curl -X POST http://localhost:3000/api/proposals/abc123/ask \
  -H "Content-Type: application/json" \
  -d '{"message": "Add an acknowledgement page"}'
```

Expected response:
```json
{
  "reply": "✅ Added acknowledgement page to your proposal. It's been auto-generated; you can edit it if needed.",
  "action": "front_matter_insert_complete",
  "creditSpent": 0
}
```

---

### Edge Cases to Test

1. **Low Balance**
   - Input: "Expand section 2.3" with only 10 credits
   - Expected: 402 "Insufficient credits"

2. **Invalid Field**
   - Input: "Change formatting to bold"
   - Expected: "unsupported_reframe" → "I can't manage formatting"

3. **Ambiguous Message**
   - Input: "something random"
   - Expected: type=chat → conversation response

4. **Missing Required Fields**
   - Input: "Expand section 2.3" but section doesn't exist
   - Expected: Handle gracefully, create if possible or error

5. **LLM Error**
   - Input: LLM service down
   - Expected: 500 error with clear message

---

## Validation Checklist

Before considering Day 4 complete:

- [ ] ask/route.ts imports classifyIntent and routeIntent
- [ ] classifyIntent() called after project load
- [ ] routeIntent() called with proper input
- [ ] Response includes: reply, action, creditSpent, balance
- [ ] All 6 test flows pass
- [ ] Edge cases handled
- [ ] Error messages are clear
- [ ] No breaking changes to existing code
- [ ] Tests run: `npm test -- askIntentHandlers.test.ts`

---

## Files Changed

| File | Type | Changes |
|------|------|---------|
| ask/route.ts | MODIFY | Add classifier call + routing logic |
| askIntentHandlers.ts | NEW | 6 handler functions + router |

---

## Backward Compatibility

✅ **This is safe to deploy**:
- Old ask endpoint response format still works: `{ reply: string }`
- New fields (action, creditSpent, balance) are optional
- Falls back to chat handler if classification fails
- No breaking changes to other endpoints

---

## What Happens Next (Day 5)

### Manual Testing
- [ ] Test all 5 flows with real users/projects
- [ ] Verify credit deductions
- [ ] Check version history logging
- [ ] Confirm performance (<1 sec per request)

### Deployment
- [ ] Run migration: `proposal_section_versions.sql`
- [ ] Deploy ask/route.ts changes
- [ ] Monitor logs for errors
- [ ] Update user-facing documentation

### Rollback Plan
If critical issues found:
1. Revert ask/route.ts to old version (always conversation)
2. This disables intelligent routing but keeps all tools available
3. No data loss or credit issues

---

## Summary

**After Day 4 integration**:
- ✅ Intent classifier active
- ✅ 3 scoped edit tools connected
- ✅ Graceful degradation for unsupported requests
- ✅ All conversation flows working

**System now delivers**: "Edit intelligently" instead of "regenerate everything" 🎯

The DataCampus proposal system is ready for production testing!
