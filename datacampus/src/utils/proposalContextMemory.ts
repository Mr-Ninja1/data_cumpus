export type ProposalContextEntry = {
  timestamp: string;
  type: 'user_intent' | 'ai_decision' | 'user_preference' | 'clarification_asked';
  chapter_key?: string;
  content: string;
  resolved?: boolean;
};

export type ProposalContext = {
  last_user_intent?: string;
  preferences: Record<string, string>;
  pending_clarifications: string[];
  recent_decisions: ProposalContextEntry[];
  chapters_with_notes: Record<string, string>;
};

export function buildContextualGenerationPrompt({
  basePrompt,
  context,
  chapterKey,
}: {
  basePrompt: string;
  context?: ProposalContext;
  chapterKey: string;
}): string {
  if (!context) return basePrompt;

  const lines = [basePrompt];

  if (context.last_user_intent) {
    lines.push(`\nRecent user intent: ${context.last_user_intent}`);
  }

  const chapterNote = context.chapters_with_notes?.[chapterKey];
  if (chapterNote) {
    lines.push(`\nUser feedback on ${chapterKey}: ${chapterNote}`);
  }

  const recentPrefs = Object.entries(context.preferences || {});
  if (recentPrefs.length) {
    lines.push('\nEstablished preferences:');
    for (const [key, value] of recentPrefs) lines.push(`- ${key}: ${value}`);
  }

  if (context.pending_clarifications?.length) {
    lines.push('\nPending clarifications:');
    for (const question of context.pending_clarifications) lines.push(`- ${question}`);
  }

  const unresolved = (context.recent_decisions || []).filter((entry) => !entry.resolved).slice(0, 3);
  if (unresolved.length) {
    lines.push('\nRecent unresolved decisions/attempts:');
    for (const entry of unresolved) lines.push(`- ${entry.type}: ${entry.content}`);
  }

  return lines.join('\n');
}

export function extractContextFromUserMessage(message: string): Partial<ProposalContext> {
  const lower = String(message || '').toLowerCase();
  const preferences: Record<string, string> = {};

  if (/\b(concise|brief|short)\b/.test(lower)) preferences.length = 'concise';
  if (/\b(detailed|comprehensive|thorough)\b/.test(lower)) preferences.length = 'detailed';
  if (/\b(formal|academic|professional)\b/.test(lower)) preferences.tone = 'formal';
  if (/\b(casual|conversational|simple)\b/.test(lower)) preferences.tone = 'casual';
  if (/\b(technical|technical-heavy)\b/.test(lower)) preferences.audience = 'technical';
  if (/\b(non-technical|general audience)\b/.test(lower)) preferences.audience = 'general';

  return {
    last_user_intent: String(message || '').slice(0, 200),
    preferences,
  };
}

export function addContextEntry(context: ProposalContext | undefined, entry: ProposalContextEntry): ProposalContext {
  const existing: ProposalContext =
    context || {
      preferences: {},
      chapters_with_notes: {},
      recent_decisions: [],
      pending_clarifications: [],
    };

  return {
    ...existing,
    recent_decisions: [entry, ...existing.recent_decisions].slice(0, 5),
  };
}
