# Implementation Spec: Intent Classifier + Scoped Edit Tools

**Version**: 1.0  
**Priority**: Week 1 (Critical Path)  
**Effort**: 1 week (5 days)  
**Status**: Ready for development

---

## Overview

This spec defines the **intent classifier** and **scoped edit tools** that will transform the proposal system from "regenerate everything" to "edit intelligently."

### What We're Building

```
User Message
    ↓
[Intent Classifier]
    ├─ "generation" → generate_chapter_tool
    ├─ "section_edit" → regenerate_chapter_section_tool
    ├─ "cover_page_edit" → update_cover_page_field_tool
    ├─ "front_matter_edit" → insert_front_matter_page_tool
    ├─ "unsupported_reframe" → graceful_degradation_handler
    └─ "chat" → regular_conversation

User sees smart, targeted response
```

---

## Part 1: Intent Classifier

### Location
**File**: `datacampus/src/utils/intentClassifier.ts` (NEW)

### Type Definitions

```typescript
// Classification types
export type IntentType = 
  | "generation"           // "Generate Chapter 1"
  | "section_edit"         // "Rewrite section 2.3"
  | "cover_page_edit"      // "Change student name to"
  | "front_matter_edit"    // "Add acknowledgement page"
  | "unsupported_reframe"  // "Fix page break on page 5"
  | "chat"                 // General conversation

export interface IntentClassification {
  type: IntentType
  confidence: number       // 0.0–1.0
  targetKey?: string       // "chapter_1", "section_2_3", "title", etc.
  targetType?: string      // "chapter" | "section" | "field" | "page"
  requestedAction?: string // "rewrite" | "expand" | "simplify" | "change"
  unsupportedReason?: string // If unsupported_reframe, why?
  suggestedAlternatives?: string[] // What CAN we do instead?
}

export interface ClassifierContext {
  projectId: string
  projectMetadata: any      // title, stage, chapters[], etc.
  currentChapterKey?: string
  currentSectionKey?: string
  existingContent?: Record<string, string> // section content
}
```

### Function Signature

```typescript
export async function classifyIntent(
  userMessage: string,
  context: ClassifierContext
): Promise<IntentClassification> {
  // Implementation below
}
```

### Implementation (Decision Tree)

```typescript
export async function classifyIntent(
  userMessage: string,
  context: ClassifierContext
): Promise<IntentClassification> {
  
  const normalized = userMessage.toLowerCase().trim()
  
  // ============================================
  // BRANCH 1: GENERATION INTENT
  // ============================================
  // Detects: "Generate chapter X", "Write chapter X", "Start on chapter"
  
  const generationMatch = detectGenerationIntent(normalized, context)
  if (generationMatch.detected) {
    return {
      type: "generation",
      confidence: generationMatch.confidence,
      targetKey: generationMatch.chapterKey,
      targetType: "chapter",
      requestedAction: "generate"
    }
  }
  
  // ============================================
  // BRANCH 2: SECTION EDIT INTENT
  // ============================================
  // Detects: "Rewrite section 2.3", "Change the problem statement", 
  //          "Expand the methodology"
  
  const sectionEditMatch = detectSectionEditIntent(normalized, context)
  if (sectionEditMatch.detected) {
    return {
      type: "section_edit",
      confidence: sectionEditMatch.confidence,
      targetKey: sectionEditMatch.sectionKey,
      targetType: "section",
      requestedAction: sectionEditMatch.action // "rewrite" | "expand" | "simplify"
    }
  }
  
  // ============================================
  // BRANCH 3: COVER PAGE FIELD EDIT INTENT
  // ============================================
  // Detects: "Change the title to", "Update student name", 
  //          "Fix supervisor name", "Change department to"
  
  const coverPageMatch = detectCoverPageEditIntent(normalized, context)
  if (coverPageMatch.detected) {
    return {
      type: "cover_page_edit",
      confidence: coverPageMatch.confidence,
      targetKey: coverPageMatch.fieldName, // "title" | "student_name" | "supervisor" | "department"
      targetType: "field",
      requestedAction: "update"
    }
  }
  
  // ============================================
  // BRANCH 4: FRONT MATTER EDIT INTENT
  // ============================================
  // Detects: "Add an acknowledgement", "Insert abstract page", 
  //          "Add a dedication"
  
  const frontMatterMatch = detectFrontMatterEditIntent(normalized, context)
  if (frontMatterMatch.detected) {
    return {
      type: "front_matter_edit",
      confidence: frontMatterMatch.confidence,
      targetKey: frontMatterMatch.pageType, // "abstract" | "acknowledgement" | "dedication"
      targetType: "page",
      requestedAction: "insert"
    }
  }
  
  // ============================================
  // BRANCH 5: UNSUPPORTED/RENDER-DEPENDENT INTENT
  // ============================================
  // Detects: "Fix the page break", "Make this bold", "Center this",
  //          "Change font size", "Move to next page"
  
  const unsupportedMatch = detectUnsupportedIntent(normalized, context)
  if (unsupportedMatch.detected) {
    return {
      type: "unsupported_reframe",
      confidence: unsupportedMatch.confidence,
      unsupportedReason: unsupportedMatch.reason,
      suggestedAlternatives: unsupportedMatch.alternatives
    }
  }
  
  // ============================================
  // FALLBACK: GENERAL CONVERSATION
  // ============================================
  
  return {
    type: "chat",
    confidence: 0.5 // Low confidence, let conversation handler take it
  }
}
```

