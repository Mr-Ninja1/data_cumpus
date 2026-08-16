export type IeeeReferenceEntry = {
  id?: string;
  title?: string;
  author?: string;
  year?: number | string | null;
  journal?: string;
  publisher?: string;
  url?: string;
  doi?: string;
  citation_key?: string;
};

type FormatIeeeReferenceOptions = {
  quoteStyle?: 'straight' | 'curly';
};

function quotePair(style: FormatIeeeReferenceOptions['quoteStyle'] = 'curly'): [string, string] {
  if (style === 'straight') return ['"', '"'];
  return ['\u201c', '\u201d'];
}

/** Formats a stored reference entry as a numbered IEEE bibliography line. */
export function formatIeeeReference(
  ref: IeeeReferenceEntry | null | undefined,
  index: number,
  options: FormatIeeeReferenceOptions = {}
): string {
  const author = String(ref?.author || 'Unknown').trim();
  const title = String(ref?.title || ref?.citation_key || 'Reference').trim();
  const journal = String(ref?.journal || ref?.publisher || '').trim();
  const year = String(ref?.year ?? 'n.d.').trim();
  const url = String(ref?.url || '').trim();
  const doi = String(ref?.doi || '').trim();
  const tail = doi ? `doi: ${doi}` : url ? `Available: ${url}` : '';
  const container = journal ? `, ${journal}` : '';
  const suffix = tail ? `, ${tail}` : '';
  const [openQuote, closeQuote] = quotePair(options.quoteStyle);

  return `[${index + 1}] ${author}, ${openQuote}${title}${closeQuote}${container}, ${year}${suffix}.`;
}
