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

    const url = new URL(req.url);
    const q = (url.searchParams.get("q") || "").trim();
    const limit = Math.min(Number(url.searchParams.get("limit") || 40), 100);

    let query = supabaseServer
      .from("profiles")
      .select("id, display_name, role, permissions, is_verified, created_at")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (q) {
      query = query.or(`display_name.ilike.%${q}%,id.eq.${q}`);
    }

    const { data, error } = await query;
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Enrich with upload counts
    const ids = (data || []).map((p) => p.id);
    const uploadMap: Record<string, number> = {};
    if (ids.length) {
      const { data: papers } = await supabaseServer
        .from("papers")
        .select("uploaded_by")
        .in("uploaded_by", ids);
      for (const p of papers || []) {
        if (p.uploaded_by) uploadMap[p.uploaded_by] = (uploadMap[p.uploaded_by] || 0) + 1;
      }
    }

    return NextResponse.json({
      users: (data || []).map((p) => ({
        ...p,
        upload_count: uploadMap[p.id] || 0,
      })),
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
