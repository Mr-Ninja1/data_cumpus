import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/utils/supabaseServerClient';
import { getAuthedUser, assertStaffUser } from '@/utils/adminAuth';

export const runtime = 'nodejs';

/**
 * Runs the same cleanup as the pg_cron job (dc_cleanup_ephemeral_data):
 * prunes declined/blocked message requests and completed Spotlight
 * campaigns older than 30 days. Portable trigger that works whether or
 * not pg_cron is enabled on this Supabase project — call it either:
 *  - manually, as a signed-in staff member (Authorization: Bearer <token>)
 *  - from an external scheduler (e.g. a Vercel Cron Job) using a shared
 *    secret header: `x-cron-secret: <CRON_SECRET env var>`
 */
export async function POST(req: NextRequest) {
  if (!supabaseServer) {
    return NextResponse.json({ error: 'Server not configured' }, { status: 500 });
  }

  const cronSecret = process.env.CRON_SECRET;
  const providedSecret = req.headers.get('x-cron-secret');
  const isCronCaller = Boolean(cronSecret && providedSecret && cronSecret === providedSecret);

  if (!isCronCaller) {
    const user = await getAuthedUser(req);
    if (!user || !(await assertStaffUser(user.id))) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const { error } = await supabaseServer.rpc('dc_cleanup_ephemeral_data');
  if (error) {
    return NextResponse.json(
      { error: error.message.includes('dc_cleanup_ephemeral_data') ? 'Run social_economy_v3.sql in Supabase first' : error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, ranAt: new Date().toISOString() });
}
