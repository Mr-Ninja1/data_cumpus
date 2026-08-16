const KROKI_ENDPOINT = process.env.KROKI_ENDPOINT || 'https://kroki.io';

export type MermaidThemeVariables = {
  primaryColor?: string;
  primaryTextColor?: string;
  lineColor?: string;
  fontFamily?: string;
};

export function applyMermaidTheme(source: string, theme?: MermaidThemeVariables): string {
  const vars = {
    primaryColor: theme?.primaryColor || '#1a3c6e',
    primaryTextColor: theme?.primaryTextColor || '#0f172a',
    lineColor: theme?.lineColor || theme?.primaryColor || '#1a3c6e',
    fontFamily: theme?.fontFamily || 'Calibri',
  };
  const init = `%%{init: {'theme':'base', 'themeVariables': ${JSON.stringify(vars)}}}%%`;
  return `${init}\n${String(source || '').trim()}`;
}

export type RenderResult = { ok: true; png: Buffer } | { ok: false; error: string };

export async function renderMermaidToPng(mermaidSource: string): Promise<RenderResult> {
  try {
    const res = await fetch(`${KROKI_ENDPOINT}/mermaid/png`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: mermaidSource,
    });
    if (!res.ok) {
      const errorText = await res.text().catch(() => '');
      return { ok: false, error: errorText.trim() || `Diagram render failed (HTTP ${res.status}).` };
    }
    return { ok: true, png: Buffer.from(await res.arrayBuffer()) };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Diagram render request failed.' };
  }
}

export type UseCaseDiagramData = {
  actors: string[];
  use_cases: string[];
  associations: [string, string][];
};

function escapeXml(value: string): string {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function shortLabel(label: string): string {
  return label.length > 22 ? `${label.slice(0, 20)}…` : label;
}

export function buildUseCaseDiagramSvg(data: UseCaseDiagramData, theme?: MermaidThemeVariables): string {
  const primary = theme?.primaryColor || '#1a3c6e';
  const text = theme?.primaryTextColor || '#0f172a';
  const font = theme?.fontFamily || 'Calibri, Arial, sans-serif';

  const actors = data.actors.length ? data.actors : ['Actor'];
  const useCases = data.use_cases.length ? data.use_cases : ['Use case'];

  const actorX = 90;
  const actorSpacingY = 140;
  const topMargin = 80;
  const useCaseX = 420;
  const useCaseWidth = 220;
  const useCaseHeight = 56;
  const useCaseSpacingY = 90;
  const boundaryX = useCaseX - 40;
  const boundaryWidth = useCaseWidth + 80;

  const actorPositions = new Map<string, { x: number; y: number }>();
  actors.forEach((actor, i) => actorPositions.set(actor, { x: actorX, y: topMargin + i * actorSpacingY }));

  const useCasePositions = new Map<string, { x: number; y: number }>();
  useCases.forEach((useCase, i) => useCasePositions.set(useCase, { x: useCaseX, y: topMargin + i * useCaseSpacingY }));

  const width = useCaseX + useCaseWidth + 80;
  const height = Math.max(topMargin + actors.length * actorSpacingY, topMargin + useCases.length * useCaseSpacingY) + 60;

  const stickFigure = (cx: number, cy: number, label: string) => `
    <g>
      <circle cx="${cx}" cy="${cy - 30}" r="12" fill="none" stroke="${text}" stroke-width="2" />
      <line x1="${cx}" y1="${cy - 18}" x2="${cx}" y2="${cy + 15}" stroke="${text}" stroke-width="2" />
      <line x1="${cx - 18}" y1="${cy - 5}" x2="${cx + 18}" y2="${cy - 5}" stroke="${text}" stroke-width="2" />
      <line x1="${cx}" y1="${cy + 15}" x2="${cx - 15}" y2="${cy + 40}" stroke="${text}" stroke-width="2" />
      <line x1="${cx}" y1="${cy + 15}" x2="${cx + 15}" y2="${cy + 40}" stroke="${text}" stroke-width="2" />
      <text x="${cx}" y="${cy + 58}" text-anchor="middle" font-family="${font}" font-size="13" fill="${text}">${escapeXml(label)}</text>
    </g>`;

  const useCaseOval = (cx: number, cy: number, label: string) => `
    <ellipse cx="${cx + useCaseWidth / 2}" cy="${cy}" rx="${useCaseWidth / 2}" ry="${useCaseHeight / 2}" fill="white" stroke="${primary}" stroke-width="2" />
    <text x="${cx + useCaseWidth / 2}" y="${cy + 4}" text-anchor="middle" font-family="${font}" font-size="13" fill="${text}">${escapeXml(shortLabel(label))}</text>`;

  const associationLines = data.associations
    .map(([actor, useCase]) => {
      const a = actorPositions.get(actor);
      const u = useCasePositions.get(useCase);
      if (!a || !u) return '';
      return `<line x1="${a.x + 18}" y1="${a.y - 5}" x2="${u.x}" y2="${u.y}" stroke="${primary}" stroke-width="1.5" />`;
    })
    .join('');

  const actorNodes = actors.map((actor) => {
    const pos = actorPositions.get(actor)!;
    return stickFigure(pos.x, pos.y, actor);
  }).join('');

  const useCaseNodes = useCases.map((useCase) => {
    const pos = useCasePositions.get(useCase)!;
    return useCaseOval(pos.x, pos.y, useCase);
  }).join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <rect x="0" y="0" width="${width}" height="${height}" fill="white" />
    <rect x="${boundaryX}" y="30" width="${boundaryWidth}" height="${height - 60}" rx="12" fill="none" stroke="${primary}" stroke-width="1.5" stroke-dasharray="6,4" />
    ${associationLines}
    ${actorNodes}
    ${useCaseNodes}
  </svg>`;
}

export async function svgToPngBuffer(svg: string, widthPx = 900): Promise<Buffer> {
  const { Resvg } = await import('@resvg/resvg-js');
  const resvg = new Resvg(svg, { fitTo: { mode: 'width', value: widthPx }, background: 'white' });
  return resvg.render().asPng();
}
