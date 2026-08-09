"use client";

import React, { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/utils/supabaseClient";
import PaperCard from "@/components/PaperCard";
import LoadingSkeleton from "@/components/LoadingSkeleton";
import EmptyState from "@/components/EmptyState";
import FollowButton from "@/components/FollowButton";
import { useFollow } from "@/hooks/useFollow";
import VerifiedBadge from "@/components/VerifiedBadge";
import { isStaffRole } from "@/utils/staff";
import { showToast } from "@/utils/toast";
import {
  Users,
  Upload,
  MessageCircle,
  MoreVertical,
  Send,
  Loader2,
  Lock,
} from "lucide-react";

interface Paper {
  id: string;
  school: string;
  program: string;
  type: string;
  title: string;
  uploadedAt: string;
  uploadedBy?: string | null;
}

interface Post {
  id: string;
  user_id: string;
  price_credits: number;
  created_at: string;
  unlocked: boolean;
  is_owner: boolean;
  body: string | null;
  media_path: string | null;
}

function formatCount(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
}

function relativeTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

function PostCard({
  post,
  unlocking,
  onUnlock,
}: {
  post: Post;
  unlocking: boolean;
  onUnlock: () => void;
}) {
  const isPaid = post.price_credits > 0;

  if (isPaid && !post.unlocked) {
    return (
      <div className="w-full p-5 rounded-2xl border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/60">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-full bg-gray-200 dark:bg-gray-800 text-gray-500 dark:text-gray-400 shrink-0">
            <Lock className="w-4 h-4" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">This post is locked</p>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
                {post.price_credits} credit{post.price_credits === 1 ? "" : "s"}
              </span>
              <button
                type="button"
                disabled={unlocking}
                onClick={onUnlock}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-full text-sm font-semibold bg-indigo-600 text-white disabled:opacity-50"
              >
                {unlocking ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                Unlock for {post.price_credits} credit{post.price_credits === 1 ? "" : "s"}
              </button>
            </div>
          </div>
        </div>
        <p className="text-xs text-gray-400 mt-3">{relativeTime(post.created_at)}</p>
      </div>
    );
  }

  return (
    <div className="w-full p-5 rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
      <p className="text-sm text-gray-800 dark:text-gray-200 whitespace-pre-wrap break-words">
        {post.body}
      </p>
      <div className="flex items-center justify-between gap-3 mt-3">
        <span className="text-[11px] font-medium uppercase tracking-wide text-gray-400">
          {isPaid ? `${post.price_credits} credits` : "Free"}
        </span>
        <span className="text-xs text-gray-400">{relativeTime(post.created_at)}</span>
      </div>
    </div>
  );
}

export default function ChannelPage() {
  const params = useParams() as { id: string };
  const router = useRouter();
  const [name, setName] = useState("Uploader");
  const [role, setRole] = useState<string | null>(null);
  const [isVerified, setIsVerified] = useState<boolean | null>(null);
  const [papers, setPapers] = useState<Paper[]>([]);
  const [loading, setLoading] = useState(true);
  const { followerCount, followingCount, isSelf } = useFollow(params?.id);

  const [session, setSession] = useState<{ access_token?: string } | null>(null);
  const [blocked, setBlocked] = useState(false);
  const [blocking, setBlocking] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const [composerOpen, setComposerOpen] = useState(false);
  const [composerText, setComposerText] = useState("");
  const [composerSending, setComposerSending] = useState(false);

  const [posts, setPosts] = useState<Post[]>([]);
  const [postsLoading, setPostsLoading] = useState(true);
  const [unlockingId, setUnlockingId] = useState<string | null>(null);

  const [reputation, setReputation] = useState<number | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!mounted) return;
      setSession(data.session);
    })();
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => {
      mounted = false;
      sub?.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!params?.id) return;
    let mounted = true;
    (async () => {
      setLoading(true);
      const [{ data: profile }, { data, error }] = await Promise.all([
        supabase.from("profiles").select("display_name, role, is_verified").eq("id", params.id).maybeSingle(),
        supabase
          .from("papers")
          .select("*")
          .eq("uploaded_by", params.id)
          .order("uploaded_at", { ascending: false })
          .limit(48),
      ]);

      if (!mounted) return;
      if (profile?.display_name) setName(profile.display_name);
      setRole(profile?.role ?? null);
      setIsVerified(profile?.is_verified ?? null);
      if (error) {
        console.warn(error.message);
        setPapers([]);
      } else {
        setPapers(
          (data || []).map((row: any) => ({
            id: row.id,
            school: row.school,
            program: row.program,
            type: row.type,
            title: row.title,
            uploadedAt: row.uploaded_at,
            uploadedBy: row.uploaded_by,
          }))
        );
      }
      setLoading(false);
    })();
    return () => {
      mounted = false;
    };
  }, [params?.id]);

  useEffect(() => {
    if (!params?.id) return;
    let mounted = true;
    (async () => {
      try {
        const res = await fetch("/api/social/profile-stats?userId=" + params.id);
        const json = await res.json().catch(() => ({}));
        if (!mounted) return;
        setReputation(res.ok && typeof json.reputation === "number" ? json.reputation : null);
      } catch {
        if (mounted) setReputation(null);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [params?.id]);

  useEffect(() => {
    if (!params?.id) return;
    let mounted = true;
    (async () => {
      setPostsLoading(true);
      try {
        const res = await fetch("/api/social/posts?userId=" + params.id, {
          headers: session?.access_token
            ? { Authorization: "Bearer " + session.access_token }
            : undefined,
        });
        const json = await res.json().catch(() => ({}));
        if (!mounted) return;
        setPosts(res.ok ? json.posts || [] : []);
      } finally {
        if (mounted) setPostsLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [params?.id, session?.access_token]);

  const sendMessageRequest = async () => {
    const token = session?.access_token;
    if (!token) {
      showToast("info", "Sign in to send messages");
      return;
    }
    const trimmed = composerText.trim();
    if (!trimmed) return;
    setComposerSending(true);
    try {
      const res = await fetch("/api/social/message-request", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + token,
        },
        body: JSON.stringify({ recipientId: params.id, body: trimmed }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast("error", json.error || "Could not send message");
        return;
      }
      if (json.status === "sent") {
        showToast("success", "Message sent");
      } else {
        showToast(
          "success",
          json.feeCharged > 0
            ? "Paid " + json.feeCharged + " credit" + (json.feeCharged === 1 ? "" : "s") + " — message request sent"
            : "Message request sent"
        );
      }
      setComposerText("");
      setComposerOpen(false);
    } finally {
      setComposerSending(false);
    }
  };

  const blockUser = async () => {
    const token = session?.access_token;
    if (!token) {
      showToast("info", "Sign in first");
      return;
    }
    setMenuOpen(false);
    if (!window.confirm("Block this user? They won't be able to follow or message you.")) return;
    setBlocking(true);
    try {
      const res = await fetch("/api/social/block", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + token,
        },
        body: JSON.stringify({ userId: params.id }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast("error", json.error || "Could not block user");
        return;
      }
      setBlocked(true);
      setComposerOpen(false);
      showToast("success", "User blocked");
    } finally {
      setBlocking(false);
    }
  };

  const unlockPost = async (postId: string) => {
    const token = session?.access_token;
    if (!token) {
      showToast("info", "Sign in to unlock posts");
      return;
    }
    setUnlockingId(postId);
    try {
      const res = await fetch("/api/social/posts/" + postId + "/unlock", {
        method: "POST",
        headers: { Authorization: "Bearer " + token },
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast("error", json.error || "Could not unlock post");
        return;
      }
      setPosts((prev) => prev.map((p) => (p.id === postId ? { ...p, ...json.post } : p)));
      showToast("success", "Unlocked");
    } finally {
      setUnlockingId(null);
    }
  };

  return (
    <div className="px-3 pt-4 md:px-0 md:pt-0">
      <button
        type="button"
        onClick={() => router.back()}
        className="text-sm text-gray-500 hover:text-gray-800 dark:hover:text-gray-200 mb-4"
      >
        ← Back
      </button>

      {/* YouTube-style channel header */}
      <div className="mb-6 p-4 sm:p-6 bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800">
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          <div
            className={`h-20 w-20 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-2xl font-bold text-white shrink-0 ${
              isStaffRole(role)
                ? "ring-2 ring-amber-400/60 ring-offset-2 ring-offset-white dark:ring-offset-gray-900"
                : isVerified
                  ? "ring-2 ring-sky-400/60 ring-offset-2 ring-offset-white dark:ring-offset-gray-900"
                  : ""
            }`}
          >
            {name[0]?.toUpperCase() || "U"}
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-gray-100 truncate inline-flex items-center">
              {name}
              <VerifiedBadge role={role} isVerified={isVerified} size="md" className="ml-1" />
            </h1>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-sm text-gray-500 dark:text-gray-400">
              <span className="inline-flex items-center gap-1">
                <Users className="w-3.5 h-3.5" />
                {formatCount(followerCount)} subscriber{followerCount === 1 ? "" : "s"}
              </span>
              <span>·</span>
              <span>{formatCount(followingCount)} following</span>
              <span>·</span>
              <span className="inline-flex items-center gap-1">
                <Upload className="w-3.5 h-3.5" />
                {loading ? "…" : `${papers.length} upload${papers.length === 1 ? "" : "s"}`}
              </span>
              {reputation !== null && (
                <>
                  <span>·</span>
                  <span className="inline-flex items-center gap-1">
                    💰 {reputation.toLocaleString()} reputation
                  </span>
                </>
              )}
            </div>
          </div>
          {!isSelf && !blocked && (
            <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
              <FollowButton userId={params.id} />
              <button
                type="button"
                onClick={() => setComposerOpen((o) => !o)}
                className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-full text-sm font-semibold border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800"
              >
                <MessageCircle className="w-4 h-4" />
                Message
              </button>
              <div className="relative">
                <button
                  type="button"
                  aria-label="More actions"
                  onClick={() => setMenuOpen((o) => !o)}
                  className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400"
                >
                  <MoreVertical className="w-4 h-4" />
                </button>
                {menuOpen && (
                  <div className="absolute right-0 mt-1 w-40 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg shadow-lg z-10 overflow-hidden">
                    <button
                      type="button"
                      disabled={blocking}
                      onClick={() => void blockUser()}
                      className="w-full text-left px-3 py-2 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 disabled:opacity-50"
                    >
                      {blocking ? "Blocking..." : "Block user"}
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {composerOpen && !blocked && (
          <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-800 w-full">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Message {name}
            </label>
            <textarea
              value={composerText}
              onChange={(e) => setComposerText(e.target.value)}
              rows={4}
              maxLength={4000}
              placeholder="Write your message..."
              className="w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-sm resize-none mb-3"
            />
            <div className="flex flex-col sm:flex-row gap-2">
              <button
                type="button"
                onClick={() => {
                  setComposerOpen(false);
                  setComposerText("");
                }}
                className="w-full sm:w-auto sm:flex-none order-2 sm:order-1 py-2.5 px-4 rounded-xl bg-gray-100 dark:bg-gray-800 text-sm font-medium"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={composerSending || !composerText.trim()}
                onClick={() => void sendMessageRequest()}
                className="w-full sm:flex-1 order-1 sm:order-2 py-2.5 px-4 rounded-xl bg-indigo-600 text-white text-sm font-medium disabled:opacity-50 inline-flex items-center justify-center gap-2"
              >
                {composerSending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
                Send
              </button>
            </div>
          </div>
        )}
      </div>

      <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4 px-0.5">Videos</h2>

      {loading ? (
        <LoadingSkeleton />
      ) : papers.length === 0 ? (
        <EmptyState type="no-papers" />
      ) : (
        <>
          <div className="md:hidden divide-y divide-transparent">
            {papers.map((p) => (
              <PaperCard
                key={p.id}
                id={p.id}
                title={p.title}
                program={p.program}
                type={p.type}
                school={p.school}
                uploadedAt={p.uploadedAt}
                uploaderName={name}
                uploadedBy={params.id}
                uploaderRole={role}
                uploaderVerified={isVerified}
                variant="feed"
              />
            ))}
          </div>
          <div className="hidden md:grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {papers.map((p) => (
              <PaperCard
                key={p.id}
                id={p.id}
                title={p.title}
                program={p.program}
                type={p.type}
                uploadedAt={p.uploadedAt}
                uploaderName={name}
                uploadedBy={params.id}
                uploaderRole={role}
                uploaderVerified={isVerified}
              />
            ))}
          </div>
        </>
      )}

      <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4 mt-8 px-0.5">Posts</h2>

      {postsLoading ? (
        <LoadingSkeleton />
      ) : posts.length === 0 ? (
        <div className="text-center py-12 text-gray-500 dark:text-gray-400">
          <p className="text-sm">No posts yet</p>
        </div>
      ) : (
        <div className="space-y-3">
          {posts.map((post) => (
            <PostCard
              key={post.id}
              post={post}
              unlocking={unlockingId === post.id}
              onUnlock={() => void unlockPost(post.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
