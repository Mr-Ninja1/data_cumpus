"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Flag, Loader2, MessageCircle, Reply, Send, Trash2, EyeOff, X, ChevronDown } from "lucide-react";
import { supabase } from "@/utils/supabaseClient";
import { useProfile } from "@/hooks/useProfile";
import { showToast } from "@/utils/toast";
import { openVerifyPrompt } from "@/utils/verificationGate";
import ReportModal from "@/components/ReportModal";
import VerifiedBadge from "@/components/VerifiedBadge";

export type CommentRow = {
  id: string;
  paper_id: string;
  user_id: string;
  body: string;
  parent_id: string | null;
  is_hidden: boolean;
  created_at: string;
  author_name?: string;
  author_role?: string | null;
  author_verified?: boolean | null;
  replies?: CommentRow[];
};

type Props = {
  paperId: string;
  paperTitle?: string;
};

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

function nestComments(rows: CommentRow[]): CommentRow[] {
  const byId = new Map<string, CommentRow>();
  for (const r of rows) {
    byId.set(r.id, { ...r, replies: [] });
  }

  const roots: CommentRow[] = [];
  for (const r of rows) {
    const node = byId.get(r.id)!;
    if (r.parent_id && byId.has(r.parent_id)) {
      // Flatten deeper nests under the top-level parent (YouTube-style)
      let top = byId.get(r.parent_id)!;
      while (top.parent_id && byId.has(top.parent_id)) {
        top = byId.get(top.parent_id)!;
      }
      if (!top.parent_id) {
        top.replies = top.replies || [];
        top.replies.push(node);
      } else {
        roots.push(node);
      }
    } else if (!r.parent_id) {
      roots.push(node);
    } else {
      // orphan reply — show as root
      roots.push(node);
    }
  }

  for (const root of roots) {
    root.replies?.sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );
  }
  return roots;
}

