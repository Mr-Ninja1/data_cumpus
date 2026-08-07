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

    const [
      papers,
      pending,
      reports,
      comments,
      profiles,
      notificationsUnread,
      messagesUnread,
      announcements,
    ] = await Promise.all([
      supabaseServer.from("papers").select("*", { count: "exact", head: true }),
      supabaseServer
        .from("pending_papers")
        .select("*", { count: "exact", head: true })
        .eq("status", "pending"),
      supabaseServer.from("reports").select("*", { count: "exact", head: true }).eq("status", "open"),
      supabaseServer.from("comments").select("*", { count: "exact", head: true }),
      supabaseServer.from("profiles").select("*", { count: "exact", head: true }),
      supabaseServer
        .from("notifications")
        .select("*", { count: "exact", head: true })
        .eq("is_read", false),
      supabaseServer.from("messages").select("*", { count: "exact", head: true }).eq("read", false),
      supabaseServer
        .from("announcements")
        .select("*", { count: "exact", head: true })
        .eq("is_active", true),
    ]);

    return NextResponse.json({
      stats: {
        papers: papers.count ?? 0,
        pending: pending.count ?? 0,
        openReports: reports.count ?? 0,
        comments: comments.count ?? 0,
        users: profiles.count ?? 0,
        unreadNotifications: notificationsUnread.count ?? 0,
        unreadMessages: messagesUnread.count ?? 0,
        activeAnnouncements: announcements.count ?? 0,
      },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
