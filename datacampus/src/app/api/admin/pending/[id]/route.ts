import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/utils/supabaseServerClient";
import { assertStaffUser, getAuthedUser } from "@/utils/adminAuth";
import type { SupabaseClient } from "@supabase/supabase-js";

async function notifyFollowersOfNewPaper(
  client: SupabaseClient,
  uploaderId: string | null,
  paperId: string | undefined,
  title: string
) {
  if (!uploaderId || !paperId) return;

  const { data: followers } = await client
    .from("follows")
    .select("follower_id")
    .eq("following_id", uploaderId);

  if (!followers?.length) return;

  const { data: profile } = await client
    .from("profiles")
    .select("display_name")
    .eq("id", uploaderId)
    .maybeSingle();

  const channelName = profile?.display_name || "A channel you follow";
  const rows = followers.map((f) => ({
    user_id: f.follower_id,
    kind: "new_upload",
    title: "New upload",
    body: `${channelName} published "${title}"`,
    link: `/paper/${paperId}`,
    data: { paper_id: paperId, uploader_id: uploaderId },
  }));

  await client.from("notifications").insert(rows);
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const body = await req.json().catch(() => ({}));
    const action = body?.action === "reject" ? "reject" : "approve";
    const note = typeof body?.note === "string" ? body.note : null;

    const user = await getAuthedUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!supabaseServer) {
      return NextResponse.json(
        { error: "Server is missing SUPABASE_SERVICE_ROLE_KEY" },
        { status: 500 }
      );
    }
    if (!(await assertStaffUser(user.id))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { data: pending, error: fetchErr } = await supabaseServer
      .from("pending_papers")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (fetchErr || !pending) {
      return NextResponse.json({ error: "Pending paper not found" }, { status: 404 });
    }

    if (pending.status !== "pending") {
      return NextResponse.json({ error: `Already ${pending.status}` }, { status: 400 });
    }

    if (action === "reject") {
      const { error } = await supabaseServer
        .from("pending_papers")
        .update({
          status: "rejected",
          note,
          reviewed_at: new Date().toISOString(),
          reviewed_by: user.id,
        })
        .eq("id", id);
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      await supabaseServer.from("admin_audit").insert({
        admin_id: user.id,
        target_user_id: pending.uploader_id,
        action: "reject_paper",
        details: { pending_id: id, note },
      });
      return NextResponse.json({ ok: true, status: "rejected" });
    }

    // approve → insert into papers
    const { data: paper, error: insertErr } = await supabaseServer
      .from("papers")
      .insert({
        school: pending.school,
        program: pending.program,
        type: pending.type,
        title: pending.title,
        file_path: pending.file_path,
        stored_file_id: pending.stored_file_id,
        file_url: pending.file_url || "",
        uploaded_by: pending.uploader_id,
      })
      .select("id")
      .single();

    if (insertErr) {
      // uploaded_by column may not exist yet — retry without it
      const { data: paper2, error: insertErr2 } = await supabaseServer
        .from("papers")
        .insert({
          school: pending.school,
          program: pending.program,
          type: pending.type,
          title: pending.title,
          file_path: pending.file_path,
          stored_file_id: pending.stored_file_id,
          file_url: pending.file_url || "",
        })
        .select("id")
        .single();
      if (insertErr2) {
        return NextResponse.json({ error: insertErr2.message }, { status: 500 });
      }
      await supabaseServer
        .from("pending_papers")
        .update({
          status: "approved",
          note,
          reviewed_at: new Date().toISOString(),
          reviewed_by: user.id,
        })
        .eq("id", id);
      await supabaseServer.from("admin_audit").insert({
        admin_id: user.id,
        target_user_id: pending.uploader_id,
        action: "approve_paper",
        details: { pending_id: id, paper_id: paper2?.id, note },
      });
      await notifyFollowersOfNewPaper(
        supabaseServer,
        pending.uploader_id,
        paper2?.id,
        pending.title
      );
      return NextResponse.json({ ok: true, status: "approved", paperId: paper2?.id });
    }

    await supabaseServer
      .from("pending_papers")
      .update({
        status: "approved",
        note,
        reviewed_at: new Date().toISOString(),
        reviewed_by: user.id,
      })
      .eq("id", id);

    await supabaseServer.from("admin_audit").insert({
      admin_id: user.id,
      target_user_id: pending.uploader_id,
      action: "approve_paper",
      details: { pending_id: id, paper_id: paper?.id, note },
    });

    await notifyFollowersOfNewPaper(
      supabaseServer,
      pending.uploader_id,
      paper?.id,
      pending.title
    );

    return NextResponse.json({ ok: true, status: "approved", paperId: paper?.id });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Server error" }, { status: 500 });
  }
}