---

## Intent Detection Functions

### 1. `detectGenerationIntent()`

```typescript
function detectGenerationIntent(
  normalized: string,
  context: ClassifierContext
): { detected: boolean; confidence: number; chapterKey?: string } {
  
  const generationKeywords = [
    "generate",
    "write",
    "create",
    "start",
    "begin",
    "let's start",
    "let's write",
    "please write"
  ]
  
  const chapterRegex = /chapter\s+(\d+)|chapter\s+(introduction|literature|methodology|design|results|conclusion)/i
  
  // Check for keywords
  const hasGenerationKeyword = generationKeywords.some(kw => normalized.includes(kw))
  if (!hasGenerationKeyword) return { detected: false, confidence: 0 }
  
  // Extract chapter number
  const match = normalized.match(chapterRegex)
  if (!match) return { detected: false, confidence: 0 }
  
  const chapterNumber = parseInt(match[1]) || chapterNameToNumber(match[2])
  const chapterKey = `chapter_${chapterNumber}`
  
  return {
    detected: true,
    confidence: 0.95,
    chapterKey
  }
}

function chapterNameToNumber(name: string): number {
  const mapping: Record<string, number> = {
    "introduction": 1,
    "literature": 2,
    "methodology": 3,
    "design": 4,
    "results": 5,
    "conclusion": 6
  }
  return mapping[name.toLowerCase()] || 0
}
```

### 2. `detectSectionEditIntent()`

```typescript
function detectSectionEditIntent(
  normalized: string,
  context: ClassifierContext
): { 
  detected: boolean
  confidence: number
  sectionKey?: string
  action?: "rewrite" | "expand" | "simplify" | "clarify" | "improve"
} {
  
  const editKeywords = [
    "rewrite",
    "change",
    "modify",
    "update",
    "fix",
    "expand",
    "simplify",
    "clarify",
    "improve",
    "make better",
    "make more",
    "add more",
    "shorten"
  ]
  
  // Extract action
  let action: "rewrite" | "expand" | "simplify" | "clarify" | "improve" = "rewrite"
  if (normalized.includes("expand") || normalized.includes("add more")) action = "expand"
  if (normalized.includes("simplify") || normalized.includes("shorten")) action = "simplify"
  if (normalized.includes("clarify") || normalized.includes("clear")) action = "clarify"
  if (normalized.includes("improve") || normalized.includes("better")) action = "improve"
  
  // Check for keywords
  const hasEditKeyword = editKeywords.some(kw => normalized.includes(kw))
  if (!hasEditKeyword) return { detected: false, confidence: 0 }
  
  // Extract section reference (by number or name)
  const sectionRegex = /section\s+(\d+\.\d+(\.\d+)?)|(\d+\.\d+)|"([^"]+)"/i
  const match = normalized.match(sectionRegex)
  
  if (!match) {
    // Try to infer from context
    if (context.currentSectionKey) {
      return {
        detected: true,
        confidence: 0.8, // Lower confidence for inferred
        sectionKey: context.currentSectionKey,
        action
      }
    }
    return { detected: false, confidence: 0 }
  }
  
  const sectionKey = match[1] || match[3] || normalizeSection(match[4])
  
  return {
    detected: true,
    confidence: 0.9,
    sectionKey,
    action
  }
}

function normalizeSection(name: string): string {
  // Map section names to keys
  const mapping: Record<string, string> = {
    "background": "1_1",
    "problem statement": "1_2",
    "aim and objectives": "1_3",
    "research questions": "1_4",
    // ... add more mappings
  }
  return mapping[name.toLowerCase()] || name.replace(/\s+/g, "_").toLowerCase()
}
```

