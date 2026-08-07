import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/utils/supabaseServerClient";
import { assertStaffUser, getAuthedUser } from "@/utils/adminAuth";

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const user = await getAuthedUser(req);
    if (!user || !supabaseServer) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!(await assertStaffUser(user.id))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const action = body?.action === "unhide" ? "unhide" : body?.action === "delete" ? "delete" : "hide";

    if (action === "delete") {
      const { error } = await supabaseServer.from("comments").delete().eq("id", id);
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      await supabaseServer.from("admin_audit").insert({
        admin_id: user.id,
        action: "delete_comment",
        details: { comment_id: id },
      });
      return NextResponse.json({ ok: true, action: "delete" });
    }

    const isHidden = action === "hide";
    const { error } = await supabaseServer
      .from("comments")
      .update({ is_hidden: isHidden, updated_at: new Date().toISOString() })
      .eq("id", id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    await supabaseServer.from("admin_audit").insert({
      admin_id: user.id,
      action: isHidden ? "hide_comment" : "unhide_comment",
      details: { comment_id: id },
    });

    return NextResponse.json({ ok: true, action, is_hidden: isHidden });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
