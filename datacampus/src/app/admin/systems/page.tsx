"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, MessageSquare, Wrench } from "lucide-react";
import { supabase } from "@/utils/supabaseClient";
import { showToast } from "@/utils/toast";

type AdminRequest = {
  id: string;
  user_id: string;
  student_name: string;
  title: string;
  description: string;
  department?: string | null;
  deadline?: string | null;
  budget_feel: string;
  status: string;
  admin_notes?: string | null;
  created_at: string;
};

const STATUS_OPTIONS = [
  { value: "sent", label: "Sent" },
  { value: "quoted", label: "Quoted" },
  { value: "in_progress", label: "In progress" },
  { value: "done", label: "Done" },
  { value: "cancelled", label: "Cancelled" },
];

export default function AdminSystemsPage() {
  const [requests, setRequests] = useState<AdminRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) {
      setLoading(false);
      return;
    }
    try {
      const res = await fetch("/api/admin/systems", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (!res.ok) {
        showToast("error", json.error || "Could not load requests");
        setRequests([]);
      } else {
        setRequests(json.requests || []);
      }
    } catch {
      showToast("error", "Could not load requests");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const updateStatus = async (id: string, status: string) => {
    setSavingId(id);
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return;
    try {
      const res = await fetch("/api/admin/systems", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ id, status }),
      });
      const json = await res.json();
      if (!res.ok) {
        showToast("error", json.error || "Update failed");
        return;
      }
      setRequests((prev) => prev.map((r) => (r.id === id ? { ...r, status } : r)));
      showToast("success", "Status updated");
    } catch {
      showToast("error", "Update failed");
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div>
      <div className="mb-6 flex items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold text-white">
            <Wrench size={18} className="text-emerald-400" />
            System build requests
          </h2>
          <p className="mt-1 text-sm text-slate-400">
            Students request custom apps / FYP systems. Reply in Messages, then update status here.
          </p>
        </div>
        <Link
          href="/admin/inbox"
          className="inline-flex items-center gap-2 rounded-full border border-white/10 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-white/5"
        >
          <MessageSquare size={14} />
          Inbox
        </Link>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-slate-400">
          <Loader2 size={16} className="animate-spin" />
          Loading…
        </div>
      ) : requests.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/10 p-8 text-center text-sm text-slate-400">
          No system requests yet.
        </div>
      ) : (
        <ul className="space-y-3">
          {requests.map((r) => (
            <li
              key={r.id}
              className="rounded-2xl border border-white/5 bg-slate-900/60 p-4"
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-white">{r.title}</p>
                  <p className="mt-1 text-xs text-slate-400">
                    {r.student_name}
                    {r.department ? ` · ${r.department}` : ""}
                    {r.deadline ? ` · due ${r.deadline}` : ""}
                    {` · ${r.budget_feel}`}
                  </p>
                  <p className="mt-2 whitespace-pre-wrap text-sm text-slate-300">{r.description}</p>
                  <p className="mt-2 text-[11px] text-slate-500">
                    {new Date(r.created_at).toLocaleString()}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col gap-2 sm:items-end">
                  <select
                    value={r.status}
                    disabled={savingId === r.id}
                    onChange={(e) => void updateStatus(r.id, e.target.value)}
                    className="rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white"
                  >
                    {STATUS_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                  <Link
                    href={`/admin/inbox?peer=${r.user_id}`}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-sky-400 hover:underline"
                  >
                    <MessageSquare size={12} />
                    Message student
                  </Link>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
