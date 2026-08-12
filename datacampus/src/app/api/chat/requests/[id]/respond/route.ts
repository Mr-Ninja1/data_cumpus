import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { supabaseServer } from "@/utils/supabaseServerClient";

export const runtime = "nodejs";

async function authedClient(req: NextRequest) {
  const auth = req.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return { user: null, client: null as ReturnType<typeof createClient> | null };
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return { user: null, client: null };
  const client = createClient(url, anon, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data } = await client.auth.getUser();
  return { user: data.user ?? null, client };
}

/** POST /api/chat/requests/[id]/respond  { action: 'accept' | 'decline' | 'cancel' } */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { user, client } = await authedClient(req);
  if (!user || !client) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const action = body?.action as string;
  if (!["accept", "decline", "cancel"].includes(action)) {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }

  const { data: row, error } = await client
    .from("chat_requests")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error || !row) {
    return NextResponse.json({ error: error?.message || "Request not found" }, { status: 404 });
  }
  if (row.status !== "pending") {
    return NextResponse.json({ error: "Request already resolved" }, { status: 409 });
  }

  if (action === "cancel" && row.from_user_id !== user.id) {
    return NextResponse.json({ error: "Only sender can cancel" }, { status: 403 });
  }
  if ((action === "accept" || action === "decline") && row.to_user_id !== user.id) {
    return NextResponse.json({ error: "Only recipient can respond" }, { status: 403 });
  }

  const status = action === "accept" ? "accepted" : action === "decline" ? "declined" : "cancelled";
  const { error: updErr } = await client
    .from("chat_requests")
    .update({ status, responded_at: new Date().toISOString() })
    .eq("id", id);

  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });

  if (action === "accept" && supabaseServer) {
    await supabaseServer.from("notifications").insert({
      user_id: row.from_user_id,
      kind: "chat_accepted",
      title: "Chat accepted",
      body: "Your chat request was accepted",
      link: `/inbox?tab=messages&peer=${row.to_user_id}`,
      data: { request_id: id, peer: row.to_user_id },
    });
  }

  if (action === "decline" && supabaseServer) {
    await supabaseServer.from("notifications").insert({
      user_id: row.from_user_id,
      kind: "chat_declined",
      title: "Chat declined",
      body: "Your chat request was declined",
      link: "/inbox?tab=messages",
      data: { request_id: id },
    });
  }

  return NextResponse.json({
    ok: true,
    status,
    peerId: row.from_user_id === user.id ? row.to_user_id : row.from_user_id,
  });
}
