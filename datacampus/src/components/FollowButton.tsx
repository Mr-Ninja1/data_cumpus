"use client";

import React from "react";
import { Bell, Loader2 } from "lucide-react";
import { useFollow } from "@/hooks/useFollow";

type Props = {
  userId: string;
  size?: "sm" | "md";
  className?: string;
};

export default function FollowButton({ userId, size = "md", className = "" }: Props) {
  const { isFollowing, loading, busy, toggleFollow, isSelf } = useFollow(userId);

  if (isSelf) return null;

  const pad = size === "sm" ? "px-3 py-1.5 text-[13px]" : "px-4 py-2 text-sm";

  return (
    <button
      type="button"
      disabled={loading || busy}
      onClick={() => void toggleFollow()}
      className={`inline-flex items-center justify-center gap-1.5 rounded-full font-semibold transition-colors disabled:opacity-50 ${pad} ${
        isFollowing
          ? "bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-700"
          : "bg-gray-900 dark:bg-white text-white dark:text-gray-900 hover:opacity-90"
      } ${className}`}
    >
      {busy ? (
        <Loader2 className="w-4 h-4 animate-spin" />
      ) : (
        <Bell className={`w-4 h-4 ${isFollowing ? "fill-current" : ""}`} />
      )}
      {loading ? "…" : isFollowing ? "Subscribed" : "Subscribe"}
    </button>
  );
}
