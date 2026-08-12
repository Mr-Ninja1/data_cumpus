import { NextRequest, NextResponse } from 'next/server';
import { getAuthedUser, assertStaffUser } from '../../../../../utils/adminAuth';
import { supabaseServer } from '../../../../../utils/supabaseServerClient';

export const runtime = 'nodejs';

const ALLOWED_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/svg+xml',
]);

function safeName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/-+/g, '-').toLowerCase();
}

export async function POST(req: NextRequest) {
  const user = await getAuthedUser(req);
  if (!user || !supabaseServer) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!(await assertStaffUser(user.id))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const formData = await req.formData().catch(() => null);
  const file = formData?.get('file');

  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'Missing logo file' }, { status: 400 });
  }

  if (!ALLOWED_TYPES.has(file.type)) {
    return NextResponse.json({ error: 'Unsupported logo format. Use PNG, JPG, WEBP, or SVG.' }, { status: 400 });
  }

  const buf = Buffer.from(await file.arrayBuffer());
  const path = `school_assets/${Date.now()}_${safeName(file.name || 'zut-logo.png')}`;

  const { error } = await supabaseServer.storage.from('proposal_templates').upload(path, buf, {
    contentType: file.type,
    upsert: true,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ path, message: 'Logo uploaded successfully' });
}
