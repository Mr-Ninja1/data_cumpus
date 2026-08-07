import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/utils/supabaseServerClient";
import { assertStaffUser, getAuthedUser } from "@/utils/adminAuth";

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const user = await getAuthedUser(req);
    if (!user || !supabaseServer) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!(await assertStaffUser(user.id))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const action = body?.action === "dismiss" ? "dismiss" : "resolve";
    const note = typeof body?.note === "string" ? body.note : null;

    const { data: report, error: fetchErr } = await supabaseServer
      .from("reports")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (fetchErr || !report) {
      return NextResponse.json({ error: "Report not found" }, { status: 404 });
    }

    const status = action === "dismiss" ? "dismissed" : "resolved";
    const { error } = await supabaseServer
      .from("reports")
      .update({
        status,
        reviewed_at: new Date().toISOString(),
        reviewed_by: user.id,
        details: note ? `${report.details || ""}\n[staff] ${note}`.trim() : report.details,
      })
      .eq("id", id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    await supabaseServer.from("admin_audit").insert({
      admin_id: user.id,
      action: `report_${status}`,
      details: { report_id: id, note },
    });

    return NextResponse.json({ ok: true, status });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
