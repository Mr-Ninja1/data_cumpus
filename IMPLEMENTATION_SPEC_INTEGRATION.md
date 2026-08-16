# Implementation Spec: Integration & Validation

**Companion to**: IMPLEMENTATION_SPEC_INTENT_CLASSIFIER.md  
**Covers**: Days 4–5 of implementation (Integration + Testing)

---

## Part 1: Integration Points

### 1.1 Modify `/api/proposals/[id]/ask/route.ts`

**Location**: `datacampus/src/app/api/proposals/[id]/ask/route.ts`

**Change**: Add intent classification before routing to handler

```typescript
import { classifyIntent } from "@/utils/intentClassifier"
import { buildUnsupportedIntentResponse } from "@/utils/gracefulDegradation"
import { 
  updateCoverPageField,
  regenerateChapterSection,
  insertFrontMatterPage 
} from "@/app/api/proposals/[id]/scoped-edit/route"

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const { sectionKey, chapterKey, promptText, attachments, references } = await request.json()
  
  // ... existing auth + validation code ...
  
  // NEW: Classify intent
  const classification = await classifyIntent(promptText, {
    projectId: id,
    projectMetadata: project.metadata,
    currentChapterKey: project.metadata.workflow?.current_chapter_key,
    currentSectionKey: project.metadata.workflow?.current_section_key,
    existingContent: chapterStore
  })
  
  // NEW: Route based on classification
  switch (classification.type) {
    case "generation":
      return await handleGenerationIntent(
        classification,
        project,
        token,
        references,
        attachments
      )
    
    case "section_edit":
      return await handleSectionEditIntent(
        classification,
        project,
        token,
        promptText
      )
    
    case "cover_page_edit":
      return await handleCoverPageEditIntent(
        classification,
        project,
        promptText
      )
    
    case "front_matter_edit":
      return await handleFrontMatterEditIntent(
        classification,
        project,
        token,
        promptText
      )
    
    case "unsupported_reframe":
      return await handleUnsupportedIntent(classification)
    
    case "chat":
    default:
      return await handleConversationIntent(
        promptText,
        project,
        messages,
        token
      )
  }
}

// Handler functions (NEW)

async function handleGenerationIntent(
  classification: IntentClassification,
  project: any,
  token: string,
  references: any[],
  attachments: any[]
) {
  // Route to existing generate logic
  // This is the existing flow that already works
  return await generateChapter(
    project.id,
    classification.targetKey,
    classification.targetKey,
    "User requested generation",
    token,
    references,
    attachments
  )
}

async function handleSectionEditIntent(
  classification: IntentClassification,
  project: any,
  token: string,
  userMessage: string
) {
  try {
    const response = await regenerateChapterSection(
      project.id,
      extractChapterKeyFromSection(classification.targetKey),
      classification.targetKey,
      userMessage,
      classification.requestedAction || "rewrite",
      token
    )
    
    if (response.success) {
      return {
        status: 200,
        message: response.message,
        regenerated: response.regenerated,
        nextSuggestion: `Section ${classification.targetKey} has been ${classification.requestedAction}. Would you like to continue with the next section or refine this one further?`
      }
    } else {
      return {
        status: 400,
        message: response.message,
        error: true
      }
    }
  } catch (error) {
    return {
      status: 500,
      message: `Error regenerating section: ${error.message}`,
      error: true
    }
  }
}

async function handleCoverPageEditIntent(
  classification: IntentClassification,
  project: any,
  userMessage: string
) {
  try {
    // Extract the new value from user message
    const newValue = extractValueFromMessage(userMessage, classification.targetKey)
    
    if (!newValue) {
      return {
        status: 400,
        message: `I couldn't extract the new ${classification.targetKey} from your message. Can you provide it more clearly?`,
        error: true
      }
    }
    
    const response = await updateCoverPageField(
      project.id,
      classification.targetKey,
      newValue
    )
    
    if (response.success) {
      return {
        status: 200,
        message: response.message,
        updated: response.updated,
        nextSuggestion: "Cover page updated. Check the preview on the right to verify."
      }
    } else {
      return {
        status: 400,
        message: response.message,
        error: true
      }
    }
  } catch (error) {
    return {
      status: 500,
      message: `Error updating field: ${error.message}`,
      error: true
    }
  }
}