export default function CommentsSection({ paperId, paperTitle }: Props) {
  const { userId, isStaff, canUseSocialFeatures } = useProfile();
  const [comments, setComments] = useState<CommentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [body, setBody] = useState("");
  const [posting, setPosting] = useState(false);
  const [replyTo, setReplyTo] = useState<CommentRow | null>(null);
  const [replyBody, setReplyBody] = useState("");
  const [replyPosting, setReplyPosting] = useState(false);
  const [reportCommentId, setReportCommentId] = useState<string | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    if (!mobileOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [mobileOpen]);

  const attachNames = async (rows: CommentRow[]): Promise<CommentRow[]> => {
    const userIds = [...new Set(rows.map((r) => r.user_id))];
    const nameMap: Record<string, string> = {};
    const roleMap: Record<string, string | null> = {};
    const verifiedMap: Record<string, boolean | null> = {};
    if (userIds.length) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, display_name, role, is_verified")
        .in("id", userIds);
      for (const p of profiles || []) {
        nameMap[p.id] = p.display_name || "Student";
        roleMap[p.id] = p.role ?? null;
        verifiedMap[p.id] = p.is_verified ?? null;
      }
    }
    return rows.map((r) => ({
      ...r,
      author_name: nameMap[r.user_id] || "Student",
      author_role: roleMap[r.user_id] ?? null,
      author_verified: verifiedMap[r.user_id] ?? null,
    }));
  };

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("comments")
      .select("id, paper_id, user_id, body, parent_id, is_hidden, created_at")
      .eq("paper_id", paperId)
      .order("created_at", { ascending: false })
      .limit(120);

    if (error) {
      console.warn(error.message);
      setComments([]);
      setLoading(false);
      return;
    }

    const named = await attachNames((data || []) as CommentRow[]);
    setComments(nestComments(named));
    setLoading(false);
  }, [paperId]);

  useEffect(() => {
    void load();
  }, [load]);

  const notifyComment = async (commentId: string) => {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) return;
    void fetch("/api/social/comment-notify", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ paperId, commentId }),
    });
  };

  const postComment = async () => {
    const trimmed = body.trim();
    if (!trimmed) return;
    if (!userId) {
      showToast("info", "Sign in to comment");
      await supabase.auth.signInWithOAuth({ provider: "google" });
      return;
    }
    if (!canUseSocialFeatures) {
      showToast("info", "Verify your student status to comment");
      openVerifyPrompt("comment");
      return;
    }

    setPosting(true);
    try {
      const { data, error } = await supabase
        .from("comments")
        .insert({ paper_id: paperId, user_id: userId, body: trimmed })
        .select("id, paper_id, user_id, body, parent_id, is_hidden, created_at")
        .single();

      if (error) throw error;

      setBody("");
      const row: CommentRow = { ...(data as CommentRow), author_name: "You", replies: [] };
      setComments((prev) => [row, ...prev]);
      showToast("success", "Comment posted");
      if (data?.id) void notifyComment(data.id);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Could not post comment";
      showToast("error", msg.includes("comments") ? "Run wave_c migration in Supabase first" : msg);
    } finally {
      setPosting(false);
    }
  };

  const postReply = async () => {
    const trimmed = replyBody.trim();
    if (!trimmed || !replyTo) return;
    if (!userId) {
      showToast("info", "Sign in to reply");
      await supabase.auth.signInWithOAuth({ provider: "google" });
      return;
    }
    if (!canUseSocialFeatures) {
      showToast("info", "Verify your student status to comment");
      openVerifyPrompt("comment");
      return;
    }

    // Always attach to top-level thread root
    const parentId = replyTo.parent_id || replyTo.id;

    setReplyPosting(true);
    try {
      const { data, error } = await supabase
        .from("comments")
        .insert({
          paper_id: paperId,
          user_id: userId,
          body: trimmed,
          parent_id: parentId,
        })
        .select("id, paper_id, user_id, body, parent_id, is_hidden, created_at")
        .single();

      if (error) throw error;

      const row: CommentRow = { ...(data as CommentRow), author_name: "You" };
      setComments((prev) =>
        prev.map((c) => {
          if (c.id !== parentId) return c;
          return { ...c, replies: [...(c.replies || []), row] };
        })
      );
      setReplyBody("");
      setReplyTo(null);
      showToast("success", "Reply posted");
      if (data?.id) void notifyComment(data.id);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Could not post reply";
      showToast("error", msg);
    } finally {
      setReplyPosting(false);
    }
  };

  const removeFromTree = (list: CommentRow[], commentId: string): CommentRow[] =>
    list
      .filter((c) => c.id !== commentId)
      .map((c) => ({
        ...c,
        replies: c.replies ? removeFromTree(c.replies, commentId) : [],
      }));

  const deleteOwn = async (commentId: string) => {
    const { error } = await supabase.from("comments").delete().eq("id", commentId);
    if (error) {
      showToast("error", error.message);
      return;
    }
    setComments((prev) => removeFromTree(prev, commentId));
    showToast("success", "Comment removed");
  };

  const modAction = async (commentId: string, action: "hide" | "delete") => {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) return;

    const res = await fetch(`/api/admin/comments/${commentId}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ action }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      showToast("error", json.error || "Action failed");
      return;
    }
    setComments((prev) => removeFromTree(prev, commentId));
    showToast("success", action === "delete" ? "Comment deleted" : "Comment hidden");
  };

  const totalCount = comments.reduce((n, c) => n + 1 + (c.replies?.length || 0), 0);

  const renderActions = (c: CommentRow, isReply = false) => (
    <div className="flex items-center gap-3 mt-1.5">
      {!isReply && (
        <button
          type="button"
          onClick={() => {
            setReplyTo(c);
            setReplyBody("");
          }}
          className="text-xs text-gray-500 hover:text-indigo-600 inline-flex items-center gap-1"
        >
          <Reply className="w-3 h-3" /> Reply
        </button>
      )}
      {isReply && (
        <button
          type="button"
          onClick={() => {
            setReplyTo(c);
            setReplyBody(`@${c.author_name || "Student"} `);
          }}
          className="text-xs text-gray-500 hover:text-indigo-600 inline-flex items-center gap-1"
        >
          <Reply className="w-3 h-3" /> Reply
        </button>
      )}
      {userId === c.user_id && (
        <button
          type="button"
          onClick={() => void deleteOwn(c.id)}
          className="text-xs text-gray-500 hover:text-red-600 inline-flex items-center gap-1"
        >
          <Trash2 className="w-3 h-3" /> Delete
        </button>
      )}
      {userId && userId !== c.user_id && (
        <button
          type="button"
          onClick={() => setReportCommentId(c.id)}
          className="text-xs text-gray-500 hover:text-amber-600 inline-flex items-center gap-1"
        >
          <Flag className="w-3 h-3" /> Report
        </button>
      )}
      {isStaff && (
        <button
          type="button"
          onClick={() => void modAction(c.id, "hide")}
          className="text-xs text-gray-500 hover:text-amber-600 inline-flex items-center gap-1"
        >
          <EyeOff className="w-3 h-3" /> Hide
        </button>
      )}
    </div>
  );

  const renderReplyBox = (anchorId: string) => {
    if (!replyTo) return null;
    const anchor = replyTo.parent_id || replyTo.id;
    if (anchor !== anchorId && replyTo.id !== anchorId) return null;

    return (
      <div className="mt-3 flex gap-2">
        <input
          type="text"
          autoFocus
          value={replyBody}
          onChange={(e) => setReplyBody(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !replyPosting && void postReply()}
          placeholder={`Reply to ${replyTo.author_name || "comment"}…`}
          maxLength={2000}
          className="flex-1 px-3 py-2 rounded-full border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
        <button
          type="button"
          disabled={replyPosting || !replyBody.trim()}
          onClick={() => void postReply()}
          className="p-2 rounded-full bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-50"
          aria-label="Post reply"
        >
          {replyPosting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        </button>
        <button
          type="button"
          onClick={() => {
            setReplyTo(null);
            setReplyBody("");
          }}
          className="px-3 text-xs text-gray-500 hover:text-gray-800 dark:hover:text-gray-200"
        >
          Cancel
        </button>
      </div>
    );
  };

  const top = comments[0];

  const composer = (
    <>
      {userId && !canUseSocialFeatures && (
        <button
          type="button"
          onClick={() => openVerifyPrompt("comment")}
          className="mb-4 w-full rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-left text-sm text-sky-900 transition hover:bg-sky-100 dark:border-sky-900/50 dark:bg-sky-950/40 dark:text-sky-100 dark:hover:bg-sky-950/60"
        >
          <span className="font-semibold">Verify your student status</span>
          <span className="mt-0.5 block text-xs opacity-80">
            Comments are unlocked after you verify with your ZICTC ID.
          </span>
        </button>
      )}

      <div className="mb-6 flex gap-2">
        <input
          type="text"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !posting && void postComment()}
          placeholder={
            !userId
              ? "Sign in to comment"
              : !canUseSocialFeatures
                ? "Verify to comment…"
                : "Add a comment…"
          }
          maxLength={2000}
          className="flex-1 rounded-full border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-gray-700 dark:bg-gray-900"
        />
        <button
          type="button"
          disabled={posting || !body.trim()}
          onClick={() => void postComment()}
          className="rounded-full bg-indigo-600 p-2.5 text-white hover:bg-indigo-700 disabled:opacity-50"
          aria-label="Post comment"
        >
          {posting ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
        </button>
      </div>
    </>
  );

  const list = loading ? (
    <div className="py-8 text-center text-sm text-gray-500">Loading comments…</div>
  ) : comments.length === 0 ? (
    <p className="py-4 text-sm text-gray-500 dark:text-gray-400">
      No comments yet. Be the first to discuss{paperTitle ? ` “${paperTitle}”` : ""}.
    </p>
  ) : (
    <ul className="space-y-4">
      {comments.map((c) => (
        <li key={c.id} className="flex gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-xs font-bold text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300">
            {(c.author_name || "?")[0]?.toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center text-sm font-semibold text-gray-900 dark:text-gray-100">
                {c.author_name}
                <VerifiedBadge role={c.author_role} isVerified={c.author_verified} size="xs" className="ml-0.5" />
              </span>
              <span className="text-xs text-gray-400">{relativeTime(c.created_at)}</span>
              {c.is_hidden && isStaff && (
                <span className="text-[10px] uppercase tracking-wide text-amber-600">hidden</span>
              )}
            </div>
            <p className="mt-0.5 break-words whitespace-pre-wrap text-sm text-gray-800 dark:text-gray-200">
              {c.body}
            </p>
            {renderActions(c, false)}
            {renderReplyBox(c.id)}

            {(c.replies?.length ?? 0) > 0 && (
              <ul className="mt-3 space-y-3 border-l-2 border-gray-100 pl-3 dark:border-gray-800">
                {c.replies!.map((r) => (
                  <li key={r.id} className="flex gap-2.5">
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gray-100 text-[10px] font-bold text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                      {(r.author_name || "?")[0]?.toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="inline-flex items-center text-sm font-semibold text-gray-900 dark:text-gray-100">
                          {r.author_name}
                          <VerifiedBadge role={r.author_role} isVerified={r.author_verified} size="xs" className="ml-0.5" />
                        </span>
                        <span className="text-xs text-gray-400">{relativeTime(r.created_at)}</span>
                      </div>
                      <p className="mt-0.5 break-words whitespace-pre-wrap text-sm text-gray-800 dark:text-gray-200">
                        {r.body}
                      </p>
                      {renderActions(r, true)}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </li>
      ))}
    </ul>
  );

  return (
    <section className="bg-transparent">
      {/* Mobile: YouTube-style teaser under description — opens sheet (not below Up next) */}
      <div className="md:hidden">
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          className="mt-3 w-full rounded-xl bg-gray-100 px-3 py-3 text-left transition-colors active:bg-gray-200 dark:bg-gray-900 dark:active:bg-gray-800"
        >
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-sm font-semibold text-gray-900 dark:text-gray-50">
              Comments {loading ? "" : totalCount > 0 ? totalCount : ""}
            </span>
            <ChevronDown size={18} className="text-gray-500" />
          </div>
          {loading ? (
            <p className="text-sm text-gray-500">Loading…</p>
          ) : top ? (
            <div className="flex items-start gap-2">
              <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-[10px] font-bold text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300">
                {(top.author_name || "?")[0]?.toUpperCase()}
              </div>
              <p className="line-clamp-2 text-sm text-gray-700 dark:text-gray-300">
                <span className="font-medium text-gray-900 dark:text-gray-100">
                  {top.author_name}
                </span>{" "}
                {top.body}
              </p>
            </div>
          ) : (
            <p className="text-sm text-gray-500 dark:text-gray-400">Tap to add a comment</p>
          )}
        </button>

        {mobileOpen && (
          <div className="fixed inset-0 z-[70] flex flex-col justify-end md:hidden">
            <button
              type="button"
              className="absolute inset-0 bg-black/50"
              aria-label="Close comments"
              onClick={() => setMobileOpen(false)}
            />
            <div className="relative z-10 flex max-h-[85vh] flex-col rounded-t-2xl bg-white pb-[env(safe-area-inset-bottom)] dark:bg-gray-950">
              <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3 dark:border-gray-900">
                <h3 className="text-base font-semibold text-gray-900 dark:text-gray-50">
                  Comments {totalCount > 0 ? totalCount : ""}
                </h3>
                <button
                  type="button"
                  onClick={() => setMobileOpen(false)}
                  className="rounded-full p-2 active:bg-gray-100 dark:active:bg-gray-800"
                  aria-label="Close"
                >
                  <X size={20} />
                </button>
              </div>
              <div className="overflow-y-auto px-4 py-3">
                {composer}
                {list}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Desktop: full comments under player */}
      <div className="hidden py-4 md:block">
        <div className="mb-4 flex items-center gap-2">
          <MessageCircle className="h-5 w-5 text-gray-700 dark:text-gray-300" />
          <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">
            Comments {totalCount > 0 ? `(${totalCount})` : ""}
          </h3>
        </div>
        {composer}
        {list}
      </div>

      {reportCommentId && (
        <ReportModal commentId={reportCommentId} onClose={() => setReportCommentId(null)} />
      )}
    </section>
  );
}
