// Implements the reference-discovery flow described in cd.md:
//
//   1. Decompose the title into a handful of research angles (not a single
//      raw-title search) so results look researched, not like one lucky hit.
//   2. Search each angle for real sources via a scholarly API (Crossref).
//   3. Quality-check before committing: relevance to its angle, credible
//      venue type.
//   4a. If strong, store them tagged source: "ai_sourced" and proceed.
//   4b. If thin, say so specifically (how many, and which angle came up
//       empty) instead of padding with weak matches.
//
// The References page itself is rendered deterministically from this stored
// data elsewhere (see the export route) — this file only finds and qualifies
// candidates, it never writes reference-page prose.

import { runModel } from '@/utils/models';
import { deriveHeuristicResearchAngles } from '@/utils/proposalFlow';

export type DiscoveredReference = {
  id: string;
  title: string;
  author: string;
  year: number | null;
  source: 'ai_sourced';
  provider: 'crossref';
  citation_key: string;
  doi?: string;
  url?: string;
  journal?: string;
  publisher?: string;
  matched_angle: string;
};

export type ReferenceLookupResult = {
  status: 'found' | 'shallow' | 'not_found' | 'not_enough_title_detail' | 'failed';
  message: string;
  searched_at: string;
  query: string;
  angles_used?: string[];
  angles_with_no_results?: string[];
  source?: 'crossref';
};

type CrossrefAuthor = { given?: string; family?: string };
type CrossrefItem = {
  DOI?: string;
  URL?: string;
  title?: string[];
  author?: CrossrefAuthor[];
  issued?: { 'date-parts'?: number[][] };
  publisher?: string;
  'container-title'?: string[];
  type?: string;
};

const CREDIBLE_TYPES = new Set(['journal-article', 'proceedings-article', 'book-chapter', 'book', 'posted-content']);

function normalizeTokens(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, ' ')
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 2);
}

function overlapScore(query: string, candidate: string): number {
  const queryTokens = Array.from(new Set(normalizeTokens(query)));
  const candidateTokens = new Set(normalizeTokens(candidate));
  if (!queryTokens.length || !candidateTokens.size) return 0;
  let matches = 0;
  for (const token of queryTokens) if (candidateTokens.has(token)) matches += 1;
  return matches / queryTokens.length;
}

function authorLabel(authors?: CrossrefAuthor[]) {
  if (!authors?.length) return 'Unknown';
  const names = authors
    .slice(0, 3)
    .map((author) => [author.given, author.family].filter(Boolean).join(' ').trim())
    .filter(Boolean);
  if (!names.length) return 'Unknown';
  return authors.length > 3 ? `${names.join(', ')} et al.` : names.join(', ');
}

function extractYear(item: CrossrefItem): number | null {
  const year = item.issued?.['date-parts']?.[0]?.[0];
  return typeof year === 'number' ? year : null;
}

/**
 * Breaks a project title into 3-5 concise research angles for literature
 * search. Tries a small AI call first (cheap, fast); falls back to the
 * keyword heuristic already used for literature-review guidance so this
 * never hard-fails if the model call errors out.
 */
export async function decomposeIntoResearchAngles(title: string): Promise<string[]> {
  const heuristicAngles = deriveHeuristicResearchAngles(title);

  try {
    const response = await runModel({
      provider: process.env.MODEL_PROVIDER || 'local-stub',
      model: 'default',
      system:
        'You break an academic final year project title into 3-5 concise research angles for literature search. Output only the angles, one per line, no numbering, no explanation, no extra text.',
      messages: [{ role: 'user', content: `Project title: ${title}` }],
      maxTokens: 200,
    });

    const lines = String(response || '')
      .split(/\r?\n/)
      .map((line) => line.replace(/^[-•\d.\s]+/, '').trim())
      .filter((line) => line.length > 4 && line.length < 140);

    if (lines.length >= 2) {
      return Array.from(new Set([title, ...lines])).slice(0, 6);
    }
  } catch {
    // fall through to heuristic
  }

  return Array.from(new Set([title, ...heuristicAngles])).slice(0, 6);
}

async function searchCrossref(query: string, useTitleField: boolean, rows = 6): Promise<CrossrefItem[]> {
  try {
    const url = new URL('https://api.crossref.org/works');
    if (useTitleField) {
      url.searchParams.set('query.title', query);
    } else {
      url.searchParams.set('query.bibliographic', query);
    }
    url.searchParams.set('rows', String(rows));
    url.searchParams.set('sort', 'relevance');
    url.searchParams.set('select', 'DOI,title,author,issued,publisher,container-title,URL,type');

    const res = await fetch(url.toString(), {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'DataCampus/1.0 (academic-reference-assist)',
      },
      cache: 'no-store',
    });

    if (!res.ok) return [];
    const json = await res.json();
    return Array.isArray(json?.message?.items) ? json.message.items : [];
  } catch {
    return [];
  }
}