async function handleFrontMatterEditIntent(
  classification: IntentClassification,
  project: any,
  token: string,
  userMessage: string
) {
  try {
    // For front matter, we might auto-generate or ask user for content
    const pageType = classification.targetKey as "abstract" | "acknowledgement" | "dedication"
    
    // Try to extract manual content first
    let content = extractContentFromMessage(userMessage, pageType)
    
    if (!content) {
      // Auto-generate if user didn't provide content
      content = await generateFrontMatterContent(
        project,
        pageType,
        token
      )
    }
    
    const response = await insertFrontMatterPage(
      project.id,
      pageType,
      content,
      token
    )
    
    if (response.success) {
      return {
        status: 200,
        message: response.message,
        inserted: response.inserted,
        nextSuggestion: `${pageType} page ${response.inserted ? "inserted" : "updated"}. Review and edit if needed.`
      }
    } else {
      return {
        status: 400,
        message: response.message,
        error: true
      }
    }
  } catch (error) {
    return {
      status: 500,
      message: `Error with front matter: ${error.message}`,
      error: true
    }
  }
}

async function handleUnsupportedIntent(
  classification: IntentClassification
) {
  const { response, suggestions } = buildUnsupportedIntentResponse(classification)
  
  return {
    status: 400,
    message: response,
    unsupported: true,
    alternatives: suggestions,
    // Offer conversation fallback
    canTry: [
      "Ask me to rewrite or expand this section instead",
      "Tell me what content is missing",
      "Ask me a question about the proposal"
    ]
  }
}

async function handleConversationIntent(
  userMessage: string,
  project: any,
  messages: any[],
  token: string
) {
  // Route to existing conversation handler
  // This is the existing flow that already works
  return await continueConversation(
    project.id,
    userMessage,
    messages,
    token
  )
}

// Helper functions

function extractChapterKeyFromSection(sectionKey: string): string {
  // "section_1_2" → "chapter_1"
  const chapterNum = sectionKey.split("_")[1]
  return `chapter_${chapterNum}`
}

function extractValueFromMessage(message: string, fieldName: string): string | null {
  // Extract new value from message
  // "Change title to 'My New Title'" → "My New Title"
  
  const quoted = message.match(/'([^']+)'|"([^"]+)"/)?.[1] || message.match(/'([^']+)'|"([^"]+)"/)?.[2]
  if (quoted) return quoted
  
  // Fallback: extract after "to" keyword
  const toMatch = message.match(/to\s+([^,]+?)(?:\.|$)/i)
  if (toMatch) return toMatch[1].trim()
  
  return null
}

function extractContentFromMessage(message: string, pageType: string): string | null {
  // Check if user provided actual content (multi-line, quote-enclosed, etc.)
  const lines = message.split("\n")
  
  // If user provided multiple lines, treat as content
  if (lines.length > 3) {
    return message.trim()
  }
  
  // Check for quote-enclosed content
  const quoted = message.match(/["`]{2,}[\s\S]+["`]{2,}/)
  if (quoted) return quoted[0].replace(/["`]{2,}/g, "").trim()
  
  return null
}

async function generateFrontMatterContent(
  project: any,
  pageType: string,
  token: string
): Promise<string> {
  // Use LLM to auto-generate front matter
  const prompts: Record<string, string> = {
    "abstract": `Write a concise abstract (150–250 words) for a project titled "${project.title}" in the department of ${project.department}. The abstract should summarize the project's aim, methodology, and expected outcomes.`,
    "acknowledgement": `Write a brief acknowledgement (100–150 words) for a student at ${project.department} to thank their supervisor (${project.supervisor}) and institution.`,
    "dedication": `Write a short dedication (50–100 words) for a student project. Keep it personal and meaningful.`
  }
  
  const response = await callLLM({
    systemPrompt: `You are writing ${pageType} for an academic proposal.`,
    userPrompt: prompts[pageType],
    maxTokens: 500
  })
  
  return response
}
```

---

## Part 2: Test Cases

### 2.1 Integration Tests

**File**: `datacampus/src/app/api/proposals/[id]/ask/__tests__/integration.test.ts` (NEW)

```typescript
import { POST } from "../route"
import { classifyIntent } from "@/utils/intentClassifier"
import { createMockRequest } from "@/utils/test-helpers"

