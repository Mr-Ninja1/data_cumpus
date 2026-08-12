import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { supabaseServer } from "@/utils/supabaseServerClient";
import { canUseSocialFeatures } from "@/utils/verificationGate";

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

/** GET — list my incoming + outgoing chat requests */
export async function GET(req: NextRequest) {
  const { user, client } = await authedClient(req);
  if (!user || !client) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await client
    .from("chat_requests")
    .select("id, kind, from_user_id, to_user_id, group_id, message, status, created_at, responded_at, metadata")
    .or(`from_user_id.eq.${user.id},to_user_id.eq.${user.id}`)
    .order("created_at", { ascending: false })
    .limit(80);

  if (error) {
    return NextResponse.json(
      {
        error: error.message.includes("chat_requests")
          ? "Run supabase/chat_social.sql in Supabase first"
          : error.message,
        incoming: [],
        outgoing: [],
      },
      { status: error.message.includes("chat_requests") ? 503 : 500 }
    );
  }

  const rows = data || [];
  const peerIds = [
    ...new Set(rows.flatMap((r) => [r.from_user_id, r.to_user_id]).filter((id) => id !== user.id)),
  ];
  const nameMap: Record<string, { name: string; studentId: string | null; verified: boolean }> = {};
  if (peerIds.length && supabaseServer) {
    const { data: profiles } = await supabaseServer
      .from("profiles")
      .select("id, display_name, full_name, student_id, is_verified, verification_status")
      .in("id", peerIds);
    for (const p of profiles || []) {
      nameMap[p.id] = {
        name: p.full_name || p.display_name || "Student",
        studentId: p.student_id || null,
        verified: Boolean(p.is_verified) || p.verification_status === "verified",
      };
    }
  }

  const enrich = (r: (typeof rows)[0]) => {
    const peerId = r.from_user_id === user.id ? r.to_user_id : r.from_user_id;
    const peer = nameMap[peerId] || { name: "Student", studentId: null, verified: false };
    return {
      ...r,
      peerId,
      peerName: peer.name,
      peerStudentId: peer.studentId,
      peerVerified: peer.verified,
      direction: r.from_user_id === user.id ? "outgoing" : "incoming",
    };
  };

  const enriched = rows.map(enrich);
  return NextResponse.json({
    incoming: enriched.filter((r) => r.direction === "incoming" && r.status === "pending"),
    outgoing: enriched.filter((r) => r.direction === "outgoing"),
    all: enriched,
  });
}

/** POST — send a DM (or future group) chat request */
export async function POST(req: NextRequest) {
  const { user, client } = await authedClient(req);
  if (!user || !client) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const toUserId = typeof body?.toUserId === "string" ? body.toUserId : "";
  const message = typeof body?.message === "string" ? body.message.trim().slice(0, 500) : "";
  const kind = body?.kind === "group" ? "group" : "dm";
  const groupId = typeof body?.groupId === "string" ? body.groupId : null;

  if (!toUserId || toUserId === user.id) {
    return NextResponse.json({ error: "Invalid recipient" }, { status: 400 });
  }

  // Must be verified to start chats (staff accounts bypass for admin/dev testing)
  if (supabaseServer) {
    const { data: profile } = await supabaseServer
      .from("profiles")
      .select("is_verified, verification_status, role")
      .eq("id", user.id)
      .maybeSingle();
    const verified =
      Boolean(profile?.is_verified) || profile?.verification_status === "verified";
    if (!canUseSocialFeatures(verified, profile?.role)) {
      return NextResponse.json({ error: "Verify your student status first", code: "VERIFY" }, { status: 403 });
    }
  }

  // Already accepted?
  const { data: prior } = await client
    .from("chat_requests")
    .select("id, status, from_user_id, to_user_id")
    .eq("kind", "dm")
    .eq("status", "accepted")
    .or(`from_user_id.eq.${user.id},to_user_id.eq.${user.id}`)
    .limit(50);

  const existingAccepted = (prior || []).find(
    (r) =>
      (r.from_user_id === user.id && r.to_user_id === toUserId) ||
      (r.from_user_id === toUserId && r.to_user_id === user.id)
  );

  if (existingAccepted) {
    return NextResponse.json({ ok: true, alreadyAccepted: true, requestId: existingAccepted.id });
  }

  const { data, error } = await client
    .from("chat_requests")
    .insert({
      kind,
      from_user_id: user.id,
      to_user_id: toUserId,
      group_id: groupId,
      message: message || "Hi — can we chat on DataCampus?",
      status: "pending",
      metadata: {},
    })
    .select("id, kind, from_user_id, to_user_id, message, status, created_at")
    .single();

  if (error) {
    if (error.message.includes("chat_requests_pending_dm_unique") || error.code === "23505") {
      return NextResponse.json({ error: "A chat request is already pending" }, { status: 409 });
    }
    return NextResponse.json(
      {
        error: error.message.includes("chat_requests")
          ? "Run supabase/chat_social.sql in Supabase first"
          : error.message,
      },
      { status: 500 }
    );
  }

  // Notify recipient (tiny row — not a full transcript)
  if (supabaseServer) {
    const { data: fromProf } = await supabaseServer
      .from("profiles")
      .select("display_name, full_name")
      .eq("id", user.id)
      .maybeSingle();
    const fromName = fromProf?.full_name || fromProf?.display_name || "A student";
    await supabaseServer.from("notifications").insert({
      user_id: toUserId,
      kind: "chat_request",
      title: "Chat request",
      body: `${fromName} wants to message you`,
      link: "/inbox?tab=messages&requests=1",
      data: { request_id: data.id, from: user.id, kind },
    });
  }

  return NextResponse.json({ ok: true, request: data });
}
