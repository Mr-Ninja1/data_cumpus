"use client";

import React, { useEffect, useState } from "react";
import {
  ScrollText,
  ShieldCheck,
  ShieldX,
  Flag,
  Eye,
  EyeOff,
  Trash2,
  Megaphone,
  User,
  MessageSquare,
  Activity,
} from "lucide-react";
import { supabase } from "@/utils/supabaseClient";
import { showToast } from "@/utils/toast";

type AuditEntry = {
  id: string;
  admin_id: string;
  target_user_id: string | null;
  action: string;
  details: unknown;
  created_at: string;
  admin_name: string;
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

const ACTION_META: Record<string, { label: string; icon: any; className: string }> = {
  update_user: { label: "Updated a user", icon: User, className: "bg-violet-500/15 text-violet-300" },
  approve_paper: { label: "Approved a paper", icon: ShieldCheck, className: "bg-emerald-500/15 text-emerald-300" },
  reject_paper: { label: "Rejected a paper", icon: ShieldX, className: "bg-rose-500/15 text-rose-300" },
  report_resolved: { label: "Resolved a report", icon: Flag, className: "bg-emerald-500/15 text-emerald-300" },
  report_dismissed: { label: "Dismissed a report", icon: Flag, className: "bg-slate-500/15 text-slate-300" },
  hide_comment: { label: "Hid a comment", icon: EyeOff, className: "bg-amber-500/15 text-amber-300" },
  unhide_comment: { label: "Unhid a comment", icon: Eye, className: "bg-cyan-500/15 text-cyan-300" },
  delete_comment: { label: "Deleted a comment", icon: Trash2, className: "bg-rose-500/15 text-rose-300" },
  create_announcement: { label: "Created a broadcast", icon: Megaphone, className: "bg-indigo-500/15 text-indigo-300" },
  activate_announcement: { label: "Activated a broadcast", icon: Megaphone, className: "bg-emerald-500/15 text-emerald-300" },
  deactivate_announcement: { label: "Deactivated a broadcast", icon: Megaphone, className: "bg-slate-500/15 text-slate-300" },
  send_staff_message: { label: "Sent a staff message", icon: MessageSquare, className: "bg-cyan-500/15 text-cyan-300" },
};

function actionMeta(action: string) {
  return (
    ACTION_META[action] || {
      label: action.replace(/_/g, " "),
      icon: Activity,
      className: "bg-slate-500/15 text-slate-300",
    }
  );
}

function detailsLine(action: string, details: unknown) {
  if (!details || typeof details !== "object") return null;
  const d = details as Record<string, unknown>;

  if (typeof d.note === "string" && d.note.trim()) {
    return <span className="text-slate-400">&ldquo;{d.note}&rdquo;</span>;
  }

  const idParts: string[] = [];
  if (typeof d.pending_id === "string") idParts.push(`pending:${d.pending_id.slice(0, 8)}`);
  if (typeof d.report_id === "string") idParts.push(`report:${d.report_id.slice(0, 8)}`);
  if (typeof d.comment_id === "string") idParts.push(`comment:${d.comment_id.slice(0, 8)}`);
  if (typeof d.announcement_id === "string") idParts.push(`announcement:${d.announcement_id.slice(0, 8)}`);
  if (typeof d.message_id === "string") idParts.push(`message:${d.message_id.slice(0, 8)}`);
  if (action === "create_announcement") {
    if (typeof d.audience === "string") idParts.push(`audience:${d.audience}`);
    if (typeof d.notified === "number") idParts.push(`notified:${d.notified}`);
  }

  if (idParts.length) {
    return <span className="font-mono text-xs text-slate-500">{idParts.join("  ·  ")}</span>;
  }

  const json = JSON.stringify(d);
  if (json === "{}") return null;
  return (
    <span className="font-mono text-xs text-slate-500">
      {json.length > 140 ? `${json.slice(0, 140)}…` : json}
    </span>
  );
}

function ListSkeleton() {
  return (
    <div className="divide-y divide-white/5">
      {[...Array(10)].map((_, i) => (
        <div key={i} className="p-4 flex items-center gap-3">
          <div className="h-8 w-8 rounded-lg bg-white/5 animate-pulse shrink-0" />
          <div className="flex-1 space-y-2">
            <div className="h-3 w-1/2 rounded bg-white/5 animate-pulse" />
            <div className="h-3 w-1/3 rounded bg-white/5 animate-pulse" />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function AdminAuditPage() {
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) {
        setLoading(false);
        return;
      }
      const res = await fetch("/api/admin/audit", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json().catch(() => ({}));
      if (!mounted) return;
      if (!res.ok) {
        if (res.status === 401 || res.status === 403) {
          showToast("error", "You don't have access to the audit log");
        } else {
          showToast("error", json?.error || "Failed to load audit log");
        }
        setLoading(false);
        return;
      }
      setAudit(json.audit || []);
      setLoading(false);
    })();
    return () => {
      mounted = false;
    };
  }, []);

  return (
    <div className="max-w-4xl">
      <p className="text-sm text-slate-400 mb-6 max-w-2xl">
        A read-only feed of the latest staff actions across moderation, users, and broadcasts.
      </p>

      <div className="rounded-2xl border border-white/5 bg-slate-900/50 overflow-hidden">
        {loading ? (
          <ListSkeleton />
        ) : audit.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
            <ScrollText className="w-10 h-10 text-slate-600 mb-3" />
            <p className="text-sm text-slate-400">No audit history yet</p>
          </div>
        ) : (
          <div className="divide-y divide-white/5">
            {audit.map((entry) => {
              const meta = actionMeta(entry.action);
              const Icon = meta.icon;
              const line = detailsLine(entry.action, entry.details);
              return (
                <div key={entry.id} className="p-4 flex items-start gap-3 hover:bg-white/[0.03] transition-colors">
                  <div className={`h-8 w-8 rounded-lg flex items-center justify-center shrink-0 ${meta.className}`}>
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <p className="text-sm text-slate-200">
                        <span className="font-semibold text-white">{entry.admin_name}</span>{" "}
                        {meta.label.charAt(0).toLowerCase() + meta.label.slice(1)}
                      </p>
                      <span className="font-mono text-xs text-slate-500 tabular-nums shrink-0">
                        {relativeTime(entry.created_at)}
                      </span>
                    </div>
                    {line && <div className="mt-1">{line}</div>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
