import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/utils/supabaseServerClient";
import { assertStaffUser, getAuthedUser } from "@/utils/adminAuth";
import { conversationKey } from "@/utils/roles";

/** User → contact support (routes to a staff member). */
export async function POST(req: NextRequest) {
  try {
    const user = await getAuthedUser(req);
    if (!user || !supabaseServer) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const text = typeof body?.body === "string" ? body.body.trim() : "";
    const subject =
      typeof body?.subject === "string" ? body.subject.trim().slice(0, 120) : "Support request";
    if (!text || text.length > 4000) {
      return NextResponse.json({ error: "Message body required" }, { status: 400 });
    }

    const { data: staff } = await supabaseServer
      .from("profiles")
      .select("id, role")
      .in("role", ["owner", "admin", "moderator"])
      .limit(20);

    if (!staff?.length) {
      return NextResponse.json(
        { error: "No staff available yet. Ask an admin to set profiles.role." },
        { status: 503 }
      );
    }

    // Prefer owner/admin, else any moderator
    const ranked = [...staff].sort((a, b) => {
      const rank = (r: string) => (r === "owner" ? 0 : r === "admin" ? 1 : 2);
      return rank(a.role) - rank(b.role);
    });
    const recipientId = ranked[0].id;

    if (recipientId === user.id) {
      return NextResponse.json({ error: "You are staff — use the admin inbox" }, { status: 400 });
    }

    const key = conversationKey(user.id, recipientId);
    const { data: msg, error } = await supabaseServer
      .from("messages")
      .insert({
        sender_id: user.id,
        recipient_id: recipientId,
        subject,
        body: text,
        kind: "support",
        conversation_key: key,
        read: false,
        metadata: { support: true, preview: text.slice(0, 100), local_first: false },
      })
      .select("id, conversation_key")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    await supabaseServer.from("notifications").insert({
      user_id: recipientId,
      kind: "support_message",
      title: "New support message",
      body: text.slice(0, 160),
      link: "/admin/inbox",
      data: { message_id: msg.id, from: user.id },
    });

    // Support keeps body in DB for staff tools (not local-first ephemeral)

    return NextResponse.json({ ok: true, messageId: msg.id, conversationKey: msg.conversation_key });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
