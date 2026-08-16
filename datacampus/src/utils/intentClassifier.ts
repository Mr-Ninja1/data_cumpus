// The classification step described in idea.md Section 3: every user
// message must be classified before anything else happens. Without this,
// the system always fell through to `continue_generation` regardless of
// what the user actually typed (the "change the cover page" -> Chapter 1
// bug). This runs an AI classification pass first, and falls back to
// heuristics when the model is unavailable or returns something unusable.

import { runModel } from './models';

export type ProposalIntent = 'continue_generation' | 'edit_request' | 'question' | 'unsupported_reframe' | 'unclear';

export type EditAction =
  | { tool: 'update_metadata_field'; field: string; value: string }
  | { tool: 'update_front_matter_order'; new_order: string[] }
  | { tool: 'remove_front_matter_page'; page_type: string }
  | { tool: 'regenerate_chapter_section'; chapter_key: string; section_number?: string; instruction: string }
  | { tool: 'insert_front_matter_page'; page_type: string; instruction: string }
  | { tool: 'regenerate_diagram'; chapter_key: string; diagram_key: string; instruction: string };

export type IntentClassification = {
  intent: ProposalIntent;
  action?: EditAction;
  clarifying_question?: string;
  confidence: number;
  source: 'model' | 'heuristic';
  // Only set for continue_generation, and only when the user explicitly
  // named a different chapter/section to move to (e.g. "let's move to
  // chapter 2", "continue with the cover page"). The current chapter view
  // must never change on its own — only an explicit request should move it.
  target_chapter_key?: string;
  // Only set for unsupported_reframe — why the request can't be done
  // reliably, plus the nearest stable-anchor alternative to offer instead.
  unsupported_reason?: string;
};

const VALID_INTENTS = ['continue_generation', 'edit_request', 'question', 'unsupported_reframe', 'unclear'];
const VALID_TOOLS = [
  'update_metadata_field',
  'update_front_matter_order',
  'remove_front_matter_page',
  'regenerate_chapter_section',
  'insert_front_matter_page',
  'regenerate_diagram',
];

function extractJsonBlock(raw: string): string | null {
  const text = String(raw || '').trim();
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) return fenced[1].trim();
  const firstBrace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) return text.slice(firstBrace, lastBrace + 1);
  return null;
}

function safeParseClassification(raw: string): IntentClassification | null {
  const block = extractJsonBlock(raw);
  if (!block) return null;
  try {
    const parsed = JSON.parse(block);
    if (!VALID_INTENTS.includes(parsed.intent)) return null;

    let action: EditAction | undefined;
    if (parsed.intent === 'edit_request' && parsed.action && VALID_TOOLS.includes(parsed.action.tool)) {
      action = parsed.action as EditAction;
    }

    return {
      intent: parsed.intent,
      action,
      clarifying_question: typeof parsed.clarifying_question === 'string' ? parsed.clarifying_question : undefined,
      confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.7,
      source: 'model',
      target_chapter_key:
        parsed.intent === 'continue_generation' && typeof parsed.target_chapter_key === 'string' ? parsed.target_chapter_key : undefined,
      unsupported_reason:
        parsed.intent === 'unsupported_reframe' && typeof parsed.unsupported_reason === 'string' ? parsed.unsupported_reason : undefined,
    };
  } catch {
    return null;
  }
}

const CHAPTER_NAME_MAP: Record<string, string> = {
  'cover page': 'cover_page',
  cover: 'cover_page',
  'table of contents': 'table_of_contents',
  toc: 'table_of_contents',
  abstract: 'abstract',
  acknowledgement: 'acknowledgement',
  acknowledgment: 'acknowledgement',
  references: 'references',
};

/** Returns undefined when nothing explicit was named — callers that need a
 * fallback to the current chapter should pass one; callers that need to
 * know whether the user *explicitly* named a chapter should not. */
