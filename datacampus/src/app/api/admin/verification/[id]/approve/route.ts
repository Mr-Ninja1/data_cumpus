import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/utils/supabaseServerClient';
import { getAuthedUser, assertStaffUser } from '@/utils/adminAuth';

export const runtime = 'nodejs';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getAuthedUser(req);
  if (!user || !supabaseServer) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (!(await assertStaffUser(user.id))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const action = body.action || 'approve'; // approve | reject | needs_review
  const notes = body.notes || null;

  // Fetch submission
  const { data: sub, error: subErr } = await supabaseServer
    .from('verification_submissions')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (subErr || !sub) return NextResponse.json({ error: 'Submission not found' }, { status: 404 });

  const newStatus = action === 'reject' ? 'rejected' : action === 'needs_review' ? 'needs_review' : 'approved';

  const { error: updErr } = await supabaseServer
    .from('verification_submissions')
    .update({ status: newStatus, reviewed_by: user.id, review_notes: notes, updated_at: new Date().toISOString() })
    .eq('id', id);

  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });

  // If approved, update profile safely
  if (newStatus === 'approved') {
    const { data: existing, error: existingErr } = await supabaseServer
      .from('profiles')
      .select('is_verified, full_name, student_id, program, verification_confidence')
      .eq('id', sub.user_id)
      .maybeSingle();

    if (!existingErr) {
      if (!existing || !existing.is_verified) {
        const { error: profileError } = await supabaseServer.from('profiles').upsert(
          {
            id: sub.user_id,
            full_name: sub.full_name || existing?.full_name || null,
            student_id: sub.student_id || existing?.student_id || null,
            program: sub.program || existing?.program || null,
            is_verified: true,
            verification_status: 'verified',
            verified_at: new Date().toISOString(),
            verification_confidence: sub.confidence ?? null,
            verification_metadata: sub.ocr_payload || {},
          },
          { onConflict: 'id' }
        );

        if (profileError) console.error('Failed to update profile during admin approval', profileError.message);
      } else {
        await supabaseServer.from('profiles').update({ verification_status: 'verified' }).eq('id', sub.user_id);
      }
    }
  }

  return NextResponse.json({ success: true, status: newStatus });
}
