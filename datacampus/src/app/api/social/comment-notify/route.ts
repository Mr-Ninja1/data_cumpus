import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/utils/supabaseServerClient";
import { getAuthedUser } from "@/utils/adminAuth";

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthedUser(req);
    if (!user || !supabaseServer) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const paperId = typeof body?.paperId === "string" ? body.paperId : null;
    const commentId = typeof body?.commentId === "string" ? body.commentId : null;
    if (!paperId || !commentId) {
      return NextResponse.json({ error: "Missing paperId or commentId" }, { status: 400 });
    }

    const { data: paper } = await supabaseServer
      .from("papers")
      .select("id, title, uploaded_by")
      .eq("id", paperId)
      .maybeSingle();

    if (!paper?.uploaded_by || paper.uploaded_by === user.id) {
      return NextResponse.json({ ok: true, skipped: true });
    }

    const { data: profile } = await supabaseServer
      .from("profiles")
      .select("display_name")
      .eq("id", user.id)
      .maybeSingle();

    const name =
      profile?.display_name ||
      user.user_metadata?.full_name ||
      user.email?.split("@")[0] ||
      "Someone";

    await supabaseServer.from("notifications").insert({
      user_id: paper.uploaded_by,
      kind: "new_comment",
      title: "New comment on your upload",
      body: `${name} commented on "${paper.title}"`,
      link: `/paper/${paperId}`,
      data: { paper_id: paperId, comment_id: commentId, commenter_id: user.id },
    });

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
