"use client";
import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import { supabase } from "@/utils/supabaseClient";
import { showToast } from "@/utils/toast";
import { bumpInterest } from "@/utils/interests";

type InterestMeta = { program?: string; school?: string; type?: string };

type LibraryState = {
  saves: string[];
  likes: string[];
  toggleSave: (paperId: string, meta?: InterestMeta) => void;
  toggleLike: (paperId: string, meta?: InterestMeta) => void;
  isSaved: (paperId: string) => boolean;
  isLiked: (paperId: string) => boolean;
  loading: boolean;
  userId: string | null;
  dbReady: boolean;
};

const LibraryContext = createContext<LibraryState>({
  saves: [],
  likes: [],
  toggleSave: () => {},
  toggleLike: () => {},
  isSaved: () => false,
  isLiked: () => false,
  loading: true,
  userId: null,
  dbReady: false,
});

function storageKey(kind: "saves" | "likes", userId: string | null) {
  return `dc:${kind}:${userId || "guest"}`;
}

function readIds(key: string): string[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function writeIds(key: string, ids: string[]) {
  try {
    localStorage.setItem(key, JSON.stringify(ids));
  } catch {
    // ignore
  }
}

function mergeUnique(...lists: string[][]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const list of lists) {
    for (const id of list) {
      if (!seen.has(id)) {
        seen.add(id);
        out.push(id);
      }
    }
  }
  return out;
}

async function fetchDbIds(table: "saves" | "likes", uid: string): Promise<string[] | null> {
  const { data, error } = await supabase
    .from(table)
    .select("paper_id")
    .eq("user_id", uid)
    .order("created_at", { ascending: false });
  if (error) {
    console.warn(`${table} table unavailable:`, error.message);
    return null;
  }
  return (data || []).map((r) => r.paper_id as string);
}

async function upsertDbRows(table: "saves" | "likes", uid: string, paperIds: string[]) {
  if (!paperIds.length) return true;
  const rows = paperIds.map((paper_id) => ({ user_id: uid, paper_id }));
  const { error } = await supabase.from(table).upsert(rows, {
    onConflict: "user_id,paper_id",
    ignoreDuplicates: true,
  });
  if (error) {
    console.warn(`Failed to sync ${table}:`, error.message);
    return false;
  }
  return true;
}

async function deleteDbRow(table: "saves" | "likes", uid: string, paperId: string) {
  const { error } = await supabase
    .from(table)
    .delete()
    .eq("user_id", uid)
    .eq("paper_id", paperId);
  if (error) {
    console.warn(`Failed to remove ${table}:`, error.message);
    return false;
  }
  return true;
}

