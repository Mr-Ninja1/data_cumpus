import { NextRequest, NextResponse } from 'next/server';
import { getAuthedUser, assertStaffUser } from '@/utils/adminAuth';
import { supabaseServer } from '@/utils/supabaseServerClient';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const user = await getAuthedUser(req as any);
  if (!user || !supabaseServer) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!(await assertStaffUser(user.id))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { data, error } = await supabaseServer.from('document_specs').select('*').order('updated_at', { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ specs: data ?? [] });
}

export async function POST(req: NextRequest) {
  const user = await getAuthedUser(req as any);
  if (!user || !supabaseServer) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!(await assertStaffUser(user.id))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const { key, title, description, spec_md, examples, is_public, approved } = body;
  if (!key || !title) return NextResponse.json({ error: 'Missing key or title' }, { status: 400 });

  const { data, error } = await supabaseServer
    .from('document_specs')
    .upsert({ key, title, description: description || null, spec_md: spec_md || '', examples: examples || [], user_id: user.id, is_public: !!is_public, approved: !!approved }, { onConflict: 'key' })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ spec: data });
}
