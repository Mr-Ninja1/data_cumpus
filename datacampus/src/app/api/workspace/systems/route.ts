import { NextRequest, NextResponse } from "next/server";
import { getAuthedUser } from "@/utils/serverAuth";
import { supabaseServer } from "@/utils/supabaseServerClient";
import { conversationKey } from "@/utils/roles";

export const runtime = "nodejs";

const BUDGETS = new Set(["low", "medium", "flexible"]);

export async function GET(req: NextRequest) {
  const user = await getAuthedUser(req);
  if (!user || !supabaseServer) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabaseServer
    .from("system_build_requests")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json(
      {
        error: error.message.includes("system_build_requests")
          ? "Run supabase/system_build_requests.sql in Supabase first"
          : error.message,
      },
      { status: 500 }
    );
  }

  return NextResponse.json({ requests: data ?? [] });
}

export async function POST(req: NextRequest) {
  const user = await getAuthedUser(req);
  if (!user || !supabaseServer) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const title = typeof body.title === "string" ? body.title.trim().slice(0, 160) : "";
  const description =
    typeof body.description === "string" ? body.description.trim().slice(0, 4000) : "";
  const department =
    typeof body.department === "string" ? body.department.trim().slice(0, 120) || null : null;
  const deadline =
    typeof body.deadline === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.deadline)
      ? body.deadline
      : null;
  const budgetFeel = BUDGETS.has(body.budget_feel) ? body.budget_feel : "flexible";

  if (!title || title.length < 3) {
    return NextResponse.json({ error: "Add a short title" }, { status: 400 });
  }
  if (!description || description.length < 10) {
    return NextResponse.json({ error: "Describe what you need in a few sentences" }, { status: 400 });
  }

  const { data: row, error } = await supabaseServer
    .from("system_build_requests")
    .insert({
      user_id: user.id,
      title,
      description,
      department,
      deadline,
      budget_feel: budgetFeel,
      status: "sent",
    })
    .select("*")
    .single();

  if (error || !row) {
    return NextResponse.json(
      {
        error: error?.message?.includes("system_build_requests")
          ? "Run supabase/system_build_requests.sql in Supabase first"
          : error?.message || "Could not save request",
      },
      { status: 500 }
    );
  }

  // Notify campus admin via support DM (best-effort)
  let adminId: string | null = null;
  try {
    const { data: staff } = await supabaseServer
      .from("profiles")
      .select("id, role")
      .in("role", ["owner", "admin", "moderator"])
      .limit(20);

    if (staff?.length) {
      const ranked = [...staff].sort((a, b) => {
        const rank = (r: string) => (r === "owner" ? 0 : r === "admin" ? 1 : 2);
        return rank(a.role) - rank(b.role);
      });
      adminId = ranked[0].id === user.id ? null : ranked[0].id;
    }

    if (adminId) {
      const key = conversationKey(user.id, adminId);
      const msgBody = [
        `New system build request: ${title}`,
        "",
        description,
        "",
        department ? `Department: ${department}` : null,
        deadline ? `Deadline: ${deadline}` : null,
        `Budget: ${budgetFeel}`,
        `Request ID: ${row.id}`,
      ]
        .filter(Boolean)
        .join("\n");

      await supabaseServer.from("messages").insert({
        sender_id: user.id,
        recipient_id: adminId,
        subject: "System build request",
        body: msgBody.slice(0, 4000),
        kind: "support",
        conversation_key: key,
        read: false,
        metadata: {
          support: true,
          system_build_request_id: row.id,
          preview: `System request: ${title}`.slice(0, 100),
          local_first: false,
        },
      });

      await supabaseServer.from("notifications").insert({
        user_id: adminId,
        kind: "system_build_request",
        title: "New system build request",
        body: title.slice(0, 160),
        link: "/admin/systems",
        data: { request_id: row.id, from: user.id },
      });
    }
  } catch (e) {
    console.warn("system request notify:", e);
  }

  return NextResponse.json({
    request: row,
    adminId,
    inboxHint: adminId ? `/inbox?tab=messages&peer=${adminId}` : "/inbox?tab=messages",
  });
}
