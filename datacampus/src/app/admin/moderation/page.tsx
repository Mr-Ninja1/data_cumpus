"use client";

import React, { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Check,
  X,
  ExternalLink,
  Eye,
  EyeOff,
  Trash2,
  CheckCircle2,
} from "lucide-react";
import { supabase } from "@/utils/supabaseClient";
import { showToast } from "@/utils/toast";

/* ----------------------------- Types ----------------------------- */

type PendingStatus = "pending" | "approved" | "rejected";

interface PendingItem {
  id: string;
  school: string;
  program: string;
  type: string;
  title: string;
  file_path: string | null;
  stored_file_id: string | null;
  file_url: string;
  uploader_id: string | null;
  status: PendingStatus;
  note: string | null;
  reviewed_at: string | null;
  reviewed_by: string | null;
  created_at: string;
  uploader_name: string | null;
}

type ReportStatus = "open" | "resolved" | "dismissed";

interface ReportItem {
  id: string;
  reporter_id: string | null;
  paper_id: string | null;
  comment_id: string | null;
  reason: string;
  details: string | null;
  status: ReportStatus;
  reviewed_at: string | null;
  reviewed_by: string | null;
  created_at: string;
  reporter_name: string | null;
  paper_title: string | null;
  comment_body: string | null;
}

interface CommentItem {
  id: string;
  paper_id: string;
  user_id: string;
  body: string;
  parent_id: string | null;
  is_hidden: boolean;
  created_at: string;
  paper_title: string | null;
  author_name: string | null;
  open_report_count: number;
}

type TabKey = "pending" | "reports" | "comments";

const TAB_DEFS: { key: TabKey; label: string }[] = [
  { key: "pending", label: "Pending uploads" },
  { key: "reports", label: "Reports" },
  { key: "comments", label: "Comments" },
];

/* --------------------------- Helpers --------------------------- */

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}

async function getAuthToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token || null;
}

async function authFetch(path: string, init?: RequestInit): Promise<any | null> {
  const token = await getAuthToken();
  if (!token) {
    showToast("error", "Your session expired — please sign in again.");
    return null;
  }
  let res: Response;
  try {
    res = await fetch(path, {
      ...init,
      headers: {
        ...(init?.headers || {}),
        Authorization: `Bearer ${token}`,
      },
    });
  } catch {
    showToast("error", "Network error — please try again.");
    return null;
  }
  if (res.status === 401 || res.status === 403) {
    showToast("error", "You don't have permission to do that.");
    return null;
  }
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    showToast("error", json?.error || "Something went wrong.");
    return null;
  }
  return json;
}

