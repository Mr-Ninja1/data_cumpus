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
  const nameMap: Record<string, string> = {};
  if (senderIds.length) {
    const { data: profiles } = await supabaseServer
      .from('profiles')
      .select('id, display_name, role, is_verified')
      .in('id', senderIds);
    for (const p of profiles || []) {
      nameMap[p.id] = p.display_name || 'User';
    }
  }

  return NextResponse.json({
    requests: pending.map((m) => ({
      ...m,
      sender_name: nameMap[m.sender_id] || 'User',
      fee_charged: (m.metadata as { fee_charged?: number } | null)?.fee_charged || 0,
    })),
  });
}
