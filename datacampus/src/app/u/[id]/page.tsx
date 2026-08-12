"use client";

import React, { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/utils/supabaseClient";
import PaperCard from "@/components/PaperCard";
import LoadingSkeleton from "@/components/LoadingSkeleton";
import EmptyState from "@/components/EmptyState";
import FollowButton from "@/components/FollowButton";
import VerifiedBadge from "@/components/VerifiedBadge";
import { useFollow } from "@/hooks/useFollow";
import { isStaffRole } from "@/utils/staff";
import { showToast } from "@/utils/toast";
import { enrichEngagement, mapPaperRow } from "@/utils/engagement";
import {
  ArrowUpRight,
  BadgeCheck,
  FileText,
  Users,
  Upload,
  MessageCircle,
  MoreVertical,
  Send,
  Loader2,
  Lock,
  Wallet,
} from "lucide-react";

interface Paper {
  id: string;
  school: string;
  program: string;
  type: string;
  title: string;
  uploadedAt: string;
  uploadedBy?: string | null;
  viewCount?: number;
  likeCount?: number;
  uploaderVerified?: boolean;
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
  const [program, setProgram] = useState<string | null>(null);
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
        supabase
          .from("profiles")
          .select("display_name, full_name, role, is_verified, verification_status, program")
          .eq("id", params.id)
          .maybeSingle(),
        supabase
          .from("papers")
          .select("*")
          .eq("uploaded_by", params.id)
          .order("uploaded_at", { ascending: false })
          .limit(48),
      ]);

      if (!mounted) return;

      const channelVerified = profile
        ? Boolean(profile.is_verified) || profile.verification_status === "verified"
        : false;

      if (profile) {
        setName(profile.full_name || profile.display_name || "Uploader");
        setRole(profile.role ?? null);
        setIsVerified(channelVerified);
        setProgram(profile.program || null);
      }

      if (error) {
        console.warn(error.message);
        setPapers([]);
      } else {
        const mapped = await enrichEngagement(
          (data || []).map((row: any) => {
            const m = mapPaperRow(row);
            return {
              id: m.id,
              school: m.school,
              program: m.program,
              type: m.type,
              title: m.title,
              uploadedAt: m.uploadedAt,
              uploadedBy: m.uploadedBy,
              viewCount: m.viewCount,
              likeCount: m.likeCount,
              uploaderVerified: channelVerified,
            } as Paper;
          })
        );
        setPapers(mapped);
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
        className="mb-4 text-sm text-gray-500 hover:text-gray-800 dark:hover:text-gray-200"
      >
        ← Back
      </button>

      <section className="mb-6 overflow-hidden rounded-[2rem] border border-gray-200 bg-white shadow-[0_20px_60px_-35px_rgba(79,70,229,0.45)] dark:border-gray-800 dark:bg-gray-900">
        <div className="relative overflow-hidden bg-gradient-to-r from-[#2b0a63] via-[#4f2cc9] to-[#6d28d9] px-4 pb-16 pt-5 sm:px-6 sm:pb-20">
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute -right-10 top-0 h-40 w-40 rounded-full bg-white/10 blur-3xl" />
            <div className="absolute left-10 top-8 h-24 w-24 rounded-full bg-cyan-300/20 blur-2xl" />
          </div>
          <div className="relative flex items-center justify-between gap-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-medium text-white/90 backdrop-blur">
              <BadgeCheck className="h-3.5 w-3.5" />
              {isVerified ? "Verified profile" : "Campus profile"}
            </div>
            {!isSelf && !blocked && (
              <div className="relative">
                <button
                  type="button"
                  aria-label="More actions"
                  onClick={() => setMenuOpen((o) => !o)}
                  className="rounded-full border border-white/15 bg-white/10 p-2 text-white/80 backdrop-blur transition hover:bg-white/15"
                >
                  <MoreVertical className="h-4 w-4" />
                </button>
                {menuOpen && (
                  <div className="absolute right-0 z-10 mt-2 w-40 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-lg dark:border-gray-800 dark:bg-gray-900">
                    <button
                      type="button"
                      disabled={blocking}
                      onClick={() => void blockUser()}
                      className="w-full px-3 py-2 text-left text-sm text-red-600 transition hover:bg-red-50 disabled:opacity-50 dark:hover:bg-red-950/30"
                    >
                      {blocking ? "Blocking..." : "Block user"}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="relative px-4 pb-5 sm:px-6 sm:pb-6">
          <div className="-mt-12 flex flex-col gap-5 lg:-mt-14 lg:flex-row lg:items-end lg:justify-between">
            <div className="flex min-w-0 items-end gap-4">
              <div
                className={`flex h-24 w-24 shrink-0 items-center justify-center rounded-[1.75rem] bg-gradient-to-br from-indigo-500 via-violet-500 to-fuchsia-500 text-3xl font-bold text-white shadow-xl shadow-violet-500/30 ring-4 ring-white dark:ring-gray-900 ${
                  isStaffRole(role)
                    ? "outline outline-2 outline-amber-400/70"
                    : isVerified
                      ? "outline outline-2 outline-sky-400/70"
                      : ""
                }`}
              >
                {name[0]?.toUpperCase() || "U"}
              </div>

              <div className="min-w-0 pb-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="truncate text-2xl font-bold tracking-tight text-gray-900 dark:text-gray-100 sm:text-3xl">
                    {name}
                  </h1>
                  <VerifiedBadge role={role} isVerified={isVerified} size="md" />
                </div>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  {program || "Student on DataCampus"}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <span className="rounded-full bg-violet-50 px-3 py-1 text-xs font-medium text-violet-700 dark:bg-violet-950/40 dark:text-violet-300">
                    @{name.toLowerCase().replace(/\s+/g, "")}
                  </span>
                  {isStaffRole(role) && (
                    <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700 dark:bg-amber-950/30 dark:text-amber-300">
                      Staff
                    </span>
                  )}
                  {!isStaffRole(role) && (
                    <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                      Student creator
                    </span>
                  )}
                </div>
              </div>
            </div>

            {!isSelf && !blocked && (
              <div className="flex w-full flex-wrap gap-2 lg:w-auto lg:justify-end">
                <FollowButton userId={params.id} className="flex-1 sm:flex-none" />
                <button
                  type="button"
                  onClick={() => setComposerOpen((o) => !o)}
                  className="inline-flex flex-1 items-center justify-center gap-2 rounded-full border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-gray-900 shadow-sm transition hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100 dark:hover:bg-gray-800 sm:flex-none"
                >
                  <MessageCircle className="h-4 w-4" />
                  Message
                </button>
                <button
                  type="button"
                  onClick={() => router.push(`/inbox?tab=messages&peer=${params.id}`)}
                  className="inline-flex items-center justify-center gap-2 rounded-full bg-gray-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 dark:bg-white dark:text-gray-900"
                >
                  <ArrowUpRight className="h-4 w-4" />
                  Open chat
                </button>
              </div>
            )}
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-3xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-950">
              <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400">
                <Users className="h-4 w-4 text-violet-500" />
                <span className="text-xs font-medium uppercase tracking-wide">Followers</span>
              </div>
              <p className="mt-2 text-2xl font-bold text-gray-900 dark:text-gray-100">{formatCount(followerCount)}</p>
            </div>
            <div className="rounded-3xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-950">
              <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400">
                <Users className="h-4 w-4 text-sky-500" />
                <span className="text-xs font-medium uppercase tracking-wide">Following</span>
              </div>
              <p className="mt-2 text-2xl font-bold text-gray-900 dark:text-gray-100">{formatCount(followingCount)}</p>
            </div>
            <div className="rounded-3xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-950">
              <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400">
                <Upload className="h-4 w-4 text-indigo-500" />
                <span className="text-xs font-medium uppercase tracking-wide">Uploads</span>
              </div>
              <p className="mt-2 text-2xl font-bold text-gray-900 dark:text-gray-100">
                {loading ? "…" : formatCount(papers.length)}
              </p>
            </div>
            <div className="rounded-3xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-950">
              <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400">
                <Wallet className="h-4 w-4 text-amber-500" />
                <span className="text-xs font-medium uppercase tracking-wide">Reputation</span>
              </div>
              <p className="mt-2 text-2xl font-bold text-gray-900 dark:text-gray-100">
                {reputation !== null ? formatCount(reputation) : "—"}
              </p>
            </div>
          </div>

          {composerOpen && !blocked && (
            <div className="mt-5 rounded-[1.75rem] border border-gray-200 bg-gradient-to-br from-white to-violet-50 p-4 dark:border-gray-800 dark:from-gray-950 dark:to-violet-950/20">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">Start a conversation</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Send a quick intro and they will receive it as a message request.
                  </p>
                </div>
              </div>
              <textarea
                value={composerText}
                onChange={(e) => setComposerText(e.target.value)}
                rows={4}
                maxLength={4000}
                placeholder={`Write a message to ${name}...`}
                className="mb-3 w-full resize-none rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm dark:border-gray-700 dark:bg-gray-900"
              />
              <div className="flex flex-col gap-2 sm:flex-row">
                <button
                  type="button"
                  onClick={() => {
                    setComposerOpen(false);
                    setComposerText("");
                  }}
                  className="rounded-full bg-gray-100 px-4 py-2.5 text-sm font-medium text-gray-700 dark:bg-gray-800 dark:text-gray-300"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={composerSending || !composerText.trim()}
                  onClick={() => void sendMessageRequest()}
                  className="inline-flex items-center justify-center gap-2 rounded-full bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
                >
                  {composerSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  Send request
                </button>
              </div>
            </div>
          )}
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.3fr)_minmax(320px,0.9fr)]">
        <div className="space-y-6">
          <div className="rounded-[1.75rem] border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900 sm:p-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Uploads</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400">Academic files shared by {name}.</p>
              </div>
              <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                {loading ? "…" : `${papers.length} total`}
              </span>
            </div>

            {loading ? (
              <LoadingSkeleton />
            ) : papers.length === 0 ? (
              <EmptyState type="no-papers" />
            ) : (
              <>
                <div className="divide-y divide-transparent md:hidden">
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
                      viewCount={p.viewCount}
                      likeCount={p.likeCount}
                      uploaderVerified={p.uploaderVerified ?? isVerified}
                      variant="feed"
                    />
                  ))}
                </div>
                <div className="hidden gap-4 md:grid md:grid-cols-2">
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
                      viewCount={p.viewCount}
                      likeCount={p.likeCount}
                      uploaderVerified={p.uploaderVerified ?? isVerified}
                    />
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-[1.75rem] border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900 sm:p-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">About</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400">Quick profile snapshot.</p>
              </div>
            </div>
            <div className="space-y-3">
              <div className="rounded-2xl bg-gray-50 p-3 dark:bg-gray-950">
                <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">Status</p>
                <p className="mt-1 text-sm font-medium text-gray-900 dark:text-gray-100">
                  {isVerified ? "Verified student" : "Community member"}
                </p>
              </div>
              <div className="rounded-2xl bg-gray-50 p-3 dark:bg-gray-950">
                <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">Program</p>
                <p className="mt-1 text-sm font-medium text-gray-900 dark:text-gray-100">{program || "Not added yet"}</p>
              </div>
              <div className="rounded-2xl bg-gray-50 p-3 dark:bg-gray-950">
                <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">Content</p>
                <p className="mt-1 text-sm font-medium text-gray-900 dark:text-gray-100">
                  {posts.length} post{posts.length === 1 ? "" : "s"} and {papers.length} upload{papers.length === 1 ? "" : "s"}
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-[1.75rem] border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900 sm:p-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Feed</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400">Recent updates from {name}.</p>
              </div>
              <span className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-3 py-1 text-xs font-medium text-violet-700 dark:bg-violet-950/30 dark:text-violet-300">
                <FileText className="h-3.5 w-3.5" />
                {posts.length} post{posts.length === 1 ? "" : "s"}
              </span>
            </div>

            {postsLoading ? (
              <LoadingSkeleton />
            ) : posts.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-gray-200 px-4 py-10 text-center dark:border-gray-800">
                <p className="text-sm text-gray-500 dark:text-gray-400">No posts yet.</p>
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
        </div>
      </section>
    </div>
  );
}
