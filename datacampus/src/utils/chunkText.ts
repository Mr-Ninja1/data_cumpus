export function chunkText(text: string, maxChars = 2000) {
  const paragraphs = text.split(/\n\n+/).map(p => p.trim()).filter(Boolean);
  const chunks: string[] = [];

  let buffer = '';
  for (const p of paragraphs) {
    if ((buffer + '\n\n' + p).length <= maxChars) {
      buffer = buffer ? buffer + '\n\n' + p : p;
    } else {
      if (buffer) {
        chunks.push(buffer);
      }
      if (p.length <= maxChars) {
        buffer = p;
      } else {
        // split long paragraph
        for (let i = 0; i < p.length; i += maxChars) {
          chunks.push(p.slice(i, i + maxChars));
        }
        buffer = '';
      }
    }
  }
  if (buffer) chunks.push(buffer);
  return chunks;
}
