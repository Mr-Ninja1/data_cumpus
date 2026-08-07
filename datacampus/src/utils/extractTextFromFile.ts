import mammoth from 'mammoth';
import pdf from 'pdf-parse';

export async function extractTextFromFile(buffer: ArrayBuffer, fileName: string) {
  const lower = (fileName || '').toLowerCase();
  try {
    if (lower.endsWith('.pdf')) {
      const data = await pdf(Buffer.from(buffer));
      return data.text || '';
    }

    if (lower.endsWith('.docx') || lower.endsWith('.doc')) {
      const result = await mammoth.extractRawText({ buffer: Buffer.from(buffer) });
      return result.value || '';
    }

    // Fallback: decode as utf-8 text
    const text = new TextDecoder().decode(buffer);
    return text;
  } catch (err) {
    console.error('extractTextFromFile failed', err);
    try {
      return new TextDecoder().decode(buffer);
    } catch (e) {
      return '';
    }
  }
}