describe("/api/proposals/[id]/ask with intent classifier", () => {
  
  let projectId: string
  let mockProject: any
  let mockToken: string
  
  beforeEach(async () => {
    // Setup: create test project
    projectId = "test-project-123"
    mockProject = {
      id: projectId,
      title: "AI-Powered System",
      department: "Computer Science",
      supervisor: "Dr. Smith",
      metadata: {
        workflow: {
          current_chapter_key: "chapter_1",
          current_section_key: "section_1_1"
        }
      }
    }
    mockToken = "test-token"
  })
  
  describe("Generation Intent", () => {
    test("should route 'Generate chapter 1' to generation handler", async () => {
      const request = createMockRequest({
        promptText: "Generate chapter 1",
        projectId
      })
      
      const response = await POST(request, { params: { id: projectId } })
      const data = await response.json()
      
      expect(response.status).toBe(200)
      expect(data.generationStarted).toBe(true)
    })
    
    test("should route 'Write chapter 2' to generation handler", async () => {
      const request = createMockRequest({
        promptText: "Write chapter 2",
        projectId
      })
      
      const response = await POST(request, { params: { id: projectId } })
      const data = await response.json()
      
      expect(response.status).toBe(200)
      expect(data.targetKey).toBe("chapter_2")
    })
  })
  
  describe("Section Edit Intent", () => {
    test("should route 'Expand section 2.3' to scoped edit tool", async () => {
      const request = createMockRequest({
        promptText: "Expand section 2.3 with more details",
        projectId
      })
      
      const response = await POST(request, { params: { id: projectId } })
      const data = await response.json()
      
      expect(response.status).toBe(200)
      expect(data.regenerated).toBeDefined()
      expect(data.regenerated.sectionKey).toBe("section_2_3")
    })
    
    test("should route 'Simplify section 1.2' to scoped edit tool", async () => {
      const request = createMockRequest({
        promptText: "Make section 1.2 (Problem Statement) simpler and clearer",
        projectId
      })
      
      const response = await POST(request, { params: { id: projectId } })
      const data = await response.json()
      
      expect(response.status).toBe(200)
      expect(data.nextSuggestion).toContain("Section")
    })
    
    test("should preserve credit cost differently for section edit vs generation", async () => {
      // Section edit = 20 credits
      // Full generation = 50 credits
      // This is a cost verification
      expect(true).toBe(true) // Placeholder
    })
  })
  
  describe("Cover Page Edit Intent", () => {
    test("should route 'Change title to X' to cover page editor", async () => {
      const request = createMockRequest({
        promptText: "Change the title to 'Advanced AI System'",
        projectId
      })
      
      const response = await POST(request, { params: { id: projectId } })
      const data = await response.json()
      
      expect(response.status).toBe(200)
      expect(data.updated).toBeDefined()
      expect(data.updated.fieldName).toBe("title")
      expect(data.updated.newValue).toBe("Advanced AI System")
    })
    
    test("should route 'Update supervisor to X' to cover page editor", async () => {
      const request = createMockRequest({
        promptText: "Update supervisor to Dr. Johnson",
        projectId
      })
      
      const response = await POST(request, { params: { id: projectId } })
      const data = await response.json()
      
      expect(response.status).toBe(200)
      expect(data.updated.fieldName).toBe("supervisor")
    })
    
    test("should update without regenerating any chapters", async () => {
      // This is important: cover page edit should NOT trigger chapter regeneration
      expect(true).toBe(true) // Placeholder
    })
  })
  
  describe("Front Matter Edit Intent", () => {
    test("should route 'Add acknowledgement' to front matter tool", async () => {
      const request = createMockRequest({
        promptText: "Add an acknowledgement page thanking my supervisor and family",
        projectId
      })
      
      const response = await POST(request, { params: { id: projectId } })
      const data = await response.json()
      
      expect(response.status).toBe(200)
      expect(data.inserted).toBeDefined()
      expect(data.inserted.pageType).toBe("acknowledgement")
    })
    
    test("should auto-generate acknowledgement if user doesn't provide content", async () => {
      const request = createMockRequest({
        promptText: "Add an acknowledgement page",
        projectId
      })
      
      const response = await POST(request, { params: { id: projectId } })
      const data = await response.json()
      
      expect(response.status).toBe(200)
      expect(data.inserted.content).toContain("gratitude") // Should be auto-generated
    })
  })
  
  describe("Unsupported Intent", () => {
    test("should route 'Fix page break on page 5' to graceful degradation", async () => {
      const request = createMockRequest({
        promptText: "Fix the page break so content starts on page 5",
        projectId
      })
      
      const response = await POST(request, { params: { id: projectId } })
      const data = await response.json()
      
      expect(response.status).toBe(400)
      expect(data.unsupported).toBe(true)
      expect(data.alternatives).toBeDefined()
      expect(data.alternatives.length).toBeGreaterThan(0)
    })
    
    test("should offer 'rewrite section shorter' as alternative", async () => {
      const request = createMockRequest({
        promptText: "Make the last line before the diagram smaller",
        projectId
      })
      
      const response = await POST(request, { params: { id: projectId } })
      const data = await response.json()
      
      expect(data.alternatives.some(a => a.includes("rewrite"))).toBe(true)
    })
    
    test("should suggest trying a supported intent instead", async () => {
      const request = createMockRequest({
        promptText: "Make this bold and centered",
        projectId
      })
      
      const response = await POST(request, { params: { id: projectId } })
      const data = await response.json()
      
      expect(data.canTry).toBeDefined()
      expect(data.canTry.length).toBeGreaterThan(0)
    })
  })
  
  describe("Conversation Intent (Fallback)", () => {
    test("should route vague requests to conversation handler", async () => {
      const request = createMockRequest({
        promptText: "What do you think about my proposal so far?",
        projectId
      })
      
      const response = await POST(request, { params: { id: projectId } })
      const data = await response.json()
      
      expect(response.status).toBe(200)
      // Should get a conversation response
    })
  })
})