function detectExplicitChapterKey(message: string): string | undefined {
  const lower = message.toLowerCase();
  for (const [name, key] of Object.entries(CHAPTER_NAME_MAP)) {
    if (lower.includes(name)) return key;
  }
  const chapterWord = lower.match(/chapter\s*(\d+)/);
  if (chapterWord) return `chapter_${chapterWord[1]}`;
  const sectionNumberMatch = message.match(/\b(\d+)\.\d+(?:\.\d+)*\b/);
  if (sectionNumberMatch) return `chapter_${sectionNumberMatch[1]}`;
  return undefined;
}

function detectChapterKey(message: string, fallbackChapterKey?: string): string | undefined {
  return detectExplicitChapterKey(message) || fallbackChapterKey;
}

// cover_page and table_of_contents are not chapters with regenerable
// content_md — cover_page is built entirely from metadata fields, and
// table_of_contents auto-generates from headings at export time. Routing
// either into regenerate_chapter_section silently fails (no chapter entry
// exists), which is the root cause of edits to these two appearing to do
// nothing or falling back to chapter generation.
const NON_CHAPTER_KEYS = new Set(['cover_page', 'table_of_contents']);
const COVER_PAGE_FIELD_LIST = 'title, student name, student id, supervisor, department, academic year, or brand color';

