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
    const status = url.searchParams.get("status") || "open";
    const limit = Math.min(Number(url.searchParams.get("limit") || 50), 100);

    let query = supabaseServer
      .from("reports")
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

    const reports = data || [];
    const reporterIds = [...new Set(reports.map((r) => r.reporter_id).filter(Boolean))];
    const paperIds = [...new Set(reports.map((r) => r.paper_id).filter(Boolean))];
    const commentIds = [...new Set(reports.map((r) => r.comment_id).filter(Boolean))];

    const nameMap: Record<string, string> = {};
    if (reporterIds.length) {
      const { data: profiles } = await supabaseServer
        .from("profiles")
        .select("id, display_name")
        .in("id", reporterIds);
      for (const p of profiles || []) nameMap[p.id] = p.display_name || "User";
    }

    const paperMap: Record<string, string> = {};
    if (paperIds.length) {
      const { data: papers } = await supabaseServer.from("papers").select("id, title").in("id", paperIds);
      for (const p of papers || []) paperMap[p.id] = p.title;
    }

    const commentMap: Record<string, string> = {};
    if (commentIds.length) {
      const { data: comments } = await supabaseServer.from("comments").select("id, body").in("id", commentIds);
      for (const c of comments || []) commentMap[c.id] = c.body;
    }

    return NextResponse.json({
      reports: reports.map((r) => ({
        ...r,
        reporter_name: r.reporter_id ? nameMap[r.reporter_id] || "User" : null,
        paper_title: r.paper_id ? paperMap[r.paper_id] || null : null,
        comment_body: r.comment_id ? commentMap[r.comment_id] || null : null,
      })),
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
