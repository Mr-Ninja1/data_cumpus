"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/utils/supabaseClient";
import { showToast } from "@/utils/toast";

export function useFollow(targetUserId: string | null | undefined) {
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [isFollowing, setIsFollowing] = useState(false);
  const [followerCount, setFollowerCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    if (!targetUserId) {
      setLoading(false);
      return;
    }
    setLoading(true);

    const { data: sessionData } = await supabase.auth.getSession();
    const uid = sessionData.session?.user?.id ?? null;
    setCurrentUserId(uid);

    const [followersRes, followingRes] = await Promise.all([
      supabase
        .from("follows")
        .select("*", { count: "exact", head: true })
        .eq("following_id", targetUserId),
      supabase
        .from("follows")
        .select("*", { count: "exact", head: true })
        .eq("follower_id", targetUserId),
    ]);

    setFollowerCount(followersRes.count ?? 0);
    setFollowingCount(followingRes.count ?? 0);

    if (uid) {
      const { count } = await supabase
        .from("follows")
        .select("id", { count: "exact", head: true })
        .eq("follower_id", uid)
        .eq("following_id", targetUserId);
      setIsFollowing((count ?? 0) > 0);
    } else {
      setIsFollowing(false);
    }
    setLoading(false);
  }, [targetUserId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const toggleFollow = async () => {
    if (!targetUserId) return;
    if (!currentUserId) {
      showToast("info", "Sign in to follow channels");
      await supabase.auth.signInWithOAuth({ provider: "google" });
      return;
    }
    if (currentUserId === targetUserId) return;

    setBusy(true);
    try {
      if (isFollowing) {
        const { error } = await supabase
          .from("follows")
          .delete()
          .eq("follower_id", currentUserId)
          .eq("following_id", targetUserId);
        if (error) throw error;
        setIsFollowing(false);
        setFollowerCount((c) => Math.max(0, c - 1));
        showToast("success", "Unsubscribed");
      } else {
        const { error } = await supabase.from("follows").insert({
          follower_id: currentUserId,
          following_id: targetUserId,
        });
        if (error) throw error;
        setIsFollowing(true);
        setFollowerCount((c) => c + 1);
        showToast("success", "Subscribed");

        const { data: sessionData } = await supabase.auth.getSession();
        const token = sessionData.session?.access_token;
        if (token) {
          void fetch("/api/social/follow-notify", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ followingId: targetUserId }),
          });
        }
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Could not update subscription";
      showToast("error", msg.includes("follows") ? "Run wave_c migration in Supabase first" : msg);
      void refresh();
    } finally {
      setBusy(false);
    }
  };

  return {
    isFollowing,
    followerCount,
    followingCount,
    loading,
    busy,
    toggleFollow,
    refresh,
    currentUserId,
    isSelf: Boolean(currentUserId && targetUserId && currentUserId === targetUserId),
  };
}

/** IDs of users the current user follows (empty if signed out). */
export async function fetchFollowingIds(userId: string | null): Promise<string[]> {
  if (!userId) return [];
  const { data, error } = await supabase
    .from("follows")
    .select("following_id")
    .eq("follower_id", userId);
  if (error) return [];
  return (data || []).map((r) => r.following_id);
}

export default useFollow;