export function LibraryProvider({ children }: { children: React.ReactNode }) {
  const [userId, setUserId] = useState<string | null>(null);
  const [saves, setSaves] = useState<string[]>([]);
  const [likes, setLikes] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [dbReady, setDbReady] = useState(false);
  const userIdRef = useRef<string | null>(null);
  const dbReadyRef = useRef(false);

  useEffect(() => {
    userIdRef.current = userId;
  }, [userId]);

  useEffect(() => {
    dbReadyRef.current = dbReady;
  }, [dbReady]);

  const loadForUser = async (uid: string | null) => {
    setLoading(true);

    if (!uid) {
      setSaves(readIds(storageKey("saves", null)));
      setLikes(readIds(storageKey("likes", null)));
      setDbReady(false);
      setLoading(false);
      return;
    }

    // Optimistic local cache while DB loads
    const localSaves = readIds(storageKey("saves", uid));
    const localLikes = readIds(storageKey("likes", uid));
    const guestSaves = readIds(storageKey("saves", null));
    const guestLikes = readIds(storageKey("likes", null));
    setSaves(mergeUnique(localSaves, guestSaves));
    setLikes(mergeUnique(localLikes, guestLikes));

    const [dbSaves, dbLikes] = await Promise.all([
      fetchDbIds("saves", uid),
      fetchDbIds("likes", uid),
    ]);

    const tablesReady = dbSaves !== null && dbLikes !== null;
    setDbReady(tablesReady);

    if (!tablesReady) {
      // Fall back to localStorage only (saves.sql not applied yet)
      const mergedSaves = mergeUnique(localSaves, guestSaves);
      const mergedLikes = mergeUnique(localLikes, guestLikes);
      writeIds(storageKey("saves", uid), mergedSaves);
      writeIds(storageKey("likes", uid), mergedLikes);
      setSaves(mergedSaves);
      setLikes(mergedLikes);
      setLoading(false);
      return;
    }

    // Migrate any guest + local IDs missing from DB
    const toSyncSaves = mergeUnique(guestSaves, localSaves).filter((id) => !dbSaves.includes(id));
    const toSyncLikes = mergeUnique(guestLikes, localLikes).filter((id) => !dbLikes.includes(id));
    await Promise.all([
      upsertDbRows("saves", uid, toSyncSaves),
      upsertDbRows("likes", uid, toSyncLikes),
    ]);

    const mergedSaves = mergeUnique(toSyncSaves, dbSaves);
    const mergedLikes = mergeUnique(toSyncLikes, dbLikes);
    writeIds(storageKey("saves", uid), mergedSaves);
    writeIds(storageKey("likes", uid), mergedLikes);
    setSaves(mergedSaves);
    setLikes(mergedLikes);
    setLoading(false);
  };

  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!mounted) return;
      const uid = data.session?.user?.id ?? null;
      setUserId(uid);
      await loadForUser(uid);
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((_ev, session) => {
      const uid = session?.user?.id ?? null;
      setUserId(uid);
      void loadForUser(uid);
    });

    return () => {
      mounted = false;
      sub?.subscription.unsubscribe();
    };
  }, []);

  const bumpMeta = (meta?: InterestMeta) => {
    if (!meta) return;
    if (meta.program) bumpInterest("programs", meta.program, 2);
    if (meta.school) bumpInterest("schools", meta.school, 2);
    if (meta.type) bumpInterest("types", meta.type, 2);
  };

  const toggleSave = (paperId: string, meta?: InterestMeta) => {
    const uid = userIdRef.current;
    const useDb = dbReadyRef.current && Boolean(uid);
    setSaves((prev) => {
      const adding = !prev.includes(paperId);
      const next = adding ? [paperId, ...prev] : prev.filter((id) => id !== paperId);
      writeIds(storageKey("saves", uid), next);
      if (adding) bumpMeta(meta);
      showToast(
        "success",
        next.includes(paperId) ? "Saved to your library" : "Removed from library"
      );

      if (useDb && uid) {
        void (adding
          ? upsertDbRows("saves", uid, [paperId])
          : deleteDbRow("saves", uid, paperId));
      }
      return next;
    });
  };

  const toggleLike = (paperId: string, meta?: InterestMeta) => {
    const uid = userIdRef.current;
    const useDb = dbReadyRef.current && Boolean(uid);
    setLikes((prev) => {
      const adding = !prev.includes(paperId);
      const next = adding ? [paperId, ...prev] : prev.filter((id) => id !== paperId);
      writeIds(storageKey("likes", uid), next);
      if (adding) bumpMeta(meta);
      showToast(
        "success",
        next.includes(paperId) ? "Liked" : "Like removed"
      );

      if (useDb && uid) {
        void (adding
          ? upsertDbRows("likes", uid, [paperId])
          : deleteDbRow("likes", uid, paperId));
      }
      return next;
    });
  };

  return (
    <LibraryContext.Provider
      value={{
        saves,
        likes,
        toggleSave,
        toggleLike,
        isSaved: (id) => saves.includes(id),
        isLiked: (id) => likes.includes(id),
        loading,
        userId,
        dbReady,
      }}
    >
      {children}
    </LibraryContext.Provider>
  );
}

export const useLibrary = () => useContext(LibraryContext);

export default useLibrary;
