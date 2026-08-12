"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/utils/supabaseClient";
import { showToast } from "@/utils/toast";
import { useProfile } from "@/hooks/useProfile";
import { openVerifyPrompt } from "@/utils/verificationGate";

export function useFollow(targetUserId: string | null | undefined) {
  const { canUseSocialFeatures } = useProfile();
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
      showToast("info", "Sign in to follow people");
      await supabase.auth.signInWithOAuth({ provider: "google" });
      return;
    }
    if (currentUserId === targetUserId) return;

    // Unfollow always allowed; new follows require verification (staff bypass)
    if (!isFollowing && !canUseSocialFeatures) {
      showToast("info", "Verify your student status to follow people");
      openVerifyPrompt("follow");
      return;
    }

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
        showToast("success", "Unfollowed");
      } else {
        // Routed through the server so a follow fee (if the channel has set
        // one) can be enforced honestly, and blocked users can't follow.
        const { data: sessionData } = await supabase.auth.getSession();
        const token = sessionData.session?.access_token;
        const res = await fetch("/api/social/follow", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ followingId: targetUserId }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(json?.error || "Could not follow");
        }
        setIsFollowing(true);
        setFollowerCount((c) => c + 1);
        showToast(
          "success",
          json?.feeCharged > 0 ? `Following — paid ${json.feeCharged} credits` : "Following"
        );
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Could not update follow";
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