### 3. `detectCoverPageEditIntent()`

```typescript
function detectCoverPageEditIntent(
  normalized: string,
  context: ClassifierContext
): {
  detected: boolean
  confidence: number
  fieldName?: "title" | "student_name" | "student_id" | "supervisor" | "department" | "academic_year"
} {
  
  const fieldPatterns: Record<string, RegExp> = {
    "title": /change.*title|update.*title|new title|title.*to|project.*title/i,
    "student_name": /student name|my name|change.*name|name.*to|student is/i,
    "student_id": /student id|id.*is|student.*number|student.*code/i,
    "supervisor": /supervisor|advisor|faculty|professor.*is/i,
    "department": /department|program|school/i,
    "academic_year": /academic year|year|2024|2025/i
  }
  
  for (const [fieldName, pattern] of Object.entries(fieldPatterns)) {
    if (pattern.test(normalized)) {
      return {
        detected: true,
        confidence: 0.95,
        fieldName: fieldName as any
      }
    }
  }
  
  return { detected: false, confidence: 0 }
}
```

### 4. `detectFrontMatterEditIntent()`

```typescript
function detectFrontMatterEditIntent(
  normalized: string,
  context: ClassifierContext
): {
  detected: boolean
  confidence: number
  pageType?: "abstract" | "acknowledgement" | "dedication" | "toc"
} {
  
  const pagePatterns: Record<string, RegExp> = {
    "abstract": /add.*abstract|abstract.*page|write.*abstract/i,
    "acknowledgement": /add.*acknowledgement|acknowledgements|thank.*page|write.*thank/i,
    "dedication": /add.*dedication|dedicate.*to|personal.*note/i,
    "toc": /table of contents|toc|update.*toc/i
  }
  
  for (const [pageType, pattern] of Object.entries(pagePatterns)) {
    if (pattern.test(normalized)) {
      return {
        detected: true,
        confidence: 0.95,
        pageType: pageType as any
      }
    }
  }
  
  return { detected: false, confidence: 0 }
}
```

### 5. `detectUnsupportedIntent()`

```typescript
function detectUnsupportedIntent(
  normalized: string,
  context: ClassifierContext
): {
  detected: boolean
  confidence: number
  reason?: string
  alternatives?: string[]
} {
  
  // Layout/formatting requests
  const layoutPatterns: Record<string, { reason: string; alternatives: string[] }> = {
    "page.*break": {
      reason: "Page breaks are determined by the PDF renderer, not content",
      alternatives: [
        "I can rewrite this section to be shorter",
        "I can add a `[PAGE_BREAK]` marker for you to adjust"
      ]
    },
    "page.*number": {
      reason: "Page numbering is automatically handled in the export",
      alternatives: [
        "Page numbers will be correct in the final DOCX"
      ]
    },
    "bold|italic|underline|font.*size|font.*change": {
      reason: "Formatting is applied during export, not in the content",
      alternatives: [
        "I can emphasize text by expanding it with *asterisks* (will be bold in export)",
        "I can restructure to highlight key points"
      ]
    },
    "center|align|indent": {
      reason: "Alignment is controlled during export, not in content",
      alternatives: [
        "I can restructure the section"
      ]
    },
    "diagram.*add|diagram.*insert": {
      reason: "Diagrams require manual creation or insertion",
      alternatives: [
        "I can add a `[DIAGRAM: type_name]` placeholder",
        "I can write a detailed description for you to create the diagram from"
      ]
    },
    "image|picture|figure|screenshot": {
      reason: "Images must be manually inserted into the document",
      alternatives: [
        "I can add a `[IMAGE: description]` placeholder",
        "I can write captions for images you want to add"
      ]
    },
    "last.*line|end.*of|final.*paragraph": {
      reason: "Content after regeneration may change, so 'last line' is render-dependent",
      alternatives: [
        "I can regenerate this section with your specific instructions",
        "I can tell you what's currently in the last paragraph"
      ]
    }
  }
  
  for (const [pattern, meta] of Object.entries(layoutPatterns)) {
    const regex = new RegExp(pattern, "i")
    if (regex.test(normalized)) {
      return {
        detected: true,
        confidence: 0.95,
        reason: meta.reason,
        alternatives: meta.alternatives
      }
    }
  }
  
  return { detected: false, confidence: 0 }
}
```

