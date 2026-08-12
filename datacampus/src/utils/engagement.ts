import { supabase } from "@/utils/supabaseClient";

/** Attach accurate like counts from `likes`; keep view_count from papers when present. */
export async function enrichEngagement<
  T extends { id: string; viewCount?: number | null; likeCount?: number | null }
>(papers: T[]): Promise<T[]> {
  if (!papers.length) return papers;

  const ids = papers.map((p) => p.id);
  const { data, error } = await supabase.from("likes").select("paper_id").in("paper_id", ids);

  const likeMap: Record<string, number> = {};
  if (!error && data) {
    for (const row of data) {
      const pid = row.paper_id as string;
      likeMap[pid] = (likeMap[pid] || 0) + 1;
    }
  }

  // Hydrate views from API (DB column or storage fallback when migration missing)
  let viewMap: Record<string, number> = {};
  try {
    const res = await fetch(
      `/api/papers/view-counts?ids=${encodeURIComponent(ids.join(","))}`,
      { cache: "no-store" }
    );
    if (res.ok) {
      const json = (await res.json()) as { counts?: Record<string, number> };
      viewMap = json.counts || {};
    }
  } catch {
    // ignore — fall back to row values
  }

  return papers.map((p) => {
    const fromColumn = Number(p.likeCount) || 0;
    const fromTable = likeMap[p.id] || 0;
    const fromRow = Math.max(0, Number(p.viewCount) || 0);
    const fromStore = Math.max(0, Number(viewMap[p.id]) || 0);
    return {
      ...p,
      viewCount: Math.max(fromRow, fromStore),
      // Prefer live table count; fall back to denormalized column
      likeCount: Math.max(fromTable, fromColumn),
    };
  });
}

export function mapPaperRow(row: any) {
  return {
    id: row.id as string,
    school: row.school as string,
    program: row.program as string,
    type: row.type as string,
    title: row.title as string,
    fileUrl: row.file_url as string,
    uploadedAt: row.uploaded_at,
    uploadedBy: (row.uploaded_by ?? null) as string | null,
    uploaderName: null as string | null,
    uploaderVerified: false,
    viewCount: Number(row.view_count) || 0,
    likeCount: Number(row.like_count) || 0,
  };
}

/** Attach display_name + verified badge for uploaders. */
export async function attachUploaders<
  T extends {
    uploadedBy?: string | null;
    uploaderName?: string | null;
    uploaderRole?: string | null;
    uploaderVerified?: boolean | null;
  }
>(papers: T[]): Promise<T[]> {
  const uploaderIds = [
    ...new Set(papers.map((p) => p.uploadedBy).filter(Boolean) as string[]),
  ];
  if (!uploaderIds.length) return papers;

  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, display_name, full_name, role, is_verified, verification_status")
    .in("id", uploaderIds);

  const map: Record<
    string,
    { name: string; role: string | null; verified: boolean }
  > = {};
  for (const p of profiles || []) {
    map[p.id] = {
      name: p.full_name || p.display_name || "Uploader",
      role: p.role ?? null,
      verified:
        Boolean(p.is_verified) || p.verification_status === "verified",
    };
  }

  return papers.map((paper) => {
    if (!paper.uploadedBy || !map[paper.uploadedBy]) return paper;
    return {
      ...paper,
      uploaderName: map[paper.uploadedBy].name,
      uploaderRole: map[paper.uploadedBy].role,
      uploaderVerified: map[paper.uploadedBy].verified,
    };
  });
}
