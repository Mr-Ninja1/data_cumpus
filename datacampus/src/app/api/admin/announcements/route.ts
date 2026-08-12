import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/utils/supabaseServerClient";
import { assertStaffUser, getAuthedUser } from "@/utils/adminAuth";

const KINDS = new Set(["banner", "alert", "promo"]);
const AUDIENCES = new Set(["all", "signed_in", "staff"]);

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
      .from("announcements")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(40);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ announcements: data || [] });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthedUser(req);
    if (!user || !supabaseServer) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!(await assertStaffUser(user.id))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const title = typeof body?.title === "string" ? body.title.trim() : "";
    if (!title || title.length > 120) {
      return NextResponse.json({ error: "Title required (max 120 chars)" }, { status: 400 });
    }

    const kind = KINDS.has(body?.kind) ? body.kind : "banner";
    const audience = AUDIENCES.has(body?.audience) ? body.audience : "all";
    const announcementBody =
      typeof body?.body === "string" ? body.body.trim().slice(0, 1000) || null : null;
    const link = typeof body?.link === "string" ? body.link.trim() || null : null;
    const linkLabel =
      typeof body?.linkLabel === "string" ? body.linkLabel.trim().slice(0, 40) || null : null;
    const endsAt = typeof body?.endsAt === "string" && body.endsAt ? body.endsAt : null;
    const notifyInbox = Boolean(body?.notifyInbox);

    const { data: row, error } = await supabaseServer
      .from("announcements")
      .insert({
        kind,
        title,
        body: announcementBody,
        link,
        link_label: linkLabel,
        audience,
        ends_at: endsAt,
        created_by: user.id,
        is_active: true,
      })
      .select("*")
      .single();

    if (error) {
      return NextResponse.json(
        {
          error: error.message.includes("announcements")
            ? "Run supabase/announcements.sql in Supabase first"
            : error.message,
        },
        { status: 500 }
      );
    }

    let notified = 0;
    if (notifyInbox && audience !== "staff") {
      const { data: profiles } = await supabaseServer.from("profiles").select("id").limit(5000);
      const recipients = (profiles || []).map((p) => p.id).filter((id) => id !== user.id);
      if (recipients.length) {
        const chunks: string[][] = [];
        for (let i = 0; i < recipients.length; i += 200) {
          chunks.push(recipients.slice(i, i + 200));
        }
        for (const chunk of chunks) {
          const rows = chunk.map((uid) => ({
            user_id: uid,
            kind: "announcement",
            title,
            body: announcementBody,
            link: link || "/inbox",
            data: { announcement_id: row.id, announcement_kind: kind },
          }));
          const { error: nErr } = await supabaseServer.from("notifications").insert(rows);
          if (!nErr) notified += chunk.length;
        }
      }
    }

    await supabaseServer.from("admin_audit").insert({
      admin_id: user.id,
      action: "create_announcement",
      details: { announcement_id: row.id, kind, audience, notifyInbox, notified },
    });

    return NextResponse.json({ ok: true, announcement: row, notified });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const user = await getAuthedUser(req);
    if (!user || !supabaseServer) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!(await assertStaffUser(user.id))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const id = typeof body?.id === "string" ? body.id : null;
    if (!id) {
      return NextResponse.json({ error: "Missing id" }, { status: 400 });
    }

    const isActive = body?.isActive === false ? false : body?.isActive === true ? true : null;
    if (isActive === null) {
      return NextResponse.json({ error: "Provide isActive" }, { status: 400 });
    }

    const { data, error } = await supabaseServer
      .from("announcements")
      .update({ is_active: isActive })
      .eq("id", id)
      .select("*")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    await supabaseServer.from("admin_audit").insert({
      admin_id: user.id,
      action: isActive ? "activate_announcement" : "deactivate_announcement",
      details: { announcement_id: id },
    });

    return NextResponse.json({ ok: true, announcement: data });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