---

## Part 2: Scoped Edit Tools

### Location
**File**: `datacampus/src/app/api/proposals/[id]/scoped-edit/route.ts` (NEW)

### Type Definitions

```typescript
export type ScopedEditType =
  | "update_cover_page_field"
  | "regenerate_chapter_section"
  | "insert_front_matter_page"

export interface ScopedEditRequest {
  type: ScopedEditType
  targetKey: string           // field name, section key, or page type
  newValue?: string           // for field updates and page inserts
  reason?: string             // for section regen: why regenerate?
  action?: string             // for section regen: what action? expand/simplify/etc.
}

export interface ScopedEditResponse {
  success: boolean
  message: string
  updated?: {
    fieldName?: string
    oldValue?: string
    newValue?: string
  }
  regenerated?: {
    sectionKey: string
    content: string
  }
  inserted?: {
    pageType: string
    content: string
  }
}
```

### Tool 1: `update_cover_page_field`

```typescript
async function updateCoverPageField(
  projectId: string,
  fieldName: string,
  newValue: string
): Promise<ScopedEditResponse> {
  
  // 1. Fetch project
  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("*")
    .eq("id", projectId)
    .single()
  
  if (projectError) {
    return {
      success: false,
      message: `Could not load project: ${projectError.message}`
    }
  }
  
  // 2. Validate field
  const validFields = ["title", "student_name", "student_id", "supervisor", "department", "academic_year"]
  if (!validFields.includes(fieldName)) {
    return {
      success: false,
      message: `Invalid field: ${fieldName}. Valid fields: ${validFields.join(", ")}`
    }
  }
  
  // 3. Get old value
  const oldValue = project[fieldName]
  
  // 4. Update project
  const { error: updateError } = await supabase
    .from("projects")
    .update({
      [fieldName]: newValue,
      updated_at: new Date().toISOString()
    })
    .eq("id", projectId)
  
  if (updateError) {
    return {
      success: false,
      message: `Could not update field: ${updateError.message}`
    }
  }
  
  // 5. Log to version history
  await logVersionEntry(projectId, "cover_page", "field_update", {
    fieldName,
    oldValue,
    newValue,
    changedBy: "user"
  })
  
  return {
    success: true,
    message: `Updated ${fieldName} from "${oldValue}" to "${newValue}"`,
    updated: {
      fieldName,
      oldValue,
      newValue
    }
  }
}
```

### Tool 2: `regenerate_chapter_section`

