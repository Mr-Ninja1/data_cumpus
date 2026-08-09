"use client";

import React, { useEffect, useState } from "react";
import { Megaphone, Link as LinkIcon, Loader2, Send, CheckCircle2, CircleSlash } from "lucide-react";
import { supabase } from "@/utils/supabaseClient";
import { showToast } from "@/utils/toast";

type Announcement = {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  link: string | null;
  link_label: string | null;
  audience: string;
  ends_at: string | null;
  created_by: string | null;
  is_active: boolean;
  created_at: string;
};

const KINDS: Array<{ value: "banner" | "alert" | "promo"; label: string }> = [
  { value: "banner", label: "Banner" },
  { value: "alert", label: "Alert" },
  { value: "promo", label: "Promo" },
];

function kindBadgeClass(kind: string) {
  switch (kind) {
    case "banner":
      return "bg-indigo-500/15 text-indigo-300";
    case "alert":
      return "bg-amber-500/15 text-amber-300";
    case "promo":
      return "bg-rose-500/15 text-rose-300";
    default:
      return "bg-slate-500/15 text-slate-300";
  }
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function ListSkeleton() {
  return (
    <div className="space-y-3">
      {[...Array(3)].map((_, i) => (
        <div key={i} className="rounded-2xl border border-white/5 bg-slate-900/50 p-4 h-28 animate-pulse" />
      ))}
    </div>
  );
}

export default function AdminBroadcastsPage() {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<"banner" | "alert" | "promo">("banner");
  const [body, setBody] = useState("");
  const [link, setLink] = useState("");
  const [linkLabel, setLinkLabel] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [notifyInbox, setNotifyInbox] = useState(false);

  const getToken = async () => {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token || null;
  };

  const load = async () => {
    setLoading(true);
    try {
      const token = await getToken();
      if (!token) return;
      const res = await fetch("/api/admin/announcements", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 401 || res.status === 403) {
          showToast("error", "You don't have access to broadcasts");
        } else {
          showToast("error", json?.error || "Failed to load broadcasts");
        }
        return;
      }
      setAnnouncements(json.announcements || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const resetForm = () => {
    setTitle("");
    setKind("banner");
    setBody("");
    setLink("");
    setLinkLabel("");
    setEndsAt("");
    setNotifyInbox(false);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      showToast("error", "Title is required");
      return;
    }
    setSubmitting(true);
    try {
      const token = await getToken();
      if (!token) return;
      const res = await fetch("/api/admin/announcements", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          kind,
          body: body.trim() || undefined,
          link: link.trim() || undefined,
          linkLabel: linkLabel.trim() || undefined,
          endsAt: endsAt || undefined,
          notifyInbox,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast("error", json?.error || "Failed to create broadcast");
        return;
      }
      setAnnouncements((prev) => [json.announcement, ...prev]);
      resetForm();
      const notified = json.notified || 0;
      showToast(
        "success",
        notified > 0 ? `Broadcast live — notified ${notified} users` : "Broadcast is live"
      );
    } finally {
      setSubmitting(false);
    }
  };

  const toggleActive = async (a: Announcement) => {
    setTogglingId(a.id);
    const nextActive = !a.is_active;
    setAnnouncements((prev) =>
      prev.map((x) => (x.id === a.id ? { ...x, is_active: nextActive } : x))
    );
    try {
      const token = await getToken();
      if (!token) return;
      const res = await fetch("/api/admin/announcements", {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ id: a.id, isActive: nextActive }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setAnnouncements((prev) =>
          prev.map((x) => (x.id === a.id ? { ...x, is_active: a.is_active } : x))
        );
        showToast("error", json?.error || "Failed to update broadcast");
        return;
      }
      showToast("success", nextActive ? "Broadcast activated" : "Broadcast deactivated");
    } finally {
      setTogglingId(null);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <p className="text-sm text-slate-400 max-w-2xl">
        Publish site-wide banners, alerts, and promos. Toggle them off any time without losing history.
      </p>

      {/* Create form */}
      <form
        onSubmit={submit}
        className="rounded-2xl border border-white/5 bg-slate-900/50 p-5 space-y-4"
      >
        <div className="flex items-center gap-2">
          <Megaphone className="w-4 h-4 text-cyan-300" />
          <h2 className="text-sm font-bold text-white">Create broadcast</h2>
        </div>

        <div>
          <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1.5">
            Title
          </label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={120}
            placeholder="e.g. Scheduled maintenance this weekend"
            className="w-full rounded-lg border border-white/10 bg-slate-900/60 text-slate-100 placeholder:text-slate-500 px-3 py-2 focus:outline-none focus:ring-1 focus:ring-cyan-500"
          />
        </div>

        <div>
          <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1.5">
            Kind
          </label>
          <div className="flex gap-2">
            {KINDS.map((k) => (
              <button
                key={k.value}
                type="button"
                onClick={() => setKind(k.value)}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                  kind === k.value
                    ? kindBadgeClass(k.value) + " ring-1 ring-inset ring-white/10"
                    : "bg-white/5 text-slate-400 hover:bg-white/10"
                }`}
              >
                {k.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1.5">
            Body <span className="text-slate-600">(optional)</span>
          </label>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={3}
            maxLength={1000}
            placeholder="Additional detail shown alongside the title…"
            className="w-full resize-none rounded-lg border border-white/10 bg-slate-900/60 text-slate-100 placeholder:text-slate-500 px-3 py-2 focus:outline-none focus:ring-1 focus:ring-cyan-500"
          />
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1.5">
              Link <span className="text-slate-600">(optional)</span>
            </label>
            <input
              value={link}
              onChange={(e) => setLink(e.target.value)}
              placeholder="/some/path or https://…"
              className="w-full rounded-lg border border-white/10 bg-slate-900/60 text-slate-100 placeholder:text-slate-500 px-3 py-2 focus:outline-none focus:ring-1 focus:ring-cyan-500"
            />
          </div>
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1.5">
              Link label <span className="text-slate-600">(optional)</span>
            </label>
            <input
              value={linkLabel}
              onChange={(e) => setLinkLabel(e.target.value)}
              maxLength={40}
              placeholder="Learn more"
              className="w-full rounded-lg border border-white/10 bg-slate-900/60 text-slate-100 placeholder:text-slate-500 px-3 py-2 focus:outline-none focus:ring-1 focus:ring-cyan-500"
            />
          </div>
        </div>

        <div>
          <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1.5">
            Ends at <span className="text-slate-600">(optional)</span>
          </label>
          <input
            type="date"
            value={endsAt}
            onChange={(e) => setEndsAt(e.target.value)}
            className="rounded-lg border border-white/10 bg-slate-900/60 text-slate-100 placeholder:text-slate-500 px-3 py-2 focus:outline-none focus:ring-1 focus:ring-cyan-500"
          />
        </div>

        <label className="flex items-center gap-2.5 text-sm text-slate-300 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={notifyInbox}
            onChange={(e) => setNotifyInbox(e.target.checked)}
            className="h-4 w-4 rounded border-white/20 bg-slate-900/60 text-cyan-500 focus:ring-cyan-500 focus:ring-offset-0"
          />
          Also notify all users in their inbox
        </label>

        <div className="pt-1">
          <button
            type="submit"
            disabled={submitting || !title.trim()}
            className="rounded-lg bg-gradient-to-r from-violet-600 to-cyan-600 text-white font-semibold px-4 py-2 hover:opacity-90 disabled:opacity-50 inline-flex items-center gap-2"
          >
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            Publish broadcast
          </button>
        </div>
      </form>

      {/* List */}
      <div>
        <h2 className="text-sm font-bold text-white mb-3">Existing broadcasts</h2>
        {loading ? (
          <ListSkeleton />
        ) : announcements.length === 0 ? (
          <div className="rounded-2xl border border-white/5 bg-slate-900/50 flex flex-col items-center justify-center py-16 px-4 text-center">
            <Megaphone className="w-10 h-10 text-slate-600 mb-3" />
            <p className="text-sm text-slate-400">No broadcasts yet</p>
          </div>
        ) : (
          <div className="space-y-3">
            {announcements.map((a) => (
              <div
                key={a.id}
                className={`rounded-2xl border p-4 transition-all ${
                  a.is_active
                    ? "border-white/10 bg-slate-900/80 shadow-lg shadow-violet-900/10"
                    : "border-white/5 bg-slate-900/30 opacity-60"
                }`}
              >
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[11px] font-semibold uppercase tracking-wide ${kindBadgeClass(
                          a.kind
                        )}`}
                      >
                        {a.kind}
                      </span>
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                          a.is_active
                            ? "bg-emerald-500/15 text-emerald-300"
                            : "bg-slate-600/20 text-slate-400"
                        }`}
                      >
                        {a.is_active ? (
                          <CheckCircle2 className="w-3 h-3" />
                        ) : (
                          <CircleSlash className="w-3 h-3" />
                        )}
                        {a.is_active ? "Active" : "Inactive"}
                      </span>
                      <span className="text-[11px] text-slate-500 uppercase tracking-wide">
                        {a.audience}
                      </span>
                    </div>
                    <h3 className="text-sm font-bold text-white">{a.title}</h3>
                    {a.body && (
                      <p className="text-sm text-slate-400 mt-1 line-clamp-2">{a.body}</p>
                    )}
                    <div className="flex items-center gap-3 mt-2 text-[11px] text-slate-500">
                      <span className="font-mono">{formatDate(a.created_at)}</span>
                      {a.ends_at && (
                        <span className="font-mono">Ends {formatDate(a.ends_at)}</span>
                      )}
                      {a.link && (
                        <span className="inline-flex items-center gap-1 text-cyan-400">
                          <LinkIcon className="w-3 h-3" />
                          {a.link_label || a.link}
                        </span>
                      )}
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={togglingId === a.id}
                    onClick={() => void toggleActive(a)}
                    className={
                      a.is_active
                        ? "rounded-lg border border-rose-500/30 text-rose-300 hover:bg-rose-500/10 px-4 py-2 text-sm font-semibold disabled:opacity-50 shrink-0"
                        : "rounded-lg bg-gradient-to-r from-violet-600 to-cyan-600 text-white font-semibold px-4 py-2 hover:opacity-90 disabled:opacity-50 text-sm shrink-0"
                    }
                  >
                    {togglingId === a.id ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : a.is_active ? (
                      "Deactivate"
                    ) : (
                      "Activate"
                    )}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
