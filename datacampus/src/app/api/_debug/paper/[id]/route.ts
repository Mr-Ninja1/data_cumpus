import { NextResponse } from 'next/server';
import { supabaseServer } from '@/utils/supabaseServerClient';
import { supabase } from '@/utils/supabaseClient';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const client = supabaseServer ?? supabase;
    const { data, error } = await client.from('papers').select('*').eq('id', id).limit(1).single();
    if (error) {
      console.error('Debug: DB error fetching paper', { id, error });
      return NextResponse.json({ ok: false, error: String(error) }, { status: 500 });
    }
    if (!data) return NextResponse.json({ ok: false, error: 'not found' }, { status: 404 });
    console.log('Debug: paper row', { id, data });
    return NextResponse.json({ ok: true, data });
  } catch (e) {
    console.error('Debug route error', e);
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
