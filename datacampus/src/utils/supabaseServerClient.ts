import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://ljfcygbydsyldjygbnla.supabase.co';
const supabaseServiceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseServiceRole) {
  console.warn('SUPABASE_SERVICE_ROLE_KEY is not set. Server-side storage access will fail.');
}

// Only create the server client if a service role key is provided to avoid runtime errors
export const supabaseServer: SupabaseClient | null = supabaseServiceRole
  ? createClient(supabaseUrl, supabaseServiceRole)
  : null;
