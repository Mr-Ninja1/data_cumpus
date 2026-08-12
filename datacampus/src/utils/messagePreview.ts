/** Preview text kept in cloud after body is stripped. */
export function messagePreview(body: string, max = 100): string {
  const t = body.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}
