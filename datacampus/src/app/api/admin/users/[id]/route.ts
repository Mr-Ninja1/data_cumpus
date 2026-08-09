import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/utils/supabaseServerClient";
import { assertStaffUser, getAuthedUser } from "@/utils/adminAuth";
import { canAssignRole } from "@/utils/roles";

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id: targetId } = await context.params;
    const user = await getAuthedUser(req);
    if (!user || !supabaseServer) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!(await assertStaffUser(user.id))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { data: actor } = await supabaseServer
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();

    const actorRole = actor?.role || "user";
    if (actorRole !== "admin" && actorRole !== "owner") {
      return NextResponse.json(
        { error: "Only admin/owner can change roles or permissions" },
        { status: 403 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const updates: Record<string, unknown> = {};

    if (typeof body?.role === "string") {
      if (!canAssignRole(actorRole, body.role)) {
        return NextResponse.json({ error: "Cannot assign that role" }, { status: 403 });
      }
      if (targetId === user.id && body.role !== actorRole) {
        return NextResponse.json({ error: "Cannot change your own role here" }, { status: 400 });
      }
      updates.role = body.role;
    }

    if (typeof body?.isVerified === "boolean") {
      updates.is_verified = body.isVerified;
    }

    if (body?.permissions && typeof body.permissions === "object") {
      const { data: existing } = await supabaseServer
        .from("profiles")
        .select("permissions")
        .eq("id", targetId)
        .maybeSingle();
      updates.permissions = {
        ...(existing?.permissions && typeof existing.permissions === "object"
          ? existing.permissions
          : {}),
        ...body.permissions,
      };
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
    }

    const { data, error } = await supabaseServer
      .from("profiles")
      .update(updates)
      .eq("id", targetId)
      .select("id, display_name, role, permissions, is_verified")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    await supabaseServer.from("admin_audit").insert({
      admin_id: user.id,
      target_user_id: targetId,
      action: "update_user",
      details: updates,
    });

    return NextResponse.json({ ok: true, user: data });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
