"use client";

/** Soft interest signals — never hard-filters the catalog. */

export type Interests = {
  programs: Record<string, number>;
  schools: Record<string, number>;
  types: Record<string, number>;
};

const KEY = "dc:interests";

export function readInterests(): Interests {
  if (typeof window === "undefined") {
    return { programs: {}, schools: {}, types: {} };
  }
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { programs: {}, schools: {}, types: {} };
    const parsed = JSON.parse(raw);
    return {
      programs: parsed.programs || {},
      schools: parsed.schools || {},
      types: parsed.types || {},
    };
  } catch {
    return { programs: {}, schools: {}, types: {} };
  }
}

export function bumpInterest(kind: "programs" | "schools" | "types", value?: string | null, amount = 1) {
  if (!value || typeof window === "undefined") return;
  try {
    const current = readInterests();
    current[kind][value] = (current[kind][value] || 0) + amount;
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    // ignore
  }
}

export function interestScore(
  paper: { program?: string; school?: string; type?: string },
  interests: Interests,
  prefs?: { school?: string; program?: string } | null
) {
  let score = 0;
  if (paper.program) {
    score += (interests.programs[paper.program] || 0) * 3;
    if (prefs?.program && paper.program === prefs.program) score += 8;
  }
  if (paper.school) {
    score += (interests.schools[paper.school] || 0) * 2;
    if (prefs?.school && paper.school === prefs.school) score += 4;
  }
  if (paper.type) {
    score += interests.types[paper.type] || 0;
  }
  return score;
}

/** Stable soft sort: higher interest first, then keep original order for ties. */
export function softRankPapers<T extends { id: string; program?: string; school?: string; type?: string; uploadedAt?: any }>(
  papers: T[],
  prefs?: { school?: string; program?: string } | null
): T[] {
  const interests = readInterests();
  return papers
    .map((p, index) => ({
      p,
      index,
      score: interestScore(p, interests, prefs),
    }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      // newer first among equal interest
      const ta = a.p.uploadedAt ? new Date(a.p.uploadedAt).getTime() : 0;
      const tb = b.p.uploadedAt ? new Date(b.p.uploadedAt).getTime() : 0;
      if (tb !== ta) return tb - ta;
      return a.index - b.index;
    })
    .map((x) => x.p);
}

export function topInterestPrograms(limit = 3): string[] {
  const { programs } = readInterests();
  return Object.entries(programs)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([name]) => name);
}
