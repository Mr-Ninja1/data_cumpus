import { NextRequest, NextResponse } from 'next/server';
import { getAuthedUser } from '@/utils/serverAuth';
import { supabaseServer } from '@/utils/supabaseServerClient';

export const runtime = 'nodejs';

// Pending cold-outreach message requests waiting on the current user's
// accept / decline / block decision.
export async function GET(req: NextRequest) {
  const user = await getAuthedUser(req);
  if (!user || !supabaseServer) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data, error } = await supabaseServer
    .from('messages')
    .select('id, sender_id, recipient_id, subject, body, kind, metadata, created_at')
    .eq('recipient_id', user.id)
    .eq('kind', 'request')
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const pending = (data || []).filter((m) => {
    const meta = (m.metadata || {}) as { status?: string };
    return !meta.status || meta.status === 'pending';
  });

  const senderIds = [...new Set(pending.map((m) => m.sender_id).filter(Boolean))];
  const profileMap: Record<string, { name: string; role: string | null; verified: boolean }> = {};
  if (senderIds.length) {
    const { data: profiles } = await supabaseServer
      .from('profiles')
      .select('id, display_name, role, is_verified, verification_status')
      .in('id', senderIds);
    for (const p of profiles || []) {
      profileMap[p.id] = {
        name: p.display_name || 'User',
        role: p.role || null,
        verified: Boolean(p.is_verified) || p.verification_status === 'verified',
      };
    }
  }

  return NextResponse.json({
    requests: pending.map((m) => {
      const profile = profileMap[m.sender_id] || { name: 'User', role: null, verified: false };
      return {
        ...m,
        sender_name: profile.name,
        sender_role: profile.role,
        sender_verified: profile.verified,
        fee_charged: (m.metadata as { fee_charged?: number } | null)?.fee_charged || 0,
      };
    }),
  });
}
