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
    const status = url.searchParams.get("status") || "pending";
    const limit = Math.min(Number(url.searchParams.get("limit") || 50), 100);

    let query = supabaseServer
      .from("pending_papers")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (status !== "all") {
      query = query.eq("status", status);
    }

    const { data, error } = await query;
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const uploaderIds = [...new Set((data || []).map((p) => p.uploader_id).filter(Boolean))];
    const nameMap: Record<string, string> = {};
    if (uploaderIds.length) {
      const { data: profiles } = await supabaseServer
        .from("profiles")
        .select("id, display_name")
        .in("id", uploaderIds);
      for (const p of profiles || []) {
        nameMap[p.id] = p.display_name || "Uploader";
      }
    }

    return NextResponse.json({
      pending: (data || []).map((p) => ({
        ...p,
        uploader_name: p.uploader_id ? nameMap[p.uploader_id] || "Uploader" : null,
      })),
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