/* --------------------------- Shared bits --------------------------- */

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    pending: "bg-amber-500/15 text-amber-300",
    approved: "bg-emerald-500/15 text-emerald-300",
    resolved: "bg-emerald-500/15 text-emerald-300",
    rejected: "bg-slate-600/30 text-slate-300",
    dismissed: "bg-slate-600/30 text-slate-300",
    open: "bg-rose-500/15 text-rose-300",
  };
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold capitalize ${
        styles[status] || "bg-slate-600/30 text-slate-300"
      }`}
    >
      {status}
    </span>
  );
}

function SkeletonList() {
  return (
    <div className="w-full space-y-3">
      {[...Array(4)].map((_, i) => (
        <div key={i} className="w-full rounded-2xl border border-white/5 bg-slate-900/50 p-5">
          <div className="h-4 w-1/3 rounded bg-white/5 animate-pulse mb-3" />
          <div className="h-3 w-2/3 rounded bg-white/5 animate-pulse mb-2" />
          <div className="h-3 w-1/2 rounded bg-white/5 animate-pulse" />
        </div>
      ))}
    </div>
  );
}

function EmptyQueueState({ message }: { message?: string }) {
  return (
    <div className="w-full flex flex-col items-center justify-center py-16 text-center">
      <CheckCircle2 className="w-12 h-12 mb-4 text-slate-600" />
      <p className="text-slate-400 text-sm">{message || "Queue is clear — nice work."}</p>
    </div>
  );
}

function SegmentedToggle<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <div className="inline-flex rounded-lg border border-white/10 bg-slate-900/60 p-0.5">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
            value === opt.value ? "bg-white/10 text-white" : "text-slate-400 hover:text-slate-200"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

/* --------------------------- Pending tab --------------------------- */

function PendingCard({
  item,
  onAction,
}: {
  item: PendingItem;
  onAction: (id: string, action: "approve" | "reject", note?: string) => Promise<void>;
}) {
  const [pendingAction, setPendingAction] = useState<"approve" | "reject" | null>(null);
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (!pendingAction) return;
    setSubmitting(true);
    await onAction(item.id, pendingAction, note.trim() || undefined);
    setSubmitting(false);
  };

  return (
    <div className="w-full rounded-2xl border border-white/5 bg-slate-900/50 hover:border-white/10 hover:bg-slate-900/80 transition-colors p-4 sm:p-5">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 mb-1.5">
            <StatusBadge status={item.status} />
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-white/5 text-slate-300 border border-white/10 capitalize">
              {item.type}
            </span>
          </div>
          <h3 className="text-white font-semibold leading-snug break-words">{item.title}</h3>
          <p className="text-sm text-slate-400 mt-0.5 break-words">
            {item.school} · {item.program}
          </p>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-xs text-slate-500">
            <span>Uploaded by {item.uploader_name || "Unknown"}</span>
            <span>{formatDate(item.created_at)}</span>
            {item.file_url && (
              <a
                href={item.file_url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-cyan-400 hover:text-cyan-300"
              >
                <ExternalLink className="w-3 h-3" /> View file
              </a>
            )}
          </div>
          {item.note && <p className="mt-2 text-xs text-slate-400 italic break-words">Note: {item.note}</p>}
        </div>

        {item.status === "pending" && (
          <div className="flex sm:flex-col gap-2 w-full sm:w-auto shrink-0">
            <button
              type="button"
              onClick={() => setPendingAction(pendingAction === "approve" ? null : "approve")}
              className="flex-1 sm:flex-none rounded-lg bg-gradient-to-r from-emerald-500 to-teal-500 text-white font-semibold px-4 py-2 hover:opacity-90 text-sm inline-flex items-center justify-center gap-1.5"
            >
              <Check className="w-4 h-4" /> Approve
            </button>
            <button
              type="button"
              onClick={() => setPendingAction(pendingAction === "reject" ? null : "reject")}
              className="flex-1 sm:flex-none rounded-lg bg-rose-600 hover:bg-rose-700 text-white px-4 py-2 text-sm font-semibold inline-flex items-center justify-center gap-1.5"
            >
              <X className="w-4 h-4" /> Reject
            </button>
          </div>
        )}
      </div>

      {pendingAction && (
        <div className="mt-4 pt-4 border-t border-white/5 w-full">
          <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1.5">
            Note (optional)
          </label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            placeholder={pendingAction === "approve" ? "Add a note for this approval…" : "Reason for rejection…"}
            className="w-full rounded-lg border border-white/10 bg-slate-900/60 text-slate-100 placeholder:text-slate-500 px-3 py-2 focus:outline-none focus:ring-1 focus:ring-cyan-500 text-sm"
          />
          <div className="flex flex-wrap gap-2 mt-2">
            <button
              type="button"
              disabled={submitting}
              onClick={submit}
              className={`rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-60 ${
                pendingAction === "approve"
                  ? "bg-gradient-to-r from-emerald-500 to-teal-500 hover:opacity-90"
                  : "bg-rose-600 hover:bg-rose-700"
              }`}
            >
              {submitting ? "Submitting…" : pendingAction === "approve" ? "Confirm approve" : "Confirm reject"}
            </button>
            <button
              type="button"
              onClick={() => {
                setPendingAction(null);
                setNote("");
              }}
              className="rounded-lg border border-white/10 bg-white/5 text-slate-200 hover:bg-white/10 px-4 py-2 text-sm font-medium"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* --------------------------- Reports tab --------------------------- */

function ReportCard({
  item,
  onAction,
}: {
  item: ReportItem;
  onAction: (id: string, action: "resolve" | "dismiss", note?: string) => Promise<void>;
}) {
  const [pendingAction, setPendingAction] = useState<"resolve" | "dismiss" | null>(null);
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const isPaperReport = !!item.paper_id;

  const submit = async () => {
    if (!pendingAction) return;
    setSubmitting(true);
    await onAction(item.id, pendingAction, note.trim() || undefined);
    setSubmitting(false);
  };

  return (
    <div className="w-full rounded-2xl border border-white/5 bg-slate-900/50 hover:border-white/10 hover:bg-slate-900/80 transition-colors p-4 sm:p-5">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 mb-1.5">
            <StatusBadge status={item.status} />
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-white/5 text-slate-300 border border-white/10">
              {isPaperReport ? "Paper" : "Comment"}
            </span>
          </div>
          <h3 className="text-white font-semibold leading-snug break-words">{item.reason}</h3>
          {isPaperReport ? (
            <p className="text-sm text-slate-300 mt-1 break-words">Re: {item.paper_title || "Unknown paper"}</p>
          ) : (
            <blockquote className="text-sm text-slate-300 mt-1 border-l-2 border-white/10 pl-3 italic break-words">
              “{item.comment_body || "Comment removed"}”
            </blockquote>
          )}
          {item.details && <p className="text-sm text-slate-400 mt-2 break-words">{item.details}</p>}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-xs text-slate-500">
            <span>Reported by {item.reporter_name || "Unknown"}</span>
            <span>{formatDate(item.created_at)}</span>
          </div>
        </div>

        {item.status === "open" && (
          <div className="flex sm:flex-col gap-2 w-full sm:w-auto shrink-0">
            <button
              type="button"
              onClick={() => setPendingAction(pendingAction === "resolve" ? null : "resolve")}
              className="flex-1 sm:flex-none rounded-lg bg-gradient-to-r from-emerald-500 to-teal-500 text-white font-semibold px-4 py-2 hover:opacity-90 text-sm inline-flex items-center justify-center gap-1.5"
            >
              <Check className="w-4 h-4" /> Resolve
            </button>
            <button
              type="button"
              onClick={() => setPendingAction(pendingAction === "dismiss" ? null : "dismiss")}
              className="flex-1 sm:flex-none rounded-lg border border-white/10 bg-white/5 text-slate-200 hover:bg-white/10 px-4 py-2 text-sm font-semibold inline-flex items-center justify-center gap-1.5"
            >
              <X className="w-4 h-4" /> Dismiss
            </button>
          </div>
        )}
      </div>

      {pendingAction && (
        <div className="mt-4 pt-4 border-t border-white/5 w-full">
          <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1.5">
            Note (optional)
          </label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            placeholder="Add an internal note…"
            className="w-full rounded-lg border border-white/10 bg-slate-900/60 text-slate-100 placeholder:text-slate-500 px-3 py-2 focus:outline-none focus:ring-1 focus:ring-cyan-500 text-sm"
          />
          <div className="flex flex-wrap gap-2 mt-2">
            <button
              type="button"
              disabled={submitting}
              onClick={submit}
              className={`rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-60 ${
                pendingAction === "resolve"
                  ? "bg-gradient-to-r from-emerald-500 to-teal-500 text-white hover:opacity-90"
                  : "border border-white/10 bg-white/5 text-slate-200 hover:bg-white/10"
              }`}
            >
              {submitting ? "Submitting…" : pendingAction === "resolve" ? "Confirm resolve" : "Confirm dismiss"}
            </button>
            <button
              type="button"
              onClick={() => {
                setPendingAction(null);
                setNote("");
              }}
              className="rounded-lg border border-white/10 bg-white/5 text-slate-200 hover:bg-white/10 px-4 py-2 text-sm font-medium"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* --------------------------- Comments tab --------------------------- */

function CommentCard({
  item,
  onAction,
}: {
  item: CommentItem;
  onAction: (id: string, action: "hide" | "unhide" | "delete") => Promise<void>;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState<"hide" | "unhide" | "delete" | null>(null);

  const run = async (action: "hide" | "unhide" | "delete") => {
    setBusy(action);
    await onAction(item.id, action);
    setBusy(null);
    if (action === "delete") setConfirmDelete(false);
  };

  return (
    <div className="w-full rounded-2xl border border-white/5 bg-slate-900/50 hover:border-white/10 hover:bg-slate-900/80 transition-colors p-4 sm:p-5">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 mb-1.5">
            <span
              className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                item.is_hidden ? "bg-slate-600/30 text-slate-300" : "bg-emerald-500/15 text-emerald-300"
              }`}
            >
              {item.is_hidden ? "Hidden" : "Visible"}
            </span>
            {item.open_report_count > 0 && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-rose-500/15 text-rose-300">
                {item.open_report_count} open report{item.open_report_count === 1 ? "" : "s"}
              </span>
            )}
          </div>
          <p className="text-sm text-slate-200 break-words whitespace-pre-wrap">{item.body}</p>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-xs text-slate-500">
            <span>{item.author_name || "Unknown"}</span>
            <span>on {item.paper_title || "Unknown paper"}</span>
            <span>{formatDate(item.created_at)}</span>
          </div>
        </div>

        <div className="flex sm:flex-col gap-2 w-full sm:w-auto shrink-0">
          {item.is_hidden ? (
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => run("unhide")}
              className="flex-1 sm:flex-none rounded-lg bg-gradient-to-r from-emerald-500 to-teal-500 text-white font-semibold px-4 py-2 hover:opacity-90 text-sm inline-flex items-center justify-center gap-1.5 disabled:opacity-60"
            >
              <Eye className="w-4 h-4" /> Unhide
            </button>
          ) : (
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => run("hide")}
              className="flex-1 sm:flex-none rounded-lg border border-white/10 bg-white/5 text-slate-200 hover:bg-white/10 px-4 py-2 text-sm font-semibold inline-flex items-center justify-center gap-1.5 disabled:opacity-60"
            >
              <EyeOff className="w-4 h-4" /> Hide
            </button>
          )}

          {!confirmDelete ? (
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => setConfirmDelete(true)}
              className="flex-1 sm:flex-none rounded-lg bg-rose-600 hover:bg-rose-700 text-white px-4 py-2 text-sm font-semibold inline-flex items-center justify-center gap-1.5 disabled:opacity-60"
            >
              <Trash2 className="w-4 h-4" /> Delete
            </button>
          ) : (
            <div className="flex gap-2 w-full">
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => run("delete")}
                className="flex-1 rounded-lg bg-rose-600 hover:bg-rose-700 text-white px-4 py-2 text-sm font-semibold disabled:opacity-60"
              >
                {busy === "delete" ? "Deleting…" : "Confirm?"}
              </button>
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                className="rounded-lg border border-white/10 bg-white/5 text-slate-200 hover:bg-white/10 px-3 py-2 text-sm font-medium"
                aria-label="Cancel delete"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* --------------------------- Main page --------------------------- */

function ModerationPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const validTab = (t: string | null): TabKey =>
    TAB_DEFS.some((td) => td.key === t) ? (t as TabKey) : "pending";

  const [activeTab, setActiveTab] = useState<TabKey>(validTab(searchParams.get("tab")));

  useEffect(() => {
    setActiveTab(validTab(searchParams.get("tab")));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const selectTab = (tab: TabKey) => {
    setActiveTab(tab);
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", tab);
    router.replace(`/admin/moderation?${params.toString()}`, { scroll: false });
  };

  // Pending uploads state
  const [pendingItems, setPendingItems] = useState<PendingItem[]>([]);
  const [pendingLoading, setPendingLoading] = useState(true);
  const [pendingStatusFilter, setPendingStatusFilter] = useState<"pending" | "approved" | "rejected" | "all">(
    "pending"
  );
  const [pendingBadge, setPendingBadge] = useState<number | null>(null);

  // Reports state
  const [reportItems, setReportItems] = useState<ReportItem[]>([]);
  const [reportsLoading, setReportsLoading] = useState(true);
  const [reportStatusFilter, setReportStatusFilter] = useState<"open" | "resolved" | "dismissed" | "all">("open");
  const [reportsBadge, setReportsBadge] = useState<number | null>(null);

  // Comments state
  const [commentItems, setCommentItems] = useState<CommentItem[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(true);
  const [commentsScope, setCommentsScope] = useState<"flagged" | "all">("flagged");
  const [commentsBadge, setCommentsBadge] = useState<number | null>(null);

  const loadPending = useCallback(async (status: string) => {
    setPendingLoading(true);
    const json = await authFetch(`/api/admin/pending?status=${status}&limit=50`);
    if (json) {
      setPendingItems(json.pending || []);
      if (status === "pending") setPendingBadge((json.pending || []).length);
    }
    setPendingLoading(false);
  }, []);

  const loadReports = useCallback(async (status: string) => {
    setReportsLoading(true);
    const json = await authFetch(`/api/admin/reports?status=${status}&limit=50`);
    if (json) {
      setReportItems(json.reports || []);
      if (status === "open") setReportsBadge((json.reports || []).length);
    }
    setReportsLoading(false);
  }, []);

  const loadComments = useCallback(async (scope: string) => {
    setCommentsLoading(true);
    const json = await authFetch(`/api/admin/comments?scope=${scope}&limit=50`);
    if (json) {
      setCommentItems(json.comments || []);
      if (scope === "flagged") setCommentsBadge((json.comments || []).length);
    }
    setCommentsLoading(false);
  }, []);

  useEffect(() => {
    loadPending(pendingStatusFilter);
  }, [pendingStatusFilter, loadPending]);

  useEffect(() => {
    loadReports(reportStatusFilter);
  }, [reportStatusFilter, loadReports]);

  useEffect(() => {
    loadComments(commentsScope);
  }, [commentsScope, loadComments]);

  const handlePendingAction = async (id: string, action: "approve" | "reject", note?: string) => {
    const json = await authFetch(`/api/admin/pending/${id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, note }),
    });
    if (json?.ok) {
      setPendingItems((prev) => prev.filter((p) => p.id !== id));
      setPendingBadge((prev) => (prev !== null ? Math.max(0, prev - 1) : prev));
      showToast("success", `Upload ${json.status}.`);
    }
  };

  const handleReportAction = async (id: string, action: "resolve" | "dismiss", note?: string) => {
    const json = await authFetch(`/api/admin/reports/${id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, note }),
    });
    if (json?.ok) {
      setReportItems((prev) => prev.filter((r) => r.id !== id));
      setReportsBadge((prev) => (prev !== null ? Math.max(0, prev - 1) : prev));
      showToast("success", `Report ${json.status}.`);
    }
  };

  const handleCommentAction = async (id: string, action: "hide" | "unhide" | "delete") => {
    const json = await authFetch(`/api/admin/comments/${id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    if (json?.ok) {
      if (action === "delete") {
        setCommentItems((prev) => prev.filter((c) => c.id !== id));
        setCommentsBadge((prev) => (prev !== null ? Math.max(0, prev - 1) : prev));
        showToast("success", "Comment deleted.");
      } else {
        setCommentItems((prev) =>
          prev.map((c) => (c.id === id ? { ...c, is_hidden: json.is_hidden ?? action === "hide" } : c))
        );
        showToast("success", action === "hide" ? "Comment hidden." : "Comment unhidden.");
      }
    }
  };

  const badgeFor = (tab: TabKey) =>
    tab === "pending" ? pendingBadge : tab === "reports" ? reportsBadge : commentsBadge;

  return (
    <div className="w-full">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white mb-1">Review queue</h1>
        <p className="text-sm text-slate-400">Approve uploads, resolve reports, and moderate comments.</p>
      </div>

      <div className="w-full flex flex-wrap gap-2 mb-6">
        {TAB_DEFS.map((tab) => {
          const active = activeTab === tab.key;
          const count = badgeFor(tab.key);
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => selectTab(tab.key)}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                active ? "bg-white/10 text-white" : "text-slate-400 hover:text-slate-200 hover:bg-white/5"
              }`}
            >
              {tab.label}
              <span
                className={`inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1.5 rounded-full text-[11px] font-semibold ${
                  count !== null && count > 0 ? "bg-rose-500/20 text-rose-300" : "bg-white/5 text-slate-500"
                }`}
              >
                {count === null ? "…" : count}
              </span>
            </button>
          );
        })}
      </div>

      {activeTab === "pending" && (
        <div className="w-full">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              {pendingItems.length} item{pendingItems.length === 1 ? "" : "s"}
            </span>
            <select
              value={pendingStatusFilter}
              onChange={(e) => setPendingStatusFilter(e.target.value as any)}
              className="rounded-lg border border-white/10 bg-slate-900/60 text-slate-300 text-xs px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-cyan-500"
            >
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
              <option value="all">All</option>
            </select>
          </div>

          {pendingLoading ? (
            <SkeletonList />
          ) : pendingItems.length === 0 ? (
            <EmptyQueueState message="Queue is clear — nice work." />
          ) : (
            <div className="w-full space-y-3">
              {pendingItems.map((item) => (
                <PendingCard key={item.id} item={item} onAction={handlePendingAction} />
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === "reports" && (
        <div className="w-full">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              {reportItems.length} item{reportItems.length === 1 ? "" : "s"}
            </span>
            <select
              value={reportStatusFilter}
              onChange={(e) => setReportStatusFilter(e.target.value as any)}
              className="rounded-lg border border-white/10 bg-slate-900/60 text-slate-300 text-xs px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-cyan-500"
            >
              <option value="open">Open</option>
              <option value="resolved">Resolved</option>
              <option value="dismissed">Dismissed</option>
              <option value="all">All</option>
            </select>
          </div>

          {reportsLoading ? (
            <SkeletonList />
          ) : reportItems.length === 0 ? (
            <EmptyQueueState message="No reports here — queue is clear." />
          ) : (
            <div className="w-full space-y-3">
              {reportItems.map((item) => (
                <ReportCard key={item.id} item={item} onAction={handleReportAction} />
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === "comments" && (
        <div className="w-full">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              {commentItems.length} item{commentItems.length === 1 ? "" : "s"}
            </span>
            <SegmentedToggle
              value={commentsScope}
              onChange={setCommentsScope}
              options={[
                { value: "flagged", label: "Flagged" },
                { value: "all", label: "All" },
              ]}
            />
          </div>

          {commentsLoading ? (
            <SkeletonList />
          ) : commentItems.length === 0 ? (
            <EmptyQueueState message="Nothing to moderate — queue is clear." />
          ) : (
            <div className="w-full space-y-3">
              {commentItems.map((item) => (
                <CommentCard key={item.id} item={item} onAction={handleCommentAction} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function ModerationPage() {
  return (
    <Suspense fallback={<SkeletonList />}>
      <ModerationPageInner />
    </Suspense>
  );
}
