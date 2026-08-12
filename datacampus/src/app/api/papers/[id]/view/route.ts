import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/utils/supabaseServerClient";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  bumpPaperView,
  getPaperViewCounts,
  isMissingViewColumnError,
} from "@/utils/paperViews";

export const runtime = "nodejs";

function client(): SupabaseClient | null {
  if (supabaseServer) return supabaseServer;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return null;
  return createClient(url, anon);
}

/** POST /api/papers/[id]/view — bump view count once per call */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const sb = client();
  if (!sb) {
    return NextResponse.json(
      { error: "Missing Supabase env vars", viewCount: null, skipped: true },
      { status: 500 }
    );
  }

  // 1) Preferred: SQL RPC (atomic)
  const rpc = await sb.rpc("increment_paper_views", { p_id: id });
  if (!rpc.error && rpc.data != null) {
    const viewCount = typeof rpc.data === "number" ? rpc.data : Number(rpc.data) || 0;
    return NextResponse.json({ viewCount, source: "rpc" });
  }

  // 2) Direct column update (service role) when RPC missing but column exists
  const { data: row, error: readErr } = await sb
    .from("papers")
    .select("view_count")
    .eq("id", id)
    .maybeSingle();

  if (!readErr && row) {
    const next = (Number((row as { view_count?: number }).view_count) || 0) + 1;
    const { data: updated, error: updErr } = await sb
      .from("papers")
      .update({ view_count: next })
      .eq("id", id)
      .select("view_count")
      .maybeSingle();

    if (!updErr && updated) {
      return NextResponse.json({
        viewCount: Number((updated as { view_count?: number }).view_count) || next,
        source: "column",
      });
    }
    if (updErr && !isMissingViewColumnError(updErr)) {
      console.warn("view column update:", updErr.message);
    }
  } else if (readErr && !isMissingViewColumnError(readErr)) {
    console.warn("view column read:", readErr.message);
  }

  // 3) Storage-backed counter until paper_engagement.sql is applied
  try {
    const viewCount = await bumpPaperView(sb, id);
    return NextResponse.json({
      viewCount,
      source: "storage",
      hint: "Run supabase/paper_engagement.sql in the Supabase SQL editor for native counters.",
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "View bump failed";
    console.warn("storage view bump:", msg);
    if (rpc.error) console.warn("increment_paper_views:", rpc.error.message);
    return NextResponse.json({ error: msg, viewCount: null, skipped: true }, { status: 500 });
  }
}

/** GET /api/papers/[id]/view — current count (db column or storage fallback) */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const sb = client();
  if (!sb) return NextResponse.json({ error: "Missing Supabase env vars" }, { status: 500 });

  const { data, error } = await sb.from("papers").select("view_count").eq("id", id).maybeSingle();
  if (!error && data) {
    return NextResponse.json({
      viewCount: Number((data as { view_count?: number }).view_count) || 0,
      source: "column",
    });
  }

  const map = await getPaperViewCounts(sb, [id]);
  return NextResponse.json({ viewCount: map[id] || 0, source: "storage" });
}
