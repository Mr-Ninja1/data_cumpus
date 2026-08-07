import { NextRequest, NextResponse } from 'next/server';
import { getAuthedUser } from '@/utils/serverAuth';
import { supabaseServer } from '@/utils/supabaseServerClient';

export const runtime = 'nodejs';

// Read submissions for the authenticated user
export async function GET(req: NextRequest) {
  const user = await getAuthedUser(req);
  if (!user || !supabaseServer) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data, error } = await supabaseServer
    .from('verification_submissions')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ submissions: data ?? [] });
}

// Submit a new verification image + OCR payload (client uploads image to storage and provides path)
export async function POST(req: NextRequest) {
  const user = await getAuthedUser(req);
  if (!user || !supabaseServer) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const confidence = typeof body.confidence === 'number' ? body.confidence : null;

  // normalize status from confidence
  let status = 'pending';
  if (confidence !== null) {
    if (confidence >= 0.8) status = 'approved';
    else if (confidence >= 0.6) status = 'needs_review';
    else status = 'pending';
  }

  const insertPayload: any = {
    user_id: user.id,
    image_path: body.filePath || body.imagePath || null,
    ocr_payload: body.ocrPayload || body.rawOcr || {},
    full_name: body.extractedName || null,
    student_id: body.extractedStudentId || null,
    program: body.extractedProgram || null,
    department: body.extractedDepartment || null,
    confidence,
    status,
  };

  const { data, error } = await supabaseServer
    .from('verification_submissions')
    .insert(insertPayload)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // If auto-approved, ensure student_id is unique before updating profile
  if (status === 'approved' && data) {
    // if a student_id was extracted, ensure no other profile has it
    if (insertPayload.student_id) {
      const { data: conflict, error: conflictErr } = await supabaseServer
        .from('profiles')
        .select('id')
        .eq('student_id', insertPayload.student_id)
        .maybeSingle();
      if (conflictErr) {
        console.error('Error checking student_id uniqueness', conflictErr.message);
      }
      // if another profile exists with same student_id and it's not the current user, mark needs_review
      if (conflict && conflict.id && conflict.id !== user.id) {
        await supabaseServer.from('verification_submissions').update({ status: 'needs_review' }).eq('id', data.id);
        return NextResponse.json({ submission: data, note: 'student_id conflict, flagged for review' });
      }
    }

    // proceed to update profile
    
    const { data: existing, error: existingErr } = await supabaseServer
      .from('profiles')
      .select('is_verified, full_name, student_id, program, department, verification_confidence')
      .eq('id', user.id)
      .maybeSingle();

    if (!existingErr) {
      if (!existing || !existing.is_verified) {
        const { error: profileError } = await supabaseServer.from('profiles').upsert(
          {
            id: user.id,
            full_name: insertPayload.full_name || existing?.full_name || null,
            student_id: insertPayload.student_id || existing?.student_id || null,
            program: insertPayload.program || existing?.program || null,
            department: insertPayload.department || existing?.department || null,
            is_verified: true,
            verification_status: 'verified',
            verified_at: new Date().toISOString(),
            verification_confidence: insertPayload.confidence ?? null,
            verification_metadata: insertPayload.ocr_payload || {},
          },
          { onConflict: 'id' }
        );

        if (profileError) console.error('Failed to update profile verification status', profileError.message);
      } else {
        // already verified - just update verification metadata + status
        await supabaseServer.from('profiles').update({
          verification_status: 'verified',
          verification_confidence: insertPayload.confidence ?? existing.verification_confidence,
        }).eq('id', user.id);
      }
    }
  }

  return NextResponse.json({ submission: data });
}
