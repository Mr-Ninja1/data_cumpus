import { runModel } from './models';
import { getDiagramRegistryEntry, type DiagramRegistryEntry } from './diagramRegistry';
import {
  applyMermaidTheme,
  buildUseCaseDiagramSvg,
  renderMermaidToPng,
  svgToPngBuffer,
  type MermaidThemeVariables,
  type UseCaseDiagramData,
} from './diagramRenderer';
import { getImageDimensions, fitWithinBox } from './imageDimensions';

export type GenerateDiagramInput = {
  diagramKey: string;
  chapterTitle: string;
  projectTitle: string;
  instruction?: string;
  theme?: MermaidThemeVariables;
  provider: string;
  model: string;
  signal?: AbortSignal;
};

export type GeneratedDiagram = {
  ok: true;
  diagramKey: string;
  method: 'mermaid' | 'custom_svg_template';
  pngBase64: string;
  width: number;
  height: number;
  source: string;
};

export type GenerateDiagramFailure = { ok: false; diagramKey: string; error: string };

const MAX_DIAGRAM_WIDTH = 560;
const MAX_DIAGRAM_HEIGHT = 420;

function stripCodeFences(text: string): string {
  const fenced = String(text || '').trim().match(/^```(?:\w+)?\s*([\s\S]*?)```$/);
  return (fenced ? fenced[1] : text).trim();
}

function parseJsonLoose(text: string): unknown | null {
  const cleaned = stripCodeFences(text);
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start === -1 || end === -1 || end <= start) return null;
    try {
      return JSON.parse(cleaned.slice(start, end + 1));
    } catch {
      return null;
    }
  }
}

function validateUseCaseData(value: unknown): { ok: true; data: UseCaseDiagramData } | { ok: false; error: string } {
  if (!value || typeof value !== 'object') return { ok: false, error: 'Response was not a JSON object.' };
  const obj = value as Record<string, unknown>;
  const actors = Array.isArray(obj.actors) ? obj.actors.filter((a): a is string => typeof a === 'string' && Boolean(a.trim())) : [];
  const useCases = Array.isArray(obj.use_cases) ? obj.use_cases.filter((u): u is string => typeof u === 'string' && Boolean(u.trim())) : [];
  if (!actors.length) return { ok: false, error: 'Missing or empty "actors" array.' };
  if (!useCases.length) return { ok: false, error: 'Missing or empty "use_cases" array.' };

  const rawAssociations = Array.isArray(obj.associations) ? obj.associations : [];
  const associations: [string, string][] = [];
  for (const pair of rawAssociations) {
    if (Array.isArray(pair) && pair.length === 2 && typeof pair[0] === 'string' && typeof pair[1] === 'string') {
      if (actors.includes(pair[0]) && useCases.includes(pair[1])) associations.push([pair[0], pair[1]]);
    }
  }
  if (!associations.length) return { ok: false, error: 'No valid "associations" entries linking an actor to a use case.' };

  return { ok: true, data: { actors, use_cases: useCases, associations } };
}

async function generateMermaidDiagram(
  input: GenerateDiagramInput,
  entry: Extract<DiagramRegistryEntry, { method: 'mermaid' }>
): Promise<GeneratedDiagram | GenerateDiagramFailure> {
  const system = [
    `You produce Mermaid "${entry.mermaidType}" diagrams for academic project proposals.`,
    'Output ONLY valid Mermaid syntax for this diagram type — no markdown code fences, no commentary, no explanation.',
    'Keep labels concise so the rendered diagram stays readable.',
  ].join('\n');

  const basePrompt = [
    `Project: "${input.projectTitle}"`,
    `Chapter: "${input.chapterTitle}"`,
    `Diagram to draw: ${entry.label}.`,
    input.instruction ? `Specific guidance: ${input.instruction}` : 'No specific guidance given — infer a sensible diagram from the project and chapter context.',
  ].join('\n');

  let mermaidSource = '';
  let lastError = '';
  for (let attempt = 1; attempt <= 2; attempt++) {
    const messages =
      attempt === 1
        ? [{ role: 'user' as const, content: basePrompt }]
        : [
            { role: 'user' as const, content: basePrompt },
            { role: 'assistant' as const, content: mermaidSource },
            { role: 'user' as const, content: `That diagram failed to render with this error: "${lastError}". Fix the Mermaid syntax and output ONLY the corrected diagram.` },
          ];

    try {
      mermaidSource = stripCodeFences(
        String(
          await runModel({
            provider: input.provider,
            model: input.model,
            system,
            messages,
            maxTokens: 600,
            signal: input.signal,
          })
        )
      );
    } catch (err) {
      return { ok: false, diagramKey: input.diagramKey, error: err instanceof Error ? err.message : 'Diagram generation model call failed.' };
    }

    const rendered = await renderMermaidToPng(applyMermaidTheme(mermaidSource, input.theme));
    if (rendered.ok) {
      const dimensions = getImageDimensions(rendered.png);
      const { width, height } = dimensions ? fitWithinBox(dimensions, MAX_DIAGRAM_WIDTH, MAX_DIAGRAM_HEIGHT) : { width: MAX_DIAGRAM_WIDTH, height: 300 };
      return { ok: true, diagramKey: input.diagramKey, method: 'mermaid', pngBase64: rendered.png.toString('base64'), width, height, source: mermaidSource };
    }
    lastError = rendered.error;
  }

  return { ok: false, diagramKey: input.diagramKey, error: `Couldn't generate a valid "${entry.label}" diagram after 2 attempts. Last error: ${lastError}` };
}

