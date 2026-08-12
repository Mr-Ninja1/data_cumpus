import { NextRequest, NextResponse } from 'next/server';
import { getAuthedUser, assertStaffUser } from '@/utils/adminAuth';
import { supabaseServer } from '@/utils/supabaseServerClient';

type TemplateRow = {
  id: string;
  title: string;
  description?: string | null;
  file_path?: string | null;
  metadata?: Record<string, unknown> | null;
  approved?: boolean;
  is_public?: boolean;
  updated_at?: string | null;
};

type ChunkRow = {
  template_id: string;
};

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const user = await getAuthedUser(req);
  if (!user || !supabaseServer) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!(await assertStaffUser(user.id))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { data, error } = await supabaseServer.from('proposal_templates').select('*').order('updated_at', { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const templates = (data || []) as TemplateRow[];
  const ids = templates.map((template) => template.id);

  const chunkCounts = new Map<string, number>();
  if (ids.length) {
    const { data: chunks, error: chunkError } = await supabaseServer
      .from('proposal_template_chunks')
      .select('template_id')
      .in('template_id', ids);
    if (chunkError) return NextResponse.json({ error: chunkError.message }, { status: 500 });
    for (const chunk of (chunks || []) as ChunkRow[]) {
      chunkCounts.set(chunk.template_id, (chunkCounts.get(chunk.template_id) || 0) + 1);
    }
  }

  return NextResponse.json({
    templates: templates.map((template) => ({
      ...template,
      chunk_count: chunkCounts.get(template.id) || 0,
    })),
  });
}

export async function POST(req: NextRequest) {
  const user = await getAuthedUser(req);
  if (!user || !supabaseServer) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!(await assertStaffUser(user.id))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const { title, description, file_path, metadata, approved, is_public } = body;

  const mergedMetadata = {
    school: 'Zambia University College of Technology',
    doc_type: 'project_proposal',
    ...(metadata || {}),
  };

  const { data, error } = await supabaseServer
    .from('proposal_templates')
    .insert({
      user_id: user.id,
      title: title || 'Untitled Template',
      description: description || null,
      file_path: file_path || null,
      metadata: mergedMetadata,
      approved: typeof approved === 'boolean' ? approved : true,
      is_public: typeof is_public === 'boolean' ? is_public : true,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ template: data });
}
