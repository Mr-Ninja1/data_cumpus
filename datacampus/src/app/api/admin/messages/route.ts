import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/utils/supabaseServerClient";
import { assertStaffUser, getAuthedUser } from "@/utils/adminAuth";
import { conversationKey } from "@/utils/roles";

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
    const peerId = url.searchParams.get("peerId");

    if (peerId) {
      const key = conversationKey(user.id, peerId);
      const { data, error } = await supabaseServer
        .from("messages")
        .select(
          "id, recipient_id, sender_id, subject, body, read, kind, conversation_key, metadata, created_at"
        )
        .or(`sender_id.eq.${peerId},recipient_id.eq.${peerId}`)
        .order("created_at", { ascending: true })
        .limit(150);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ messages: data || [], conversationKey: key });
    }

    const { data, error } = await supabaseServer
      .from("messages")
      .select(
        "id, recipient_id, sender_id, subject, body, read, kind, conversation_key, metadata, created_at"
      )
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ messages: data || [] });
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
    const recipientId = typeof body?.recipientId === "string" ? body.recipientId : null;
    const text = typeof body?.body === "string" ? body.body.trim() : "";
    const subject =
      typeof body?.subject === "string"
        ? body.subject.trim().slice(0, 120)
        : "Message from DataCampus staff";

    if (!recipientId || !text) {
      return NextResponse.json({ error: "recipientId and body required" }, { status: 400 });
    }
    if (recipientId === user.id) {
      return NextResponse.json({ error: "Cannot message yourself" }, { status: 400 });
    }

    const key = conversationKey(user.id, recipientId);
    const { data: msg, error } = await supabaseServer
      .from("messages")
      .insert({
        sender_id: user.id,
        recipient_id: recipientId,
        subject,
        body: text.slice(0, 4000),
        kind: "staff",
        conversation_key: key,
        read: false,
        metadata: { staff: true },
      })
      .select("id")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    await supabaseServer.from("notifications").insert({
      user_id: recipientId,
      kind: "staff_message",
      title: subject,
      body: text.slice(0, 160),
      link: "/inbox?tab=messages",
      data: { message_id: msg.id, from: user.id },
    });

    await supabaseServer.from("admin_audit").insert({
      admin_id: user.id,
      target_user_id: recipientId,
      action: "send_staff_message",
      details: { message_id: msg.id },
    });

    return NextResponse.json({ ok: true, messageId: msg.id });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
