export type ProposalProjectMeta = {
  title?: string | null;
  department?: string | null;
  supervisor?: string | null;
  academic_year?: string | null;
};

export type ProposalStandard = {
  id: string;
  title: string;
  description: string;
  outputRules: string[];
  sectionGuidance: Record<string, string>;
};

export const DEFAULT_PROPOSAL_STANDARD: ProposalStandard = {
  id: 'default-academic-proposal',
  title: 'Default Academic Proposal Standard',
  description: 'A practical proposal drafting standard for college-level project work, optimized for clear structure, academic tone, and evidence-based reasoning.',
  outputRules: [
    'Write in clear academic English with concise paragraphs.',
    'Keep sections logically ordered and use headings.',
    'Include concrete objectives, a realistic methodology, and a simple implementation plan.',
    'Avoid vague claims; support ideas with practical relevance to the stated department or project context.',
    'If the content is incomplete, note the missing detail rather than inventing unsupported facts.',
  ],
  sectionGuidance: {
    cover: 'Write a concise cover page that includes the project title, student identity when available, department, supervisor, and a professional academic tone.',
    background: 'Describe the background, context, and problem being addressed. Emphasize why the project matters and what gap it addresses.',
    problem_statement: 'State the core problem clearly, focusing on the user need, institutional challenge, or technical gap in a precise way.',
    objectives_scope: 'List realistic objectives and define the scope clearly. Separate what the project will do from what it will not do.',
    architecture_stack: 'Describe the proposed solution, methods, tools, and technical approach. Keep it practical and easy to understand.',
    budget_timeline: 'Provide a realistic budget and timeline with major milestones, expected deliverables, and simple implementation phases.',
    default: 'Draft a strong proposal section that is structured, evidence-based, and aligned to the project context.',
  },
};

export function buildProposalStandardContext(project: ProposalProjectMeta | null, sectionKey: string) {
  const sectionGuidance = DEFAULT_PROPOSAL_STANDARD.sectionGuidance[sectionKey] || DEFAULT_PROPOSAL_STANDARD.sectionGuidance.default;
  const projectTitle = project?.title || 'Untitled Project';
  const department = project?.department || 'department not specified';
  const supervisor = project?.supervisor || 'supervisor not specified';
  const academicYear = project?.academic_year || 'year not specified';

  return [
    `Proposal standard: ${DEFAULT_PROPOSAL_STANDARD.title}`,
    `Context: ${DEFAULT_PROPOSAL_STANDARD.description}`,
    `Project title: ${projectTitle}`,
    `Department: ${department}`,
    `Supervisor: ${supervisor}`,
    `Academic year: ${academicYear}`,
    `Current section: ${sectionKey}`,
    `Section guidance: ${sectionGuidance}`,
    `Output rules: ${DEFAULT_PROPOSAL_STANDARD.outputRules.join(' ')}`,
  ].join('\n');
}