async function generateUseCaseDiagram(
  input: GenerateDiagramInput,
  entry: Extract<DiagramRegistryEntry, { method: 'custom_svg_template' }>
): Promise<GeneratedDiagram | GenerateDiagramFailure> {
  const system = [
    'You produce structured data for a Use Case diagram in an academic project proposal.',
    'Output ONLY valid JSON matching exactly this schema, with no markdown code fences or commentary:',
    '{"actors": ["Actor A"], "use_cases": ["Use Case 1"], "associations": [["Actor A", "Use Case 1"]]}',
    'Every association pair must exactly match an actor string and a use case string already listed above.',
    'Keep labels short.',
  ].join('\n');

  const basePrompt = [
    `Project: "${input.projectTitle}"`,
    `Chapter: "${input.chapterTitle}"`,
    `Diagram to draw: ${entry.label}.`,
    input.instruction ? `Specific guidance: ${input.instruction}` : 'No specific guidance given — infer sensible actors and use cases from the project and chapter context.',
  ].join('\n');

  let raw = '';
  let lastError = '';
  for (let attempt = 1; attempt <= 2; attempt++) {
    const messages =
      attempt === 1
        ? [{ role: 'user' as const, content: basePrompt }]
        : [
            { role: 'user' as const, content: basePrompt },
            { role: 'assistant' as const, content: raw },
            { role: 'user' as const, content: `That response was invalid: "${lastError}". Fix it and output ONLY the corrected JSON.` },
          ];

    try {
      raw = String(
        await runModel({
          provider: input.provider,
          model: input.model,
          system,
          messages,
          maxTokens: 500,
          signal: input.signal,
        })
      );
    } catch (err) {
      return { ok: false, diagramKey: input.diagramKey, error: err instanceof Error ? err.message : 'Diagram generation model call failed.' };
    }

    const parsed = parseJsonLoose(raw);
    const validated = parsed ? validateUseCaseData(parsed) : { ok: false as const, error: 'Response was not valid JSON.' };
    if (validated.ok) {
      try {
        const svg = buildUseCaseDiagramSvg(validated.data, input.theme);
        const png = await svgToPngBuffer(svg, MAX_DIAGRAM_WIDTH);
        const dimensions = getImageDimensions(png);
        const { width, height } = dimensions ? fitWithinBox(dimensions, MAX_DIAGRAM_WIDTH, MAX_DIAGRAM_HEIGHT) : { width: MAX_DIAGRAM_WIDTH, height: 300 };
        return { ok: true, diagramKey: input.diagramKey, method: 'custom_svg_template', pngBase64: png.toString('base64'), width, height, source: JSON.stringify(validated.data) };
      } catch (err) {
        lastError = err instanceof Error ? err.message : 'SVG rendering failed.';
        continue;
      }
    }
    lastError = validated.error;
  }

  return { ok: false, diagramKey: input.diagramKey, error: `Couldn't generate a valid "${entry.label}" diagram after 2 attempts. Last error: ${lastError}` };
}

export async function generateDiagram(input: GenerateDiagramInput): Promise<GeneratedDiagram | GenerateDiagramFailure> {
  const entry = getDiagramRegistryEntry(input.diagramKey);
  if (!entry) return { ok: false, diagramKey: input.diagramKey, error: `Unknown diagram type "${input.diagramKey}".` };
  return entry.method === 'mermaid' ? generateMermaidDiagram(input, entry) : generateUseCaseDiagram(input, entry);
}
