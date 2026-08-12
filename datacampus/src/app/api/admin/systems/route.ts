import { NextRequest, NextResponse } from "next/server";
import { assertStaffUser, getAuthedUser } from "@/utils/adminAuth";
import { supabaseServer } from "@/utils/supabaseServerClient";

export const runtime = "nodejs";

const STATUSES = new Set(["sent", "quoted", "in_progress", "done", "cancelled"]);

export async function GET(req: NextRequest) {
  const user = await getAuthedUser(req);
  if (!user || !(await assertStaffUser(user.id)) || !supabaseServer) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data, error } = await supabaseServer
    .from("system_build_requests")
    .select(
      "id, user_id, title, description, department, deadline, budget_feel, status, admin_notes, created_at, updated_at"
    )
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    return NextResponse.json(
      {
        error: error.message.includes("system_build_requests")
          ? "Run supabase/system_build_requests.sql in Supabase first"
          : error.message,
      },
      { status: 500 }
    );
  }

  const userIds = [...new Set((data || []).map((r) => r.user_id))];
  const nameMap: Record<string, string> = {};
  if (userIds.length) {
    const { data: profiles } = await supabaseServer
      .from("profiles")
      .select("id, display_name, full_name, student_id")
      .in("id", userIds);
    for (const p of profiles || []) {
      nameMap[p.id] = p.display_name || p.full_name || "Student";
    }
  }

  const requests = (data || []).map((r) => ({
    ...r,
    student_name: nameMap[r.user_id] || "Student",
  }));

  return NextResponse.json({ requests });
}

export async function PATCH(req: NextRequest) {
  const user = await getAuthedUser(req);
  if (!user || !(await assertStaffUser(user.id)) || !supabaseServer) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const id = typeof body.id === "string" ? body.id : "";
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (typeof body.status === "string" && STATUSES.has(body.status)) {
    patch.status = body.status;
  }
  if (typeof body.admin_notes === "string") {
    patch.admin_notes = body.admin_notes.trim().slice(0, 2000) || null;
  }

  const { data, error } = await supabaseServer
    .from("system_build_requests")
    .update(patch)
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ request: data });
}
