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
    // "flagged" (default): comments hidden by staff or referenced by an open report.
    // "all": most recent comments regardless of status.
    const scope = url.searchParams.get("scope") || "flagged";
    const limit = Math.min(Number(url.searchParams.get("limit") || 50), 100);

    let comments: any[] = [];

    if (scope === "all") {
      const { data, error } = await supabaseServer
        .from("comments")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      comments = data || [];
    } else {
      const [{ data: hidden, error: hiddenErr }, { data: openReports, error: reportsErr }] = await Promise.all([
        supabaseServer.from("comments").select("*").eq("is_hidden", true).order("created_at", { ascending: false }).limit(limit),
        supabaseServer.from("reports").select("comment_id").eq("status", "open").not("comment_id", "is", null).limit(limit),
      ]);
      if (hiddenErr) return NextResponse.json({ error: hiddenErr.message }, { status: 500 });
      if (reportsErr) return NextResponse.json({ error: reportsErr.message }, { status: 500 });

      const reportedIds = [...new Set((openReports || []).map((r) => r.comment_id).filter(Boolean))];
      let reported: any[] = [];
      if (reportedIds.length) {
        const { data, error } = await supabaseServer.from("comments").select("*").in("id", reportedIds);
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        reported = data || [];
      }

      const seen = new Set<string>();
      for (const c of [...(hidden || []), ...reported]) {
        if (!seen.has(c.id)) {
          seen.add(c.id);
          comments.push(c);
        }
      }
      comments.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    }

    const paperIds = [...new Set(comments.map((c) => c.paper_id).filter(Boolean))];
    const userIds = [...new Set(comments.map((c) => c.user_id).filter(Boolean))];
    const commentIds = comments.map((c) => c.id);

    const [paperRes, profileRes, reportCountRes] = await Promise.all([
      paperIds.length
        ? supabaseServer.from("papers").select("id, title").in("id", paperIds)
        : Promise.resolve({ data: [] as any[] }),
      userIds.length
        ? supabaseServer.from("profiles").select("id, display_name").in("id", userIds)
        : Promise.resolve({ data: [] as any[] }),
      commentIds.length
        ? supabaseServer.from("reports").select("comment_id").eq("status", "open").in("comment_id", commentIds)
        : Promise.resolve({ data: [] as any[] }),
    ]);

    const paperMap: Record<string, string> = {};
    for (const p of paperRes.data || []) paperMap[p.id] = p.title;
    const nameMap: Record<string, string> = {};
    for (const p of profileRes.data || []) nameMap[p.id] = p.display_name || "User";
    const reportCounts: Record<string, number> = {};
    for (const r of reportCountRes.data || []) {
      if (r.comment_id) reportCounts[r.comment_id] = (reportCounts[r.comment_id] || 0) + 1;
    }

    return NextResponse.json({
      comments: comments.map((c) => ({
        ...c,
        paper_title: c.paper_id ? paperMap[c.paper_id] || null : null,
        author_name: c.user_id ? nameMap[c.user_id] || "User" : null,
        open_report_count: reportCounts[c.id] || 0,
      })),
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
