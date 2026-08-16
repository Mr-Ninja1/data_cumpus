// Cleans up whatever a student typed as their project title before it gets
// used anywhere else (cover page, reference search, chapter generation).
// Students sometimes enter a title with typos, poor grammar, or no academic
// framing at all — this fixes that while preserving the underlying idea.
// It never invents a new project idea/domain, only tidies the wording and
// applies the school's cover-page convention (e.g. "Designing and
// Developing a/an ...") when the title doesn't already use one.

import { runModel } from '@/utils/models';

export type TitleRefinementResult = {
  title: string;
  originalTitle: string;
  wasRefined: boolean;
};

const ACADEMIC_FRAMING_PATTERN =
  /^(designing and developing|design and development of|development of|design and implementation of|implementation of|design of|an? (investigation|analysis|assessment|study|examination|exploration)\s+(into|of)|a study (into|of)|towards (a|an)|framework for|a framework for)/i;

// Pattern to detect if a title starts with just "an" or "a" followed by the core idea
// (e.g., "an Intelligent...", "a Traffic...") — these should not be wrapped again
const ALREADY_HAS_ARTICLE_PATTERN = /^(an?|the)\s+/i;

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, ' ').trim();
}

function normalizeTokens(value: string): string[] {
  return normalizeWhitespace(value)
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, ' ')
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 2);
}

function tokenOverlapRatio(source: string, candidate: string): number {
  const sourceTokens = Array.from(new Set(normalizeTokens(source)));
  const candidateTokens = new Set(normalizeTokens(candidate));
  if (!sourceTokens.length || !candidateTokens.size) return 0;

  let matches = 0;
  for (const token of sourceTokens) {
    if (candidateTokens.has(token)) matches += 1;
  }
  return matches / sourceTokens.length;
}

/** Very small heuristic clean-up used only if the AI call fails. It cannot
 * fix spelling it doesn't recognize, but it normalizes whitespace/casing and
 * still applies the academic framing convention. */
function heuristicRefine(rawTitle: string): string {
  const cleaned = normalizeWhitespace(rawTitle);
  if (!cleaned) return cleaned;

  const capitalized = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  if (ACADEMIC_FRAMING_PATTERN.test(capitalized)) return capitalized;

  // If title already starts with a simple article ("an Intelligent...", "a Traffic...")
  // frame it as "Design and Development of" instead of wrapping with "Designing and Developing a/an"
  if (ALREADY_HAS_ARTICLE_PATTERN.test(capitalized)) {
    const afterArticle = capitalized.replace(/^(an?|the)\s+/i, '').trim();
    return `Design and Development of ${afterArticle}`;
  }

  const startsWithVowelSound = /^[aeiou]/i.test(capitalized);
  const article = startsWithVowelSound ? 'an' : 'a';
  const lowerFirst = capitalized.charAt(0).toLowerCase() + capitalized.slice(1);
  return `Designing and Developing ${article} ${lowerFirst}`;
}

function isUsableCandidate(candidate: string, originalTitle: string): boolean {
  if (candidate.length < 8 || candidate.length > 220) return false;
  if (/^(sorry|i (can't|cannot)|as an ai)/i.test(candidate)) return false;

  const originalTokens = normalizeTokens(originalTitle);
  const candidateTokens = normalizeTokens(candidate);

  if (originalTokens.length >= 4) {
    if (candidateTokens.length < Math.max(4, Math.ceil(originalTokens.length * 0.6))) return false;
    if (tokenOverlapRatio(originalTitle, candidate) < 0.7) return false;
  }

  return true;
}

/**
 * Refines a raw student-entered project title:
 * - fixes typos/grammar
 * - keeps the same underlying idea/domain (never invents new scope)
 * - applies the "Designing and Developing a/an ..." convention if the title
 *   isn't already framed academically
 * - leaves already-correct, well-framed titles untouched
 */
export async function refineProjectTitle(rawTitle: string): Promise<TitleRefinementResult> {
  const originalTitle = normalizeWhitespace(String(rawTitle || ''));
  if (!originalTitle) {
    return { title: originalTitle, originalTitle, wasRefined: false };
  }

  try {
    const response = await runModel({
      provider: process.env.MODEL_PROVIDER || 'local-stub',
      model: 'default',
      system: [
        'You clean up final year project titles for an academic proposal cover page.',
        'Fix spelling, grammar, and awkward phrasing, but NEVER change the underlying project idea, domain, or scope.',
        'If the title already starts with a simple article ("an Intelligent...", "a Traffic..."), DO NOT add "Designing and Developing" — instead use "Design and Development of [the rest]".',
        'If the title is not already framed in an academic convention, rewrite it using "Designing and Developing a/an [idea]" as the default convention.',
        'If the title already uses an appropriate academic framing and has no real errors, return it unchanged (only fix a clear typo if present) — do not rephrase for its own sake.',
        'Output ONLY the final title text on a single line. No quotes, no explanation, no trailing punctuation.',
      ].join('\n'),
      messages: [{ role: 'user', content: `Raw project title: "${originalTitle}"` }],
      maxTokens: 100,
    });

    const candidate = normalizeWhitespace(String(response || '')).replace(/^["'""]+|["'""]+$/g, '').replace(/[.]+$/, '');
    if (isUsableCandidate(candidate, originalTitle)) {
      return {
        title: candidate,
        originalTitle,
        wasRefined: candidate.toLowerCase() !== originalTitle.toLowerCase(),
      };
    }
  } catch {
    // fall through to heuristic
  }

  const fallback = heuristicRefine(originalTitle);
  return {
    title: fallback,
    originalTitle,
    wasRefined: fallback.toLowerCase() !== originalTitle.toLowerCase(),
  };
}
