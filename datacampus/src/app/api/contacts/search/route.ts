import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { supabaseServer } from "@/utils/supabaseServerClient";

export const runtime = "nodejs";

async function authedUser(req: NextRequest) {
  const auth = req.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return null;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return null;
  const client = createClient(url, anon, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data } = await client.auth.getUser();
  return data.user ?? null;
}

/**
 * GET /api/contacts/search?q=name-or-student-id
 * Finds students by display_name, full_name, or student_id.
 */
export async function GET(req: NextRequest) {
  const user = await authedUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const q = (req.nextUrl.searchParams.get("q") || "").trim();
  if (q.length < 2) return NextResponse.json({ contacts: [] });

  const sb = supabaseServer;
  if (!sb) return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });

  const safe = q.replace(/[%_,]/g, " ").trim();
  const like = `%${safe}%`;
  const { data, error } = await sb
    .from("profiles")
    .select("id, display_name, full_name, student_id, program, is_verified, verification_status, role")
    .or(`display_name.ilike.${like},full_name.ilike.${like},student_id.ilike.${like}`)
    .neq("id", user.id)
    .limit(20);

  if (error) {
    return NextResponse.json({ error: error.message, contacts: [] }, { status: 500 });
  }

  const contacts = (data || []).map((p) => ({
    id: p.id as string,
    name: (p.full_name || p.display_name || "Student") as string,
    studentId: (p.student_id || null) as string | null,
    program: (p.program || null) as string | null,
    verified: Boolean(p.is_verified) || p.verification_status === "verified",
    isStaff: ["owner", "admin", "moderator"].includes(String(p.role || "")),
  }));

  return NextResponse.json({ contacts });
}
