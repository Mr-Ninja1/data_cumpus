import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/utils/supabaseServerClient";
import { assertStaffUser, getAuthedUser } from "@/utils/adminAuth";

export async function GET(req: NextRequest) {
  try {
    const user = await getAuthedUser(req);
    if (!user || !supabaseServer) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!(await assertStaffUser(user.id))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { data, error } = await supabaseServer
      .from("admin_audit")
      .select("id, admin_id, target_user_id, action, details, created_at")
      .order("created_at", { ascending: false })
      .limit(80);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const adminIds = [...new Set((data || []).map((r) => r.admin_id).filter(Boolean))];
    const nameMap: Record<string, string> = {};
    if (adminIds.length) {
      const { data: profiles } = await supabaseServer
        .from("profiles")
        .select("id, display_name")
        .in("id", adminIds);
      for (const p of profiles || []) {
        nameMap[p.id] = p.display_name || "Staff";
      }
    }

    return NextResponse.json({
      audit: (data || []).map((r) => ({
        ...r,
        admin_name: nameMap[r.admin_id] || "Staff",
      })),
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
