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

/** Primary campus admin / support contact for the pinned quick-chat. */
export async function GET(req: NextRequest) {
  const user = await authedUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!supabaseServer) return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });

  const { data: staff } = await supabaseServer
    .from("profiles")
    .select("id, display_name, full_name, role, student_id")
    .in("role", ["owner", "admin", "moderator"])
    .limit(20);

  if (!staff?.length) {
    return NextResponse.json({
      admin: null,
      label: "DataCampus Support",
      hint: "Support inbox — no staff profile yet",
    });
  }

  const ranked = [...staff].sort((a, b) => {
    const rank = (r: string) => (r === "owner" ? 0 : r === "admin" ? 1 : 2);
    return rank(String(a.role)) - rank(String(b.role));
  });

  const top = ranked[0];
  return NextResponse.json({
    admin: {
      id: top.id,
      name: top.full_name || top.display_name || "Campus Admin",
      role: top.role,
      studentId: top.student_id || null,
    },
    label: "Campus Admin",
  });
}
