import { createClient, SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl) {
  console.warn("NEXT_PUBLIC_SUPABASE_URL is not set in .env.local");
}

if (!supabaseServiceRole) {
  console.warn(
    "SUPABASE_SERVICE_ROLE_KEY is not set. Server-side storage / admin APIs will fail."
  );
}

// Only create the server client if a service role key is provided
export const supabaseServer: SupabaseClient | null =
  supabaseUrl && supabaseServiceRole
    ? createClient(supabaseUrl, supabaseServiceRole)
    : null;
