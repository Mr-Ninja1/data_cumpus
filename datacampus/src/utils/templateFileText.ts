import { supabaseServer } from '@/utils/supabaseServerClient';
import { extractTextFromFile } from '@/utils/extractTextFromFile';

/** Downloads a proposal_templates file from storage and extracts raw text from it. */
export async function getTemplateRawText(templateId: string): Promise<{ text: string; filePath: string } | { error: string }> {
  if (!supabaseServer) return { error: 'Server not configured' };

  const { data: tmpl, error: tmplErr } = await supabaseServer
    .from('proposal_templates')
    .select('file_path')
    .eq('id', templateId)
    .maybeSingle();

  if (tmplErr || !tmpl || !tmpl.file_path) {
    return { error: 'Template not found or missing file_path' };
  }

  const { data: download, error: dlErr } = await supabaseServer.storage
    .from('proposal_templates')
    .download(tmpl.file_path);

  if (dlErr || !download) {
    return { error: 'Failed to download file from storage' };
  }

  const buffer = await download.arrayBuffer();
  const text = await extractTextFromFile(buffer, tmpl.file_path || 'file.txt');
  return { text: text || '', filePath: tmpl.file_path };
}