describe("Intent Classifier Accuracy", () => {
  test("should correctly classify 20 example messages", async () => {
    const examples = [
      { message: "Generate chapter 1", expectedType: "generation" },
      { message: "Write chapter 2", expectedType: "generation" },
      { message: "Expand section 2.3", expectedType: "section_edit" },
      { message: "Simplify the methodology", expectedType: "section_edit" },
      { message: "Change title to X", expectedType: "cover_page_edit" },
      { message: "Update supervisor name", expectedType: "cover_page_edit" },
      { message: "Add acknowledgement", expectedType: "front_matter_edit" },
      { message: "Insert abstract page", expectedType: "front_matter_edit" },
      { message: "Fix page break", expectedType: "unsupported_reframe" },
      { message: "Make this bold", expectedType: "unsupported_reframe" },
      // ... 10 more
    ]
    
    for (const example of examples) {
      const result = await classifyIntent(example.message, mockContext)
      expect(result.type).toBe(example.expectedType)
      expect(result.confidence).toBeGreaterThan(0.85)
    }
  })
})
```

---

## Part 3: Manual Testing Checklist

### 3.1 Test Scenarios

**Run through each scenario manually before deploying:**

```
GENERATION INTENT
─────────────────
□ User: "Generate chapter 1"
  Expected: Full chapter 1 generated
  Check: Content in editor, chapter marked complete, credits deducted

□ User: "Write the literature review"
  Expected: Chapter 2 generated
  Check: Same as above

SECTION EDIT INTENT
───────────────────
□ User: "Rewrite section 2.3"
  Expected: Only section 2.3 regenerated
  Check: 
    - Other sections in chapter 2 unchanged
    - Version history created
    - 20 credits deducted (not 50)

□ User: "Expand the problem statement"
  Expected: Section 1.2 expanded with more detail
  Check: New content is 30–50% longer

□ User: "Simplify section 3.2"
  Expected: Section 3.2 rewritten more simply
  Check: Shorter sentences, clearer explanations

