import { NextResponse } from 'next/server';
import { supabaseServer } from '@/utils/supabaseServerClient';

export const runtime = 'nodejs';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    if (!supabaseServer) {
      console.error('supabaseServer not initialized - missing SUPABASE_SERVICE_ROLE_KEY');
      return new NextResponse('Server misconfiguration: missing SUPABASE_SERVICE_ROLE_KEY', { status: 500 });
    }

    // select all columns to avoid errors when older rows don't have `file_path`
    const { data: paper, error } = await supabaseServer.from('papers').select('*').eq('id', id).limit(1).single();
    if (error) {
      console.error('DB error fetching paper', { id, error });
      return new NextResponse('DB error fetching paper', { status: 500 });
    }
    if (!paper) {
      console.warn('Paper not found', { id });
      return new NextResponse('paper not found', { status: 404 });
    }

    // Prefer stored file_path (the storage path saved at upload). If missing, fall back to file_url.
    if (paper.file_path) {
      const { data, error: suError } = await supabaseServer.storage.from('papers').createSignedUrl(paper.file_path, 60);
      if (suError || !data?.signedUrl) {
        console.error('Failed to create signed url', { file_path: paper.file_path, error: suError });
        return new NextResponse('Failed to create signed url for file', { status: 500 });
      }
      const res = await fetch(data.signedUrl);
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        console.error('Upstream fetch failed', { signedUrl: data.signedUrl, status: res.status, text });
        return new NextResponse('Failed to fetch file from storage', { status: 502 });
      }
      const arrayBuffer = await res.arrayBuffer();
      const uint8 = new Uint8Array(arrayBuffer);
      return new NextResponse(uint8, {
        status: 200,
        headers: {
          'Content-Type': 'application/pdf',
          'Cache-Control': 'no-store',
        },
      });
    }

    // fallback: fetch direct URL
    if (paper.file_url) {
      const res = await fetch(paper.file_url);
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        console.error('Upstream file_url fetch failed', { file_url: paper.file_url, status: res.status, text });
        return new NextResponse('Failed to fetch file from URL', { status: 502 });
      }
      const arrayBuffer = await res.arrayBuffer();
      const uint8 = new Uint8Array(arrayBuffer);
      return new NextResponse(uint8, {
        status: 200,
        headers: {
          'Content-Type': 'application/pdf',
          'Cache-Control': 'no-store',
        },
      });
    }

    return new NextResponse('No file available', { status: 404 });
  } catch (e) {
    console.error(e);
    return new NextResponse('Server error', { status: 500 });
  }
}