```typescript
async function regenerateChapterSection(
  projectId: string,
  chapterKey: string,
  sectionKey: string,
  reason: string,
  action: "rewrite" | "expand" | "simplify" | "clarify" | "improve",
  token: string
): Promise<ScopedEditResponse> {
  
  // 1. Load current section
  const { data: currentSection, error: sectionError } = await supabase
    .from("proposal_sections")
    .select("*")
    .eq("project_id", projectId)
    .eq("section_key", sectionKey)
    .single()
  
  if (sectionError) {
    return {
      success: false,
      message: `Could not load section: ${sectionError.message}`
    }
  }
  
  // 2. Load project metadata
  const { data: project } = await supabase
    .from("projects")
    .select("*")
    .eq("id", projectId)
    .single()
  
  // 3. Load spec
  const spec = await loadProposalSpec(project.metadata.spec_key || "default")
  const sectionSpec = extractSectionSpec(spec, sectionKey)
  
  // 4. Load references
  const { data: references } = await supabase
    .from("proposal_references")
    .select("*")
    .eq("project_id", projectId)
  
  // 5. Build targeted prompt
  const prompt = buildTargetedRegenerationPrompt(
    sectionKey,
    sectionSpec,
    currentSection.content_md,
    reason,
    action,
    project,
    references
  )
  
  // 6. Call LLM
  const response = await callLLM({
    systemPrompt: prompt.system,
    userPrompt: prompt.user,
    maxTokens: 2000
  })
  
  // 7. Extract just this section from response
  const newContent = extractSectionContent(response, sectionKey, sectionSpec)
  
  // 8. Save new version
  const { error: saveError } = await supabase
    .from("proposal_sections")
    .update({
      content_md: newContent,
      status: "complete",
      updated_at: new Date().toISOString()
    })
    .eq("id", currentSection.id)
  
  if (saveError) {
    return {
      success: false,
      message: `Could not save regenerated section: ${saveError.message}`
    }
  }
  
  // 9. Log to version history
  await logVersionEntry(projectId, sectionKey, "section_regenerate", {
    action,
    reason,
    oldContent: currentSection.content_md,
    newContent,
    changedBy: "user_request"
  })
  
  // 10. Deduct credits
  await deductCredits(projectId, 20) // Cheaper than full generation
  
  return {
    success: true,
    message: `Regenerated ${sectionKey} with "${action}" action`,
    regenerated: {
      sectionKey,
      content: newContent
    }
  }
}

function buildTargetedRegenerationPrompt(
  sectionKey: string,
  sectionSpec: any,
  currentContent: string,
  reason: string,
  action: "rewrite" | "expand" | "simplify" | "clarify" | "improve",
  project: any,
  references: any[]
): { system: string; user: string } {
  
  const actionInstructions: Record<string, string> = {
    "rewrite": "Rewrite this section from scratch, maintaining the same core message but with fresh wording and structure.",
    "expand": "Expand this section by 30–50% by adding more detail, examples, or sub-points while keeping the original structure.",
    "simplify": "Simplify this section by removing jargon, shortening sentences, and making it more accessible to readers unfamiliar with the topic.",
    "clarify": "Clarify this section by explicitly explaining any unclear points, adding definitions where needed, and improving logical flow.",
    "improve": "Improve this section by enhancing clarity, adding missing information, and strengthening the argument or narrative."
  }
  
  return {
    system: `You are editing a specific section of an academic proposal.

Section to edit: ${sectionKey}
Specification: ${JSON.stringify(sectionSpec)}
Requested action: ${action}
${actionInstructions[action]}

