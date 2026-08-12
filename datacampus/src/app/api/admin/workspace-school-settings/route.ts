import { NextRequest, NextResponse } from 'next/server';
import { getAuthedUser, assertStaffUser } from '@/utils/adminAuth';
import { supabaseServer } from '@/utils/supabaseServerClient';
import { DEFAULT_WORKSPACE_SCHOOL_SETTINGS } from '@/utils/workspaceSchoolSettings';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const user = await getAuthedUser(req);
  if (!user || !supabaseServer) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!(await assertStaffUser(user.id))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { data, error } = await supabaseServer
    .from('workspace_school_settings')
    .select('school_name,school_short_name,default_program,default_proposal_spec_key,logo_path,metadata')
    .eq('id', 'default')
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ settings: data || DEFAULT_WORKSPACE_SCHOOL_SETTINGS });
}

export async function POST(req: NextRequest) {
  const user = await getAuthedUser(req);
  if (!user || !supabaseServer) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!(await assertStaffUser(user.id))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const next = {
    id: 'default',
    school_name:
      typeof body.school_name === 'string' && body.school_name.trim()
        ? body.school_name.trim().slice(0, 160)
        : DEFAULT_WORKSPACE_SCHOOL_SETTINGS.school_name,
    school_short_name:
      typeof body.school_short_name === 'string' && body.school_short_name.trim()
        ? body.school_short_name.trim().slice(0, 32)
        : DEFAULT_WORKSPACE_SCHOOL_SETTINGS.school_short_name,
    default_program:
      typeof body.default_program === 'string' && body.default_program.trim()
        ? body.default_program.trim().slice(0, 120)
        : null,
    default_proposal_spec_key:
      typeof body.default_proposal_spec_key === 'string' && body.default_proposal_spec_key.trim()
        ? body.default_proposal_spec_key.trim().slice(0, 120)
        : null,
    logo_path:
      typeof body.logo_path === 'string' && body.logo_path.trim() ? body.logo_path.trim().slice(0, 500) : null,
    metadata: typeof body.metadata === 'object' && body.metadata ? body.metadata : {},
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabaseServer
    .from('workspace_school_settings')
    .upsert(next, { onConflict: 'id' })
    .select('school_name,school_short_name,default_program,default_proposal_spec_key,logo_path,metadata')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ settings: data });
}
