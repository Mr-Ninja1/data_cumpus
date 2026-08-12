import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/utils/supabaseServerClient";
import { createClient } from "@supabase/supabase-js";
import { getPaperViewCounts, isMissingViewColumnError } from "@/utils/paperViews";

export const runtime = "nodejs";

function client() {
  if (supabaseServer) return supabaseServer;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

/**
 * GET /api/papers/view-counts?ids=uuid,uuid
 * Returns { counts: Record<id, number> } from papers.view_count when present,
 * otherwise from storage fallback (until paper_engagement.sql is applied).
 */
export async function GET(req: NextRequest) {
  const idsParam = req.nextUrl.searchParams.get("ids") || "";
  const ids = [...new Set(idsParam.split(",").map((s) => s.trim()).filter(Boolean))].slice(0, 100);
  if (!ids.length) return NextResponse.json({ counts: {} });

  const sb = client();
  if (!sb) return NextResponse.json({ error: "Missing Supabase env" }, { status: 500 });

  const { data, error } = await sb.from("papers").select("id, view_count").in("id", ids);

  if (!error && data) {
    const counts: Record<string, number> = {};
    for (const row of data) {
      counts[row.id] = Number(row.view_count) || 0;
    }
    // If every row is 0, still merge storage (migration may be partial)
    const anyPositive = Object.values(counts).some((n) => n > 0);
    if (anyPositive) return NextResponse.json({ counts, source: "column" });

    const stored = await getPaperViewCounts(sb, ids);
    for (const id of ids) {
      counts[id] = Math.max(counts[id] || 0, stored[id] || 0);
    }
    return NextResponse.json({
      counts,
      source: Object.keys(stored).length ? "mixed" : "column",
    });
  }

  if (error && !isMissingViewColumnError(error)) {
    console.warn("view-counts:", error.message);
  }

  try {
    const counts = await getPaperViewCounts(sb, ids);
    // Ensure every requested id is present
    for (const id of ids) if (counts[id] == null) counts[id] = 0;
    return NextResponse.json({ counts, source: "storage" });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Failed to load view counts";
    return NextResponse.json({ error: msg, counts: {} }, { status: 500 });
  }
}
