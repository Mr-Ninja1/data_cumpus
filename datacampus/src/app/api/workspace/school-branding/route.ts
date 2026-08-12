import { NextRequest, NextResponse } from 'next/server';
import { getAuthedUser } from '@/utils/serverAuth';
import { supabaseServer } from '@/utils/supabaseServerClient';
import { loadWorkspaceSchoolSettings } from '@/utils/workspaceSchoolSettings';

export const runtime = 'nodejs';

// Read-only, any-signed-in-user endpoint (not staff-gated) so the student
// workspace can render the same school branding (name, program, logo) that
// the exported document uses. The logo lives in a private storage bucket,
// so this signs a short-lived URL server-side rather than exposing the
// bucket to the client directly.
export async function GET(req: NextRequest) {
  const user = await getAuthedUser(req);
  if (!user || !supabaseServer) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const settings = await loadWorkspaceSchoolSettings();

  let logoUrl: string | null = null;
  if (settings.logo_path) {
    const signed = await supabaseServer.storage
      .from('proposal_templates')
      .createSignedUrl(settings.logo_path, 3600);
    logoUrl = signed.data?.signedUrl || null;
  }

  return NextResponse.json({
    school_name: settings.school_name,
    school_short_name: settings.school_short_name,
    default_program: settings.default_program,
    logo_url: logoUrl,
  });
}