const MOVE_ON_PATTERN = /\b(move on|move to|let'?s (do|go to|move to|start|continue with)|continue (with|to)|switch to|go to|start(ing)? on|next up)\b/i;

function detectSectionNumber(message: string): string | undefined {
  const match = message.match(/\b\d+(?:\.\d+){1,3}\b/);
  return match ? match[0] : undefined;
}

const EDIT_VERBS = /\b(change|update|edit|fix|revise|rewrite|shorten|lengthen|expand|remove|delete|reorder|re-order|move|insert|add|correct|rename|replace|redo|swap|tighten|simplify|clarify|reword)\b/i;
const QUESTION_STARTERS = /^\s*(what|why|how|when|where|who|which|can you explain|could you explain|is |are |does |do |should |will |would |explain)\b/i;
const METADATA_FIELD_HINTS: Array<{ pattern: RegExp; field: string }> = [
  { pattern: /\bsupervisor\b/i, field: 'supervisor' },
  { pattern: /\bdepartment\b/i, field: 'department' },
  { pattern: /\bacademic year\b/i, field: 'academic_year' },
  { pattern: /\b(brand colou?r|theme colou?r)\b/i, field: 'brand_color' },
  { pattern: /\b(project )?title\b/i, field: 'title' },
  { pattern: /\bstudent name\b/i, field: 'student_name' },
  { pattern: /\bstudent (number|id)\b/i, field: 'student_id' },
];

// idea.md/cd.md rule: requests tied to final render position (page number,
// "top of page 2", "last line before the diagram", "keep this on one page")
// are never safe to route to an edit tool, because pagination shifts
// whenever content changes elsewhere. Headings/section numbers/named fields
// are stable anchors and classify normally.
const UNSUPPORTED_RENDER_PATTERNS = /\b(page\s*\d+|top of page|bottom of page|last line|next page|one page|page break|keep.*on (a |one )?page|before the diagram|after the diagram)\b/i;

const FRONT_MATTER_PAGE_HINTS: Array<{ pattern: RegExp; pageType: string }> = [
  { pattern: /\babstract\b/i, pageType: 'abstract' },
  { pattern: /\backnowledge?ment(s)?\b/i, pageType: 'acknowledgement' },
  { pattern: /\bdedication\b/i, pageType: 'dedication' },
];
const INSERT_FRONT_MATTER_VERBS = /\b(add|insert|include|create|write)\b/i;
const REMOVE_FRONT_MATTER_VERBS = /\b(remove|delete|drop|take out|get rid of|don'?t (need|want))\b/i;
const DIAGRAM_HINT = /\bdiagram(s)?\b/i;

function heuristicClassify(message: string, currentChapterKey?: string): IntentClassification {
  const trimmed = message.trim();

  if (!trimmed) {
    return { intent: 'continue_generation', confidence: 0.6, source: 'heuristic' };
  }

  if (UNSUPPORTED_RENDER_PATTERNS.test(trimmed)) {
    return {
      intent: 'unsupported_reframe',
      unsupported_reason: 'Page position and pagination are determined by the exported document, not the underlying content, so they can shift whenever anything else changes.',
      confidence: 0.6,
      source: 'heuristic',
    };
  }

  if (trimmed.endsWith('?') || QUESTION_STARTERS.test(trimmed)) {
    return { intent: 'question', confidence: 0.6, source: 'heuristic' };
  }

  if (REMOVE_FRONT_MATTER_VERBS.test(trimmed)) {
    for (const { pattern, pageType } of FRONT_MATTER_PAGE_HINTS) {
      if (pattern.test(trimmed)) {
        return {
          intent: 'edit_request',
          action: { tool: 'remove_front_matter_page', page_type: pageType },
          confidence: 0.55,
          source: 'heuristic',
        };
      }
    }
  }

  if (INSERT_FRONT_MATTER_VERBS.test(trimmed)) {
    for (const { pattern, pageType } of FRONT_MATTER_PAGE_HINTS) {
      if (pattern.test(trimmed)) {
        return {
          intent: 'edit_request',
          action: { tool: 'insert_front_matter_page', page_type: pageType, instruction: trimmed },
          confidence: 0.55,
          source: 'heuristic',
        };
      }
    }
  }

  // Checked before the edit-verb gate below so plain follow-up answers to a
  // clarifying question (e.g. "the title, to My Project") still resolve —
  // they name a field and a value but often skip an explicit edit verb.
  for (const { pattern, field } of METADATA_FIELD_HINTS) {
    if (pattern.test(trimmed)) {
      const valueMatch = trimmed.match(/(?:to|as|:|should be|is)\s+(.+)$/i);
      if (valueMatch && valueMatch[1]) {
        return {
          intent: 'edit_request',
          action: { tool: 'update_metadata_field', field, value: valueMatch[1].trim().replace(/[."]+$/, '') },
          confidence: 0.55,
          source: 'heuristic',
        };
      }
    }
  }

  if (EDIT_VERBS.test(trimmed)) {
    if (/\bfront matter\b|\breorder\b|\bmove\b.*\b(before|after)\b|\binsert\b.*\b(before|after)\b/i.test(trimmed)) {
      return { intent: 'edit_request', confidence: 0.5, source: 'heuristic' };
    }

    const chapterKey = detectChapterKey(trimmed, currentChapterKey);
    const sectionNumber = detectSectionNumber(trimmed);

    if (chapterKey === 'cover_page') {
      return {
        intent: 'unclear',
        clarifying_question: `Which part of the cover page would you like to change (${COVER_PAGE_FIELD_LIST}), and what should it say?`,
        confidence: 0.6,
        source: 'heuristic',
      };
    }

    if (chapterKey === 'table_of_contents') {
      return {
        intent: 'unsupported_reframe',
        unsupported_reason: 'The Table of Contents is generated automatically from your chapter headings when you export the document — there is nothing to edit here directly.',
        confidence: 0.7,
        source: 'heuristic',
      };
    }

    if (DIAGRAM_HINT.test(trimmed) && chapterKey && !NON_CHAPTER_KEYS.has(chapterKey)) {
      const diagramMatch = trimmed.match(/diagram\s+(?:of|for|called|named)?\s*([\w-]+)/i);
      return {
        intent: 'edit_request',
        action: { tool: 'regenerate_diagram', chapter_key: chapterKey, diagram_key: diagramMatch?.[1] || 'main', instruction: trimmed },
        confidence: 0.5,
        source: 'heuristic',
      };
    }

    if (chapterKey && !NON_CHAPTER_KEYS.has(chapterKey)) {
      return {
        intent: 'edit_request',
        action: { tool: 'regenerate_chapter_section', chapter_key: chapterKey, section_number: sectionNumber, instruction: trimmed },
        confidence: 0.55,
        source: 'heuristic',
      };
    }

    return { intent: 'edit_request', confidence: 0.4, source: 'heuristic' };
  }

  // continue_generation — but if the user explicitly named a different
  // chapter/section than the one currently in view, honor that instead of
  // silently continuing whatever happens to be selected.
  const explicitKey = detectExplicitChapterKey(trimmed);
  if (explicitKey && explicitKey !== currentChapterKey && MOVE_ON_PATTERN.test(trimmed)) {
    return { intent: 'continue_generation', confidence: 0.6, source: 'heuristic', target_chapter_key: explicitKey };
  }

  return { intent: 'continue_generation', confidence: 0.5, source: 'heuristic' };
}

export async function classifyIntent(opts: {
  message: string;
  currentChapterKey?: string;
  currentChapterTitle?: string;
  provider?: string;
  model?: string;
  // Current cover-page field values — without these, the model can't
  // resolve instructions like "prepend X to the actual title" and ends up
  // writing a literal placeholder phrase as the new value instead of the
  // real current text.
  currentCoverPage?: { title?: string; department?: string; supervisor?: string; academic_year?: string };
  // Last few chat turns, most recent last — lets a correction like "no, I
  // meant the original title" be understood against what was actually just
  // proposed, instead of being classified in a vacuum.
  recentMessages?: Array<{ role: string; text: string }>;
}): Promise<IntentClassification> {
  const { message, currentChapterKey, currentChapterTitle, provider, model, currentCoverPage, recentMessages } = opts;

  const system = [
    'You are an intent classifier for an academic proposal-writing assistant.',
    'Classify based on the user\'s actual intent, not literal keyword matches. "Change the title to X", "I want to change the title to X", "please make the title X", "the title should be X", and "can you update the title, it should say X" are all the SAME intent (edit_request, update_metadata_field, field: title) even though the wording differs completely. Do not require specific phrases — reason about what the user is trying to accomplish.',
    'Classify the user\'s message into exactly one of: continue_generation, edit_request, question, unsupported_reframe, unclear.',
    '- continue_generation: user wants the assistant to draft/continue the current chapter/section as-is (including empty/vague "continue" messages).',
    '- edit_request: user wants to change something already produced — metadata (title, supervisor, department, academic year, brand color), the front matter order/content (e.g. inserting an abstract, acknowledgement, dedication), a specific chapter/section\'s content (e.g. "make 1.2 more concise"), or a diagram\'s description (e.g. "redo the architecture diagram").',
    'IMPORTANT: "cover_page" and "table_of_contents" are NOT chapters and have no content_md of their own — never use regenerate_chapter_section with either as chapter_key.',
    '  - The cover page is built entirely from metadata fields. If the user wants to change it but names a specific field and value (e.g. "change the cover page title to X"), use update_metadata_field. If they mention the cover page but do NOT name a specific field and value, classify as unclear and ask which field (title, student_name, student_id, supervisor, department, academic_year, or brand_color) and what it should say.',
    '  - The table of contents auto-generates from chapter headings at export time and cannot be edited directly. If the user asks to change it, classify as unsupported_reframe and explain this.',
    '- question: user is asking a question about the proposal or process, not asking for a document change.',
    '- unsupported_reframe: the request targets a render-dependent property that cannot be reliably controlled from content alone — a page number, a visual position that depends on final pagination (e.g. "top of page 2", "last line before the diagram", "keep this on one page"). These shift whenever content changes elsewhere in the document, so never route them to an edit tool. Requests targeting a heading, section number, or named field (e.g. "above 1.2 Problem Statement", "the cover page title") are stable anchors — classify those normally as edit_request, NOT unsupported_reframe.',
    '- unclear: the message is too ambiguous to safely act on.',
    '',
    'For edit_request, also return an "action" object using exactly one of these tool shapes:',
    '{"tool":"update_metadata_field","field":"<supervisor|department|academic_year|brand_color|title|student_name|student_id|program|course>","value":"<string>"}',
    '{"tool":"update_front_matter_order","new_order":["cover_page","abstract","acknowledgement","table_of_contents"]}',
    '{"tool":"remove_front_matter_page","page_type":"<abstract|acknowledgement|dedication>"}',
    '{"tool":"regenerate_chapter_section","chapter_key":"<e.g. chapter_1, never cover_page or table_of_contents>","section_number":"<e.g. 1.2, optional>","instruction":"<what to change>"}',
    '{"tool":"insert_front_matter_page","page_type":"<abstract|acknowledgement|dedication>","instruction":"<guidance for its content, may be empty>"}',
    '{"tool":"regenerate_diagram","chapter_key":"<e.g. chapter_3>","diagram_key":"<EXACTLY one of: conceptual_framework|contextual_model|use_case_model|sequence_diagram|state_machine_diagram|activity_diagram|class_diagram>","instruction":"<what to change>"}',
    'For regenerate_diagram, diagram_key MUST be one of that exact fixed list — map whatever the user calls it to the closest matching key (e.g. "the architecture diagram"/"the framework diagram" → conceptual_framework, "the actors diagram" → use_case_model, "the flow diagram" → activity_diagram). If you genuinely cannot tell which of the seven it refers to, classify as unclear and ask which diagram they mean instead of guessing a key outside that list.',
    '',
    'For unsupported_reframe, also return "unsupported_reason": one sentence explaining why it can\'t be reliably done and, if possible, naming the nearest stable-anchor alternative you could do instead (e.g. rewriting a section shorter, or adding a marker for the user to adjust manually).',
    '',
    'For continue_generation, also include "target_chapter_key" (e.g. "chapter_2") ONLY if the user explicitly asked to move to a different chapter/section than the one currently in view (e.g. "let\'s move to chapter 2", "continue with the cover page"). Vague continuations ("continue", "yes", "keep going", "fill those in") mean the CURRENT chapter — do not set target_chapter_key for those, even if it looks incomplete.',
    '',
    'CRITICAL for update_metadata_field: when the user\'s instruction refers to the CURRENT/existing value instead of spelling out new text — phrases like "the actual title", "the original title", "the full title", "what\'s already there", "the rest of it", "the project name" (when it\'s already set) — you MUST substitute the real current value shown below verbatim into the new value. NEVER write a literal description like "the actual name of the project" or "the original title" as the value itself — that text is a reference to existing data, not the text to save.',
    'Example: current title is "Designing and developing a system". User says "put Smarttraff before it with a colon" → new value is "Smarttraff: Designing and developing a system" (the FULL current title, not a placeholder phrase).',
    '',
    `Current chapter/section in view: ${currentChapterKey || 'unknown'}${currentChapterTitle ? ` (${currentChapterTitle})` : ''}.`,
    currentCoverPage
      ? [
          'Current cover page values (use these verbatim when the user refers to "the current/actual/original" value of any of these):',
          `- title: ${JSON.stringify(currentCoverPage.title || '(not set)')}`,
          `- department: ${JSON.stringify(currentCoverPage.department || '(not set)')}`,
          `- supervisor: ${JSON.stringify(currentCoverPage.supervisor || '(not set)')}`,
          `- academic_year: ${JSON.stringify(currentCoverPage.academic_year || '(not set)')}`,
        ].join('\n')
      : null,
    recentMessages && recentMessages.length
      ? [
          'Recent conversation (most recent last — use this to resolve corrections like "no, I meant X" against what was actually just discussed):',
          ...recentMessages.map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.text}`),
        ].join('\n')
      : null,
    'Respond with ONLY JSON: {"intent":"...","action":{...optional...},"target_chapter_key":"...optional, continue_generation only...","unsupported_reason":"...optional, unsupported_reframe only...","clarifying_question":"...optional...","confidence":0.0-1.0}',
  ]
    .filter((line): line is string => line !== null)
    .join('\n');

  const attemptModelClassification = async (): Promise<IntentClassification | null> => {
    try {
      const raw = await runModel({
        provider,
        model,
        system,
        messages: [{ role: 'user', content: message || '(empty message)' }],
        maxTokens: 400,
      });
      return safeParseClassification(raw);
    } catch (err) {
      console.error('classifyIntent model call failed', err);
      return null;
    }
  };

  // One retry on failure/malformed output before falling back to heuristics —
  // avoids surfacing a transient network/rate-limit blip as a wrong classification.
  const firstAttempt = await attemptModelClassification();
  if (firstAttempt) return firstAttempt;

  const secondAttempt = await attemptModelClassification();
  if (secondAttempt) return secondAttempt;

  console.error('classifyIntent: both model attempts failed, falling back to heuristic classification');
  return heuristicClassify(message, currentChapterKey);
}
