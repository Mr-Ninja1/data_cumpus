import { NextRequest } from 'next/server';
import { supabaseServer } from '@/utils/supabaseServerClient';

export async function getAuthedUser(req: NextRequest | Request) {
  const authHeader = req.headers.get('authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token || !supabaseServer) {
    return null;
  }

  const { data, error } = await supabaseServer.auth.getUser(token);
  if (error || !data.user) {
    return null;
  }

  return data.user;
}
