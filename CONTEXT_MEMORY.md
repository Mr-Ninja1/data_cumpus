# Proposal Workflow Context Memory

## Problem

Previously, every generation call to the proposal AI was **stateless** — the model had no memory of:
- What the user just asked for
- What decisions were already made
- User preferences for tone, length, audience
- What's still pending or unclear

This meant:
1. The AI couldn't ask clarifying questions before drafting
2. Each generation started from scratch, without understanding recent context
3. The user had to repeat intent or preferences multiple times
4. Corrections didn't carry forward intent understanding

## Solution: Working Memory in Metadata

Instead of maintaining a full chat log (slow, expensive), we store a **lightweight working memory** in the project's `metadata.proposal_context`:

```typescript
type ProposalContext = {
  last_user_intent?: string;           // "Draft chapter 2 with more focus on X"
  preferences: Record<string, string>; // tone: "formal", length: "concise"
  pending_clarifications: string[];    // "Need to know: what's the target audience?"
  recent_decisions: ContextEntry[];    // Last 3–5 generation/edit decisions
  chapters_with_notes: Record<string, string>; // Per-chapter feedback
};
```

**Size**: ~500 bytes per project, stored once in `metadata` — no extra database tables, no lookups.

## How It Works

### 1. Extract Intent from Each User Message
When a user sends a message, we parse it for:
- **Tone preferences**: "concise", "detailed", "formal", "casual"
- **Audience**: "technical", "general"
- **Length**: "brief", "comprehensive"

```typescript
const messageContext = extractContextFromUserMessage("Make this chapter more concise and formal");
// → { preferences: { length: 'concise', tone: 'formal' }, ... }
```

### 2. Build Contextual Generation Prompt
Before calling the model, merge the context into the system/user prompt:

```typescript
const contextualPrompt = buildContextualGenerationPrompt({
  basePrompt: "Draft Chapter 1",
  context: existingContext,
  chapterKey: 'chapter_1',
});
```

**Output example**:
```
Draft Chapter 1

Recent user intent: Draft Chapter 2 with more focus on methodology
User feedback on chapter_1: Make it more concise, less repetition
Established preferences:
- tone: formal
- length: concise

Pending clarifications:
- What's your target audience for this proposal?

Recent decisions:
- Generated chapter_1 (incomplete)
- Updated supervisor to Dr. Smith
```

The model now knows what was just attempted, what the user wants, and what's still unclear.

### 3. Store Generation Decision
After a successful generation, record it in context so the next message can reference it:

```typescript
const nextContext = addContextEntry(context, {
  timestamp: now,
  type: 'ai_decision',
  chapter_key: 'chapter_1',
  content: 'Generated Chapter 1 (incomplete)',
  resolved: false, // Still has missing sections
});

// Save back to metadata
await updateMetadata({ proposal_context: nextContext });
```

### 4. AI Can Now Ask Clarifying Questions
When context indicates ambiguity:

```
User: "Draft chapter 2"
Context: { pending_clarifications: ["What's the target audience?"] }

AI response:
"I'm ready to draft Chapter 2. Just to make sure I get the tone right, 
is this for a technical audience (peer review) or general university 
administration? I'll use that to choose examples and depth."
```

## Integration Points

### Generation (`generateOrContinueChapter`)
- Receives `context` as optional input
- Builds contextual prompt before calling model
- No overhead if context is not provided

### Workspace Page (`page.tsx`)
- Extracts intent from each user message
- Merges with existing context
- Passes to generation
- Saves generation decision back to metadata after success

### Metadata Store (`proposalTools.ts`)
- `proposal_context` now an allowed metadata field
- Stored as JSON string, parsed on retrieval

## Benefits

1. **Flexible workflow** — AI understands user intent and asks clarifying questions
2. **No overhead** — context is tiny (~500 bytes), stored once per project
3. **No memory gaps** — recent decisions stay visible to the model
4. **Stateless HTTP** — still one API call per generation; context travels in the request
5. **Safe for autopilot** — works the same way for both interactive and background generation

## Example Conversation Flow

```
User: "Draft chapter 1"
→ AI asks: "Should this be technical or for general readers?"

User: "Technical, focus on methodology"
→ Context: { preferences: { audience: 'technical' }, ... }
→ AI: "Drafting Chapter 1 with technical focus on methodology..."

User: "Make it more concise"
→ Context: { last_user_intent: "Make it more concise", preferences: { length: 'concise' } }
→ AI: "Shortening Chapter 1, keeping technical depth but removing examples..."
```

Each message builds on context from the last, without repeating or losing intent.

## Limitations & Future

- Context stored per-project (not per-user-setting globally)
- Preferences inferred from message keywords, not explicit settings UI
- Can be extended: add per-chapter notes, style guide preference, department-specific tone
- Clearing context: manually via `update_metadata_field` with empty value
