import type { SupabaseClient } from "@supabase/supabase-js";

/** Private bucket used for engagement fallback until SQL migration is applied. */
const BUCKET = "attachments";
const PATH = "engagement/paper_views.json";

export type ViewMap = Record<string, number>;

function asMap(raw: unknown): ViewMap {
  if (!raw || typeof raw !== "object") return {};
  const out: ViewMap = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const n = Number(v);
    if (k && Number.isFinite(n) && n >= 0) out[k] = Math.floor(n);
  }
  return out;
}

export async function loadViewMap(client: SupabaseClient): Promise<ViewMap> {
  const { data, error } = await client.storage.from(BUCKET).download(PATH);
  if (error || !data) {
    // Missing file is fine — start empty
    return {};
  }
  try {
    const text = await data.text();
    return asMap(JSON.parse(text));
  } catch {
    return {};
  }
}

async function saveViewMap(client: SupabaseClient, map: ViewMap): Promise<void> {
  const body = JSON.stringify(map);
  const { error } = await client.storage.from(BUCKET).upload(PATH, body, {
    contentType: "application/json",
    upsert: true,
  });
  if (error) throw new Error(error.message);
}

/** Atomically-ish bump one paper's view count in storage fallback. */
export async function bumpPaperView(client: SupabaseClient, paperId: string): Promise<number> {
  const map = await loadViewMap(client);
  const next = (map[paperId] || 0) + 1;
  map[paperId] = next;
  await saveViewMap(client, map);
  return next;
}

export async function getPaperViewCounts(
  client: SupabaseClient,
  ids: string[]
): Promise<ViewMap> {
  if (!ids.length) return {};
  const map = await loadViewMap(client);
  const out: ViewMap = {};
  for (const id of ids) {
    if (map[id]) out[id] = map[id];
  }
  return out;
}

export function isMissingViewColumnError(err: { message?: string; code?: string } | null): boolean {
  if (!err) return false;
  const msg = (err.message || "").toLowerCase();
  return (
    err.code === "42703" ||
    msg.includes("view_count") ||
    msg.includes("does not exist")
  );
}