Current content:
\`\`\`
${currentContent}
\`\`\`

Keep the same heading structure. Do NOT modify other sections. Return ONLY the regenerated content for this section.`,
    
    user: `${reason}

Generate only the ${sectionKey} section with the "${action}" action applied. Maintain academic tone and cite references where appropriate.`
  }
}
```

### Tool 3: `insert_front_matter_page`

```typescript
async function insertFrontMatterPage(
  projectId: string,
  pageType: "abstract" | "acknowledgement" | "dedication" | "toc",
  content: string,
  token: string
): Promise<ScopedEditResponse> {
  
  const sectionKeyMap: Record<string, string> = {
    "abstract": "front_matter_abstract",
    "acknowledgement": "front_matter_acknowledgement",
    "dedication": "front_matter_dedication",
    "toc": "table_of_contents"
  }
  
  const sectionKey = sectionKeyMap[pageType]
  
  // 1. Check if page already exists
  const { data: existing } = await supabase
    .from("proposal_sections")
    .select("id")
    .eq("project_id", projectId)
    .eq("section_key", sectionKey)
    .single()
  
  // 2. Insert or update
  if (existing) {
    // Update existing
    const { error } = await supabase
      .from("proposal_sections")
      .update({
        content_md: content,
        status: "complete",
        updated_at: new Date().toISOString()
      })
      .eq("id", existing.id)
    
    if (error) {
      return {
        success: false,
        message: `Could not update ${pageType} page: ${error.message}`
      }
    }
  } else {
    // Insert new
    const { error } = await supabase
      .from("proposal_sections")
      .insert({
        project_id: projectId,
        section_key: sectionKey,
        title: pageType.charAt(0).toUpperCase() + pageType.slice(1),
        content_md: content,
        status: "complete",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
    
    if (error) {
      return {
        success: false,
        message: `Could not insert ${pageType} page: ${error.message}`
      }
    }
  }
  
  // 3. Update project metadata to track front matter sections
  const { data: project } = await supabase
    .from("projects")
    .select("metadata")
    .eq("id", projectId)
    .single()
  
  const updatedMetadata = {
    ...project.metadata,
    front_matter: [...(project.metadata.front_matter || []), pageType]
  }
  
  await supabase
    .from("projects")
    .update({ metadata: updatedMetadata })
    .eq("id", projectId)
  
  // 4. Log to version history
  await logVersionEntry(projectId, sectionKey, "front_matter_insert", {
    pageType,
    content,
    changedBy: "user_request"
  })
  
  return {
    success: true,
    message: `${pageType} page ${existing ? "updated" : "inserted"}`,
    inserted: {
      pageType,
      content
    }
  }
}
```

---

## Part 3: Integration with Existing Routes

### Modify `ask/route.ts`

```typescript
// Add this to POST handler in /api/proposals/[id]/ask/route.ts

const classification = await classifyIntent(userMessage, {
  projectId: id,
  projectMetadata: project.metadata,
  currentChapterKey: project.metadata.workflow?.current_chapter_key,
  currentSectionKey: project.metadata.workflow?.current_section_key,
  existingContent: chapterStore
})

switch (classification.type) {
  case "generation":
    return handleGenerationIntent(classification, project, token)
  
  case "section_edit":
    return handleSectionEditIntent(classification, project, token)
  
  case "cover_page_edit":
    return handleCoverPageEditIntent(classification, userMessage)
  
  case "front_matter_edit":
    return handleFrontMatterEditIntent(classification, userMessage)
  
  case "unsupported_reframe":
    return handleUnsupportedIntent(classification)
  
  case "chat":
  default:
    return handleConversationIntent(userMessage, project, messages, token)
}
```

---

## Part 4: Graceful Degradation Handler

### Location
**File**: `datacampus/src/utils/gracefulDegradation.ts` (NEW)

```typescript
export function buildUnsupportedIntentResponse(
  classification: IntentClassification
): { response: string; suggestions: string[] } {
  
  const reason = classification.unsupportedReason || "This request targets a property I can't directly modify"
  
  const suggestions = classification.suggestedAlternatives || [
    "I can help you restructure the content",
    "I can regenerate a section with your feedback"
  ]
  
  const response = `
I can't guarantee that directly, but I understand you want to ${classification.type}.

**Why**: ${reason}

**What I can do instead**:
${suggestions.map((s, i) => `${i + 1}. ${s}`).join("\n")}

Which of these would help?
  `.trim()
  
  return { response, suggestions }
}
```

---

## Part 5: Version History Table

### Database Migration

```sql
-- Create proposal_section_versions table
CREATE TABLE proposal_section_versions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  section_key TEXT NOT NULL,
  version_number INT NOT NULL,
  content_md TEXT NOT NULL,
  changed_by TEXT NOT NULL, -- "user_request" | "ai_generation" | "user_edit"
  change_reason TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  UNIQUE(project_id, section_key, version_number)
);

CREATE INDEX idx_section_versions_project_section 
  ON proposal_section_versions(project_id, section_key);

-- Add version tracking to proposal_sections
ALTER TABLE proposal_sections 
ADD COLUMN current_version_number INT DEFAULT 1;
```

### Version Logging Function

```typescript
export async function logVersionEntry(
  projectId: string,
  sectionKey: string,
  changeType: "field_update" | "section_regenerate" | "front_matter_insert" | "ai_generation",
  metadata: any
): Promise<void> {
  
  // Get current version number
  const { data: latest } = await supabase
    .from("proposal_section_versions")
    .select("version_number")
    .eq("project_id", projectId)
    .eq("section_key", sectionKey)
    .order("version_number", { ascending: false })
    .limit(1)
    .single()
  
  const nextVersion = (latest?.version_number || 0) + 1
  
  // Insert version entry
  await supabase.from("proposal_section_versions").insert({
    project_id: projectId,
    section_key: sectionKey,
    version_number: nextVersion,
    content_md: metadata.newContent || metadata.content || "",
    changed_by: metadata.changedBy || "unknown",
    change_reason: metadata.reason || changeType,
    metadata: {
      changeType,
      ...metadata
    }
  })
  
  // Update current version pointer
  const { data: section } = await supabase
    .from("proposal_sections")
    .select("id")
    .eq("project_id", projectId)
    .eq("section_key", sectionKey)
    .single()
  
  if (section) {
    await supabase
      .from("proposal_sections")
      .update({ current_version_number: nextVersion })
      .eq("id", section.id)
  }
}
```

---

## Part 6: Example Conversations

### Example 1: Cover Page Edit

```
User: "Change the title to 'AI-Powered Supply Chain Management System'"

System Intent: cover_page_edit
  ├─ type: "cover_page_edit"
  ├─ targetKey: "title"
  └─ confidence: 0.98

System Action: Call update_cover_page_field("title", "AI-Powered Supply Chain Management System")

System Response: ✓ Updated title from "Supply Chain System" to "AI-Powered Supply Chain Management System"

(Cover page preview updates instantly)
```

### Example 2: Section Edit

```
User: "The problem statement is too vague. Can you expand it with more specific examples?"

System Intent: section_edit
  ├─ type: "section_edit"
  ├─ targetKey: "section_1_2"
  ├─ action: "expand"
  └─ confidence: 0.92

System Action: Call regenerate_chapter_section(
  chapterKey: "chapter_1",
  sectionKey: "section_1_2",
  action: "expand",
  reason: "User wants more specific examples"
)

System Response: ✓ Regenerated section 1.2 (Problem Statement) with expanded detail

[Shows diff or new content]
```

### Example 3: Unsupported Request

```
User: "Fix the page break so it's on page 3 instead of page 4"

System Intent: unsupported_reframe
  ├─ type: "unsupported_reframe"
  ├─ unsupportedReason: "Page breaks are determined by the PDF renderer, not content"
  ├─ suggestedAlternatives: [
  │   "I can rewrite this section to be shorter",
  │   "I can add a [PAGE_BREAK] marker for manual adjustment"
  │ ]
  └─ confidence: 0.96

System Response: 
I can't guarantee that directly, because page breaks are determined when the document is rendered, not by the content itself.

But here's what I can do instead:
1. Rewrite the section before this to be shorter, which will naturally push content down
2. Add a [PAGE_BREAK] marker at the point where you want the break, then you can adjust manually in Word
3. Regenerate a nearby section to adjust length

Which would help?
```

### Example 4: Front Matter Edit

```
User: "Add an acknowledgement page thanking my supervisor and family"

System Intent: front_matter_edit
  ├─ type: "front_matter_edit"
  ├─ targetKey: "acknowledgement"
  └─ confidence: 0.95

System Action: 
1. Ask LLM to draft acknowledgement based on project context
2. Call insert_front_matter_page(
     pageType: "acknowledgement",
     content: "[Generated acknowledgement text]"
   )

System Response: ✓ Added acknowledgement page

Here's what was inserted:

"I would like to express my sincere gratitude to [Supervisor Name] for their invaluable guidance..."

[Show full content, allow edit]
```

---

## Part 7: Testing Checklist

### Unit Tests

```typescript
describe("intentClassifier", () => {
  test("should detect generation intent", async () => {
    const result = await classifyIntent("Generate chapter 1", mockContext)
    expect(result.type).toBe("generation")
    expect(result.confidence).toBeGreaterThan(0.9)
  })
  
  test("should detect section edit intent with action", async () => {
    const result = await classifyIntent("Expand section 2.3", mockContext)
    expect(result.type).toBe("section_edit")
    expect(result.requestedAction).toBe("expand")
  })
  
  test("should detect cover page edit", async () => {
    const result = await classifyIntent("Change the title to X", mockContext)
    expect(result.type).toBe("cover_page_edit")
    expect(result.targetKey).toBe("title")
  })
  
  test("should detect unsupported request", async () => {
    const result = await classifyIntent("Fix the page break on page 5", mockContext)
    expect(result.type).toBe("unsupported_reframe")
    expect(result.unsupportedReason).toBeDefined()
  })
  
  test("should suggest alternatives for unsupported intent", async () => {
    const result = await classifyIntent("Make this bold", mockContext)
    expect(result.suggestedAlternatives).toBeDefined()
    expect(result.suggestedAlternatives?.length).toBeGreaterThan(0)
  })
})

describe("scoped edit tools", () => {
  test("should update cover page field", async () => {
    const result = await updateCoverPageField(projectId, "title", "New Title")
    expect(result.success).toBe(true)
    expect(result.updated?.newValue).toBe("New Title")
  })
  
  test("should regenerate section without regenerating whole chapter", async () => {
    const result = await regenerateChapterSection(
      projectId,
      "chapter_1",
      "section_1_2",
      "User wants expansion",
      "expand",
      token
    )
    expect(result.success).toBe(true)
    expect(result.regenerated?.sectionKey).toBe("section_1_2")
  })
  
  test("should log version history on edit", async () => {
    await regenerateChapterSection(...)
    
    const { data: versions } = await supabase
      .from("proposal_section_versions")
      .select("*")
      .eq("project_id", projectId)
    
    expect(versions?.length).toBeGreaterThan(0)
  })
})
```

### Integration Tests

```typescript
describe("ask/route.ts with intent classifier", () => {
  test("should route generation intent to generate handler", async () => {
    const response = await POST(request with "Generate chapter 1")
    expect(response.status).toBe(200)
    expect(response.generationStarted).toBe(true)
  })
  
  test("should route section edit to scoped edit tool", async () => {
    const response = await POST(request with "Expand section 2.3")
    expect(response.status).toBe(200)
    expect(response.sectionRegenerated).toBe(true)
  })
  
  test("should route unsupported intent to graceful degradation", async () => {
    const response = await POST(request with "Fix page break")
    expect(response.status).toBe(200)
    expect(response.unsupported).toBe(true)
    expect(response.alternatives).toBeDefined()
  })
})
```

---

## Part 8: Implementation Order (5 Days)

### Day 1: Intent Classifier
- [ ] Create `intentClassifier.ts`
- [ ] Implement all 5 detection functions
- [ ] Write unit tests
- [ ] Verify with test messages

### Day 2: Scoped Edit Tools
- [ ] Create `scoped-edit/route.ts`
- [ ] Implement `update_cover_page_field`
- [ ] Implement `regenerate_chapter_section`
- [ ] Write unit tests

### Day 3: Front Matter Tool + Version History
- [ ] Implement `insert_front_matter_page`
- [ ] Create `proposal_section_versions` table
- [ ] Implement `logVersionEntry`
- [ ] Wire logging into tools

### Day 4: Integration
- [ ] Modify `ask/route.ts` to use classifier
- [ ] Route each intent type to correct handler
- [ ] Wire graceful degradation
- [ ] Test end-to-end flows

### Day 5: Testing + Polish
- [ ] Integration tests
- [ ] Test conversation examples (all 4)
- [ ] Edge case testing
- [ ] Documentation

---

## Success Criteria

✅ Intent classifier correctly routes 95%+ of test messages  
✅ Cover page edits work without regenerating chapters  
✅ Section regeneration preserves other sections  
✅ Unsupported requests show alternatives  
✅ Version history logs all changes  
✅ System feels responsive (sub-second routing)  
✅ All 4 conversation examples work as shown  

---

**Ready to build. Ask questions before starting implementation.**

