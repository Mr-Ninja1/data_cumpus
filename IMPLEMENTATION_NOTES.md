# Context Memory Implementation Details

## Files Changed

### 1. `src/utils/proposalContextMemory.ts` (NEW)
**Purpose**: Define and manage working memory structure.

**Key Exports**:
- `ProposalContext` type: Stores intent, preferences, decisions, pending questions
- `buildContextualGenerationPrompt()`: Merges context into the system/user prompt
- `extractContextFromUserMessage()`: Parses user message for tone/length/audience signals
- `addContextEntry()`: Records generation decisions, keeps recent history only

**No dependencies on HTTP/DB** — purely data structures and string builders. Used by both workspace and generation engine.

### 2. `src/utils/chapterGenerationEngine.ts` (MODIFIED)
**Added**: 
```typescript
import { buildContextualGenerationPrompt, type ProposalContext } from './proposalContextMemory';

export type GenerateChapterInput = {
  // ... existing fields ...
  context?: ProposalContext;
};
```

**Logic**:
1. Receives optional `context` in input
2. Builds `contextualUserPrompt` by merging context if provided
3. Uses `contextualUserPrompt` instead of raw `userPrompt` in `modelInput`
4. No behavior change if `context` is undefined

**Impact**: Minimal — just adds prompt enrichment. Generation works identically with or without context.

### 3. `src/app/workspace/proposals/[id]/page.tsx` (MODIFIED)
**Added**:
```typescript
import { extractContextFromUserMessage, addContextEntry, type ProposalContext } from '@/utils/proposalContextMemory';

// In sendMessage():
const messageContext = extractContextFromUserMessage(trimmedInput);
const existingContext = (project?.metadata?.proposal_context as ProposalContext) || { /* defaults */ };
const updatedContext = { ...existingContext, ...messageContext };

// Pass to generation:
body: JSON.stringify({
  // ... existing fields ...
  context: updatedContext,
}),

// After successful generation:
await fetch(`/api/proposals/${params.id}/edit`, {
  method: 'POST',
  body: JSON.stringify({
    action: {
      tool: 'update_metadata_field',
      field: 'proposal_context',
      value: JSON.stringify(nextContext), // Store as JSON string
    },
  }),
}).catch(() => {}); // Fail silently — context is best-effort
```

**Behavior**:
1. Extract user intent/preferences from message text
2. Load existing context from `project?.metadata?.proposal_context`
3. Merge new signals with existing context
4. Pass merged context to generation
5. After generation, record decision and save back to metadata

**Best-effort approach**: If context save fails (network error, etc.), generation still succeeded — context is optional, not critical.

### 4. `src/utils/proposalTools.ts` (MODIFIED)
**Added**:
```typescript
export const ALLOWED_METADATA_FIELDS = new Set([
  // ... existing ...
  'proposal_context',
]);

export function updateMetadataField(metadata, field, value) {
  // ... validation ...
  let finalValue: unknown = value;
  if (field === 'proposal_context' && typeof value === 'string') {
    try {
      finalValue = JSON.parse(value);
    } catch {
      // Keep as string if not valid JSON
    }
  }
  return { ok: true, metadata: { ...metadata, [field]: finalValue } };
}
```

**Purpose**: Allow the edit/metadata endpoint to accept and store context objects.

## Data Flow

### User Message → Generation with Context

```
1. User types: "Draft chapter 2, but more concise this time"
   ↓
2. sendMessage() extracts:
   - messageContext: { preferences: { length: 'concise' }, ... }
   ↓
3. Load existing context from metadata:
   - existingContext: { last_user_intent: "...", preferences: {...}, ... }
   ↓
4. Merge:
   - updatedContext: { ...existingContext, ...messageContext }
   ↓
5. POST /api/proposals/[id]/generate
   body: { sectionKey: 'chapter_2', context: updatedContext, ... }
   ↓
6. generateOrContinueChapter(input):
   - Takes input.context
   - Builds contextualUserPrompt with it
   - Calls model with enriched prompt
   ↓
7. Model sees:
   "Recent user intent: Draft chapter 2, but more concise
    Established preferences: length: concise
    Recent decisions: Generated chapter 1..."
   ↓
8. Model generates with this awareness
   ↓
9. Back in workspace, after success:
   - Create nextContext with generation decision
   - POST /api/proposals/[id]/edit
     { action: { tool: 'update_metadata_field', 
                  field: 'proposal_context', 
                  value: JSON.stringify(nextContext) } }
```

### Generation Workflow With Context Awareness

```
sendMessage()
  ├─ extractContextFromUserMessage(input)
  ├─ load existingContext from metadata
  ├─ merge → updatedContext
  ├─ POST /api/proposals/[id]/generate { context: updatedContext }
  │
  └─ generateOrContinueChapter(input)
     ├─ receives input.context (optional)
     ├─ build specGuidance, referencesContext, etc. (same as before)
     ├─ buildContextualGenerationPrompt(basePrompt, context)
     │  └─ returns userPrompt with context info prepended
     ├─ modelInput = specGuidance + ... + contextualUserPrompt
     ├─ runModel(system, messages: [{ role: 'user', content: modelInput }])
     │  └─ model now has full context in one prompt
     └─ return responseText
```

### Context Storage

```
proposal_projects.metadata
├─ stage: 'initial_proposal'
├─ chapters: [...]
├─ references: [...]
├─ proposal_context: {
│  ├─ last_user_intent: "Draft chapter 2, be concise"
│  ├─ preferences: { length: 'concise', tone: 'formal' }
│  ├─ pending_clarifications: ["Target audience?"]
│  ├─ recent_decisions: [
│  │  ├─ { type: 'ai_decision', chapter_key: 'chapter_1', content: '...', ... }
│  │  └─ { type: 'user_preference', content: '...', ... }
│  └─ chapters_with_notes: { chapter_1: "User wants..." }
└─ [other metadata fields...]
```

**Size**: ~1–2 KB per project (5–10 context entries max, ~100–200 bytes each).

## No Breaking Changes

- Generation works identically without context (all fields optional)
- Workspace gracefully handles missing context (uses defaults)
- Autopilot doesn't pass context, works as before
- All existing calls remain valid

## Testing & Validation

**To test context memory**:

1. Open workspace, draft a chapter
2. In browser DevTools, inspect the POST body to `/api/proposals/[id]/generate`
   - Should contain `context: { ... }`
3. Send a follow-up message: "Make it more concise"
   - DevTools: new POST should include `preferences: { length: 'concise' }`
4. Export or refresh project
   - Check `metadata.proposal_context` in DB — should have recent decisions

**Key signals**:
- If context is `undefined` in requests, feature is disabled (safe, no regression)
- If context is present but unused in prompt, that's OK (graceful degradation)
- If context save fails, generation still works (error logged, context attempt skipped)

## Future Extensions

1. **Explicit preference UI**: Radio buttons for tone, audience, length
   - Instead of parsing keywords, store explicit choices
2. **Per-chapter notes**: `{ chapter_1: "User feedback about this chapter" }`
   - Help model remember what to improve specifically
3. **Style guide injection**: Store department-specific writing style
   - Reuse across all chapters
4. **Context expiration**: Mark decisions as resolved/stale after N days
   - Keep only recent, relevant history
5. **User feedback loop**: "That tone was perfect" → strengthen preference signal

These are all backward-compatible additions to the same `ProposalContext` structure.