/**
 * The full discovery flow: decompose -> search each angle -> merge/dedupe ->
 * quality-check -> honest status. This is the only place that should call
 * the scholarly search API for proposal references, so both the manual
 * "Find references" action and the auto-start-on-creation flow stay
 * consistent.
 */
export async function discoverReferencesForTitle(title: string): Promise<{
  references: DiscoveredReference[];
  lookup: ReferenceLookupResult;
}> {
  const query = String(title || '').trim();

  if (query.length < 6) {
    return {
      references: [],
      lookup: {
        status: 'not_enough_title_detail',
        message: 'Add a more descriptive project title before auto-searching for references.',
        searched_at: new Date().toISOString(),
        query,
      },
    };
  }

  let angles: string[] = [];
  try {
    angles = await decomposeIntoResearchAngles(query);
  } catch {
    angles = [query, ...deriveHeuristicResearchAngles(query)];
  }

  const searchAngles = angles.filter((angle) => angle && angle !== query);

  try {
    const [titleResults, ...angleResultsList] = await Promise.all([
      searchCrossref(query, true, 6),
      ...searchAngles.map((angle) => searchCrossref(angle, false, 5)),
    ]);

    const candidates: Array<{ item: CrossrefItem; matchedAngle: string; score: number }> = [];

    for (const item of titleResults) {
      if (!CREDIBLE_TYPES.has(String(item.type || '').toLowerCase())) continue;
      const titleText = item.title?.[0]?.trim();
      if (!titleText) continue;
      const score = overlapScore(query, titleText);
      if (score >= 0.25) candidates.push({ item, matchedAngle: query, score });
    }

    const anglesWithNoResults: string[] = [];
    angleResultsList.forEach((items, index) => {
      const angle = searchAngles[index];
      let found = false;
      for (const item of items) {
        if (!CREDIBLE_TYPES.has(String(item.type || '').toLowerCase())) continue;
        const titleText = item.title?.[0]?.trim();
        if (!titleText) continue;
        // Angle-sourced results are checked for relevance against the angle
        // itself (which is intentionally broader than the raw title), not
        // the title — that is the whole point of decomposing first.
        const score = overlapScore(angle, titleText);
        if (score >= 0.34) {
          candidates.push({ item, matchedAngle: angle, score });
          found = true;
        }
      }
      if (!found) anglesWithNoResults.push(angle);
    });

    // Dedupe by DOI, falling back to normalized title.
    const seen = new Set<string>();
    const deduped = candidates
      .sort((a, b) => b.score - a.score)
      .filter(({ item }) => {
        const key = (item.DOI || item.title?.[0] || '').toLowerCase().trim();
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, 6);

    const references: DiscoveredReference[] = deduped.map(({ item, matchedAngle }, index) => ({
      id: `ai_ref_${index + 1}`,
      title: item.title?.[0]?.trim() || 'Untitled source',
      author: authorLabel(item.author),
      year: extractYear(item),
      source: 'ai_sourced',
      provider: 'crossref',
      citation_key: (item.DOI || `ai_ref_${index + 1}`).replace(/[^a-z0-9]+/gi, '_').slice(0, 60),
      doi: item.DOI?.trim() || undefined,
      url: item.URL?.trim() || undefined,
      journal: item['container-title']?.[0]?.trim() || undefined,
      publisher: item.publisher?.trim() || undefined,
      matched_angle: matchedAngle,
    }));

    const lookup: ReferenceLookupResult = references.length >= 3
      ? {
          status: 'found',
          message: `Found ${references.length} credible academic reference${references.length === 1 ? '' : 's'} across ${angles.length} research angle${angles.length === 1 ? '' : 's'} (${angles.join('; ')}).`,
          searched_at: new Date().toISOString(),
          query,
          angles_used: angles,
          source: 'crossref',
        }
      : references.length > 0
        ? {
            status: 'shallow',
            message: `Only found ${references.length} directly relevant source${references.length === 1 ? '' : 's'} out of ${angles.length} research angles searched. ${
              anglesWithNoResults.length
                ? `No results for: ${anglesWithNoResults.join('; ')}. Try searching one of those angles yourself, or your library's database, for more.`
                : 'You may want to add a few more manually before drafting the literature review.'
            }`,
            searched_at: new Date().toISOString(),
            query,
            angles_used: angles,
            angles_with_no_results: anglesWithNoResults,
            source: 'crossref',
          }
        : {
            status: 'not_found',
            message: `We could not find enough credible academic sources across ${angles.length} research angle${angles.length === 1 ? '' : 's'} (${angles.join('; ')}). Try refining the title, or search your library's database directly for these angles.`,
            searched_at: new Date().toISOString(),
            query,
            angles_used: angles,
            source: 'crossref',
          };

    return { references, lookup };
  } catch {
    return {
      references: [],
      lookup: {
        status: 'failed',
        message: 'Reference lookup failed. Try again in a moment.',
        searched_at: new Date().toISOString(),
        query,
        angles_used: angles,
      },
    };
  }
}
