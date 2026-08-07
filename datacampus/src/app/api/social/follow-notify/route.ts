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
    const followingId = typeof body?.followingId === "string" ? body.followingId : null;
    if (!followingId || followingId === user.id) {
      return NextResponse.json({ error: "Invalid target" }, { status: 400 });
    }

    const { data: follow } = await supabaseServer
      .from("follows")
      .select("id")
      .eq("follower_id", user.id)
      .eq("following_id", followingId)
      .maybeSingle();

    if (!follow) {
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
      user_id: followingId,
      kind: "new_follower",
      title: "New subscriber",
      body: `${name} subscribed to your channel`,
      link: `/u/${user.id}`,
      data: { follower_id: user.id },
    });

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
