import { NextRequest, NextResponse } from 'next/server';
import { getAuthedUser } from '@/utils/serverAuth';
import { supabaseServer } from '@/utils/supabaseServerClient';
import { isStaffRole } from '@/utils/staff';

export const runtime = 'nodejs';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getAuthedUser(req);
  if (!user || !supabaseServer) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data, error } = await supabaseServer.from('generator_jobs').select('*').eq('id', id).maybeSingle();
  if (error || !data) return NextResponse.json({ error: 'Job not found' }, { status: 404 });

  const profile = await supabaseServer.from('profiles').select('role').eq('id', user.id).maybeSingle();
  const userRole = profile.data?.role ?? null;
  if (data.user_id !== user.id && !isStaffRole(userRole)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  return NextResponse.json({ job: data });
}