COVER PAGE EDIT
────────────────
□ User: "Change the title to 'New Title Here'"
  Expected: Cover page title updated, no chapter regen
  Check:
    - Preview updates immediately
    - No credits deducted
    - Still shows original chapters

□ User: "Update supervisor to Dr. Johnson"
  Expected: Cover page supervisor field updated
  Check: Same as above

FRONT MATTER EDIT
──────────────────
□ User: "Add an acknowledgement page"
  Expected: Acknowledgement auto-generated
  Check:
    - Page inserted before chapter 1
    - Shows in export

□ User: "Add acknowledgement page with this text: [paste text]"
  Expected: Custom acknowledgement inserted
  Check: Exact text appears

UNSUPPORTED INTENT
───────────────────
□ User: "Fix the page break so it's on page 5"
  Expected: Graceful rejection with alternatives
  Check:
    - Shows "I can't guarantee that..."
    - Suggests "rewrite section shorter"
    - Suggests "[PAGE_BREAK] marker"

□ User: "Make this bold"
  Expected: Graceful rejection
  Check: Explains why, suggests alternatives

CONVERSATION FALLBACK
──────────────────────
□ User: "What do you think?"
  Expected: Conversation response
  Check: Natural reply, no forced tool usage
```

---

## Part 4: Monitoring & Metrics

### 4.1 What to Track After Launch

```
Intent Classification Metrics:
─────────────────────────────
- % of messages classified with confidence > 0.9
- % of messages routed to correct handler
- False positive rate (classified as unsupported when shouldn't be)
- False negative rate (classified as chat when meant something else)

Tool Usage Metrics:
──────────────────
- % of interactions using scoped edits vs. full generation
- Avg cost per edit (should be ~20 credits for section edit)
- Adoption rate of each tool:
  - update_cover_page_field
  - regenerate_chapter_section
  - insert_front_matter_page

User Satisfaction:
──────────────────
- Do users feel more in control? (A/B test before/after)
- Do edits feel fast? (measure latency of scoped edits)
- Do users hit unsupported requests often? (if >10%, improve classifier)

Business Metrics:
──────────────────
- Avg credits per session (should decrease due to cheaper scoped edits)
- Session duration (should increase as users iterate more)
- Completion rate (initial → full proposal)
```

---

## Part 5: Deployment Checklist

Before merging to production:

```
Code Quality:
─────────────
□ All unit tests pass (intentClassifier, tools)
□ All integration tests pass (ask/route.ts)
□ TypeScript: npx tsc --noEmit (0 errors)
□ ESLint: npx eslint src/ (0 errors)
□ Code review complete

Database:
─────────
□ Migration script created (proposal_section_versions table)
□ Migration tested locally
□ Rollback script prepared

Configuration:
──────────────
□ No hardcoded test data in production code
□ Environment variables documented
□ Error messages are user-friendly

Documentation:
───────────────
□ README updated with scoped edit tools
□ API docs updated (add intent classifier flows)
□ Support team trained on intent classification
□ Customer changelog prepared

Testing:
────────
□ All 20 manual test scenarios passed
□ Tested with 5+ real user conversations
□ Tested edge cases (ambiguous messages, typos)
□ Load tested (100+ concurrent requests)

Rollback Plan:
───────────────
□ If classification fails, fallback to "chat" handler
□ If tool fails, return helpful error message
□ Database rollback script ready
□ Monitoring alerts configured

Launch:
────────
□ Feature flag enabled (can disable quickly if needed)
□ Monitoring dashboard created
□ Support team alerted and ready
□ Customer communication sent
□ Metrics baseline captured
```

---

## Part 6: Success Criteria (One Week Post-Launch)

```
✅ Intent classification accuracy: ≥95%
✅ Zero silent failures (all errors have messages)
✅ Unsupported requests <5% of total messages
✅ Scoped edits adopted by ≥30% of users
✅ Avg credits per session decreased by 20%+
✅ User feedback positive or neutral
✅ No P1 bugs reported
✅ System uptime: 99.9%+
```

---

**Next**: Start Day 1 implementation of intentClassifier.ts

Questions before proceeding?

