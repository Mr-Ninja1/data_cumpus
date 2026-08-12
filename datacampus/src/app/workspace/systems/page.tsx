"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Check, Loader2, MessageSquare, Wrench } from "lucide-react";
import { supabase } from "@/utils/supabaseClient";
import { showToast } from "@/utils/toast";

type BuildRequest = {
  id: string;
  title: string;
  description: string;
  department?: string | null;
  deadline?: string | null;
  budget_feel: string;
  status: string;
  created_at: string;
};

const STATUS_LABEL: Record<string, string> = {
  sent: "Sent",
  quoted: "Quoted",
  in_progress: "In progress",
  done: "Done",
  cancelled: "Cancelled",
};

const BUDGET_OPTIONS = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "flexible", label: "Flexible" },
] as const;

export default function SystemRequestPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [department, setDepartment] = useState("");
  const [deadline, setDeadline] = useState("");
  const [budgetFeel, setBudgetFeel] = useState<"low" | "medium" | "flexible">("flexible");
  const [submitting, setSubmitting] = useState(false);
  const [doneInbox, setDoneInbox] = useState<string | null>(null);
  const [requests, setRequests] = useState<BuildRequest[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [signedIn, setSignedIn] = useState<boolean | null>(null);

  const loadRequests = async () => {
    setLoadingList(true);
    const session = await supabase.auth.getSession();
    const token = session.data.session?.access_token;
    if (!token) {
      setSignedIn(false);
      setRequests([]);
      setLoadingList(false);
      return;
    }
    setSignedIn(true);
    try {
      const res = await fetch("/api/workspace/systems", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (res.ok) setRequests(json.requests || []);
      else if (json.error) showToast("error", json.error);
    } catch {
      showToast("error", "Could not load your requests");
    } finally {
      setLoadingList(false);
    }
  };

  useEffect(() => {
    void loadRequests();
  }, []);

  const nextFromStep1 = () => {
    if (title.trim().length < 3) {
      showToast("info", "Add a short title");
      return;
    }
    if (description.trim().length < 10) {
      showToast("info", "Describe what you need in a few sentences");
      return;
    }
    setStep(2);
  };

  const submit = async () => {
    if (submitting) return;
    const session = await supabase.auth.getSession();
    const token = session.data.session?.access_token;
    if (!token) {
      showToast("info", "Sign in to send a request");
      void supabase.auth.signInWithOAuth({ provider: "google" });
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/workspace/systems", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim(),
          department: department.trim() || null,
          deadline: deadline || null,
          budget_feel: budgetFeel,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        showToast("error", json.error || "Could not send request");
        return;
      }
      setDoneInbox(json.inboxHint || "/inbox?tab=messages");
      setStep(1);
      setTitle("");
      setDescription("");
      setDepartment("");
      setDeadline("");
      setBudgetFeel("flexible");
      await loadRequests();
      showToast("success", "Request sent");
    } catch {
      showToast("error", "Could not send request");
    } finally {
      setSubmitting(false);
    }
  };

  if (doneInbox) {
    return (
      <div className="mx-auto w-full max-w-lg space-y-6 py-8">
        <div className="rounded-3xl border border-emerald-200 bg-emerald-50 p-6 text-center dark:border-emerald-900 dark:bg-emerald-950/40">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-600 text-white">
            <Check size={22} />
          </div>
          <h1 className="mt-4 text-xl font-semibold text-gray-900 dark:text-white">Request sent</h1>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
            We’ll reply in Messages with a quote and next steps.
          </p>
          <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-center">
            <button
              type="button"
              onClick={() => router.push(doneInbox)}
              className="inline-flex items-center justify-center gap-2 rounded-full bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white"
            >
              <MessageSquare size={16} />
              Open chat
            </button>
            <button
              type="button"
              onClick={() => setDoneInbox(null)}
              className="rounded-full border border-gray-300 px-5 py-2.5 text-sm font-semibold text-gray-800 dark:border-gray-700 dark:text-gray-100"
            >
              Back to requests
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6 py-6 md:py-2">
      <div>
        <Link
          href="/workspace"
          className="inline-flex items-center gap-1 text-xs font-medium uppercase tracking-wide text-sky-700 hover:underline dark:text-sky-400"
        >
          <ArrowLeft size={12} /> Work
        </Link>
        <h1 className="mt-1 flex items-center gap-2 text-2xl font-semibold tracking-tight text-gray-900 dark:text-white">
          <Wrench size={22} className="text-emerald-600" />
          Request a system
        </h1>
        <p className="mt-1.5 text-sm text-gray-600 dark:text-gray-400">
          Tell us what you need in 3 easy steps. Free to request — we send a quote.
        </p>
      </div>

      {signedIn === false ? (
        <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-8 text-center dark:border-gray-700 dark:bg-gray-900">
          <p className="font-semibold text-gray-900 dark:text-white">Sign in to request a build</p>
          <button
            type="button"
            onClick={() => void supabase.auth.signInWithOAuth({ provider: "google" })}
            className="mt-4 rounded-full bg-sky-600 px-5 py-2.5 text-sm font-semibold text-white"
          >
            Sign in with Google
          </button>
        </div>
      ) : (
        <div className="rounded-3xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900">
          <div className="mb-5 flex items-center gap-2">
            {[1, 2, 3].map((n) => (
              <div key={n} className="flex flex-1 items-center gap-2">
                <div
                  className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold ${
                    step === n
                      ? "bg-emerald-600 text-white"
                      : step > n
                        ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                        : "bg-gray-100 text-gray-500 dark:bg-gray-800"
                  }`}
                >
                  {step > n ? <Check size={14} /> : n}
                </div>
                {n < 3 && <div className="h-0.5 flex-1 bg-gray-200 dark:bg-gray-800" />}
              </div>
            ))}
          </div>
          <p className="mb-4 text-xs font-medium uppercase tracking-wide text-gray-500">
            Step {step} of 3
          </p>

          {step === 1 && (
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium text-gray-800 dark:text-gray-200">
                  What do you need?
                </label>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Library management system"
                  className="mt-1.5 w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-emerald-400 dark:border-gray-700 dark:bg-gray-950"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-800 dark:text-gray-200">
                  Short description
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={4}
                  placeholder="In 2–3 sentences: who will use it, and what should it do?"
                  className="mt-1.5 w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-emerald-400 dark:border-gray-700 dark:bg-gray-950"
                />
              </div>
              <button
                type="button"
                onClick={nextFromStep1}
                className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-emerald-600 px-4 py-3 text-sm font-semibold text-white sm:w-auto"
              >
                Continue <ArrowRight size={16} />
              </button>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium text-gray-800 dark:text-gray-200">
                  Department (optional)
                </label>
                <input
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                  placeholder="e.g. Computer Science"
                  className="mt-1.5 w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-emerald-400 dark:border-gray-700 dark:bg-gray-950"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-800 dark:text-gray-200">
                  Deadline (optional)
                </label>
                <input
                  type="date"
                  value={deadline}
                  onChange={(e) => setDeadline(e.target.value)}
                  className="mt-1.5 w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-emerald-400 dark:border-gray-700 dark:bg-gray-950"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-800 dark:text-gray-200">
                  Budget feel
                </label>
                <div className="mt-2 flex flex-wrap gap-2">
                  {BUDGET_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setBudgetFeel(opt.value)}
                      className={`rounded-full px-4 py-2 text-sm font-semibold ${
                        budgetFeel === opt.value
                          ? "bg-emerald-600 text-white"
                          : "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-200"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="rounded-full border border-gray-300 px-4 py-2.5 text-sm font-semibold dark:border-gray-700"
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={() => setStep(3)}
                  className="inline-flex items-center gap-2 rounded-full bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white"
                >
                  Continue <ArrowRight size={16} />
                </button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <div className="rounded-2xl bg-gray-50 p-4 text-sm dark:bg-gray-950">
                <p className="font-semibold text-gray-900 dark:text-white">{title}</p>
                <p className="mt-2 whitespace-pre-wrap text-gray-600 dark:text-gray-300">
                  {description}
                </p>
                <ul className="mt-3 space-y-1 text-gray-500">
                  {department && <li>Department: {department}</li>}
                  {deadline && <li>Deadline: {deadline}</li>}
                  <li>
                    Budget:{" "}
                    {BUDGET_OPTIONS.find((b) => b.value === budgetFeel)?.label || budgetFeel}
                  </li>
                </ul>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  disabled={submitting}
                  className="rounded-full border border-gray-300 px-4 py-2.5 text-sm font-semibold dark:border-gray-700"
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={() => void submit()}
                  disabled={submitting}
                  className="inline-flex items-center gap-2 rounded-full bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
                >
                  {submitting ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                  Send request
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      <div>
        <h2 className="text-sm font-semibold text-gray-900 dark:text-white">My requests</h2>
        {loadingList ? (
          <p className="mt-3 text-sm text-gray-500">Loading…</p>
        ) : requests.length === 0 ? (
          <p className="mt-3 text-sm text-gray-500">No requests yet.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {requests.map((r) => (
              <li
                key={r.id}
                className="rounded-2xl border border-gray-200 bg-white px-4 py-3 dark:border-gray-800 dark:bg-gray-900"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-gray-900 dark:text-white">{r.title}</p>
                    <p className="mt-0.5 text-xs text-gray-500">
                      {new Date(r.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full bg-gray-100 px-2.5 py-1 text-[11px] font-semibold text-gray-700 dark:bg-gray-800 dark:text-gray-200">
                    {STATUS_LABEL[r.status] || r.status}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
