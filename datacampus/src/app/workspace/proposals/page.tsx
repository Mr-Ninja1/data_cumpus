"use client";

import React, { useEffect, useState } from "react";
import { ChevronRight, FilePlus2, Loader2, Plus, Sparkles, Trash2, X } from "lucide-react";
import { supabase } from "@/utils/supabaseClient";
import { useRouter } from "next/navigation";
import { showToast } from "@/utils/toast";
import Link from "next/link";

type Project = {
  id: string;
  title: string;
  department?: string | null;
  status?: string | null;
  updated_at?: string | null;
  metadata?: { stage?: string } | null;
};

export default function ProposalsPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [title, setTitle] = useState("");
  const [department, setDepartment] = useState("");
  const [workflowMode, setWorkflowMode] = useState<"chat_to_work" | "classic">("chat_to_work");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  useEffect(() => {
    void loadProjects();
  }, []);

  const loadProjects = async () => {
    setLoading(true);
    const session = await supabase.auth.getSession();
    const token = session.data.session?.access_token;
    if (!token) {
      setSignedIn(false);
      setProjects([]);
      setLoading(false);
      return;
    }

    setSignedIn(true);
    try {
      const res = await fetch("/api/proposals", { headers: { Authorization: `Bearer ${token}` } });
      const json = await res.json();
      if (!res.ok) {
        showToast("error", json.error || "Could not load proposals");
        setProjects([]);
      } else {
        setProjects(json.projects ?? []);
      }
    } catch {
      showToast("error", "Could not load proposals");
      setProjects([]);
    } finally {
      setLoading(false);
    }
  };

  const openCreate = () => {
    if (signedIn === false) {
      showToast("info", "Sign in to create a proposal");
      void supabase.auth.signInWithOAuth({ provider: "google" });
      return;
    }
    setTitle("");
    setDepartment("");
    setWorkflowMode("chat_to_work");
    setShowCreate(true);
  };

  const createProject = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (creating) return;

    const session = await supabase.auth.getSession();
    const token = session.data.session?.access_token;
    if (!token) {
      showToast("info", "Sign in to create a proposal");
      void supabase.auth.signInWithOAuth({ provider: "google" });
      return;
    }

    setCreating(true);
    try {
      const res = await fetch("/api/proposals", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          title: title.trim() || "Untitled Proposal",
          department: department.trim() || null,
          stage: "initial_proposal",
          workflow_mode: workflowMode,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.project) {
        showToast("error", json.error || "Could not create proposal");
        return;
      }
      if (json.title_refined && json.project?.title) {
        showToast("info", `AI cleaned up your title to: "${json.project.title}"`);
      }
      showToast("success", json.auto_started ? "Proposal created — AI has already started the workflow" : "Proposal created");
      setShowCreate(false);
      router.push(`/workspace/proposals/${json.project.id}`);
    } catch {
      showToast("error", "Could not create proposal");
    } finally {
      setCreating(false);
    }
  };

  const deleteProject = async (projectId: string) => {
    setDeletingId(projectId);
    const session = await supabase.auth.getSession();
    const token = session.data.session?.access_token;
    if (!token) {
      showToast("error", "Not authenticated");
      setDeletingId(null);
      return;
    }

    try {
      const res = await fetch(`/api/proposals/${projectId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const json = await res.json();
        showToast("error", json.error || "Could not delete proposal");
        return;
      }
      setProjects((prev) => prev.filter((p) => p.id !== projectId));
      setConfirmDeleteId(null);
      showToast("success", "Proposal deleted");
    } catch {
      showToast("error", "Could not delete proposal");
    } finally {
      setDeletingId(null);
    }
  };

  const projectToDelete = projects.find((p) => p.id === confirmDeleteId);

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 py-6 md:py-2">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0 flex-1">
          <Link
            href="/workspace"
            className="text-xs font-medium uppercase tracking-wide text-sky-700 hover:underline dark:text-sky-400"
          >
            Work
          </Link>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-gray-900 dark:text-white sm:text-3xl">
            Project proposals
          </h1>
          <p className="mt-1.5 text-sm text-gray-600 dark:text-gray-400 sm:max-w-xl">
            Start with only a project title, then let AI guide the proposal chapter-by-chapter.
          </p>
          <p className="mt-2 text-xs font-medium text-sky-700 dark:text-sky-400">
            AI drafts cost 3 credits each.
          </p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex shrink-0 items-center justify-center gap-2 self-start rounded-full bg-gray-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-gray-800 sm:self-auto dark:bg-white dark:text-gray-900 dark:hover:bg-gray-100"
        >
          <Plus size={16} />
          New proposal
        </button>
      </div>

      {signedIn === false ? (
        <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-8 text-center dark:border-gray-700 dark:bg-gray-900">
          <FilePlus2 className="mx-auto text-gray-400" size={28} />
          <h2 className="mt-3 text-lg font-semibold text-gray-900 dark:text-white">Sign in to use Workspace</h2>
          <p className="mx-auto mt-1.5 max-w-md text-sm text-gray-600 dark:text-gray-400">
            Your proposals sync to your account so you can continue drafting across devices.
          </p>
          <button
            type="button"
            onClick={() => void supabase.auth.signInWithOAuth({ provider: "google" })}
            className="mt-5 inline-flex items-center gap-2 rounded-full bg-sky-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-sky-700"
          >
            Sign in with Google
          </button>
        </div>
      ) : (
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900 sm:p-6">
          <div className="flex items-center gap-2">
            <Sparkles size={16} className="text-sky-600" />
            <h2 className="font-semibold text-gray-900 dark:text-white">Your proposals</h2>
          </div>

          {loading ? (
            <div className="mt-6 space-y-3">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-20 animate-pulse rounded-xl bg-gray-100 dark:bg-gray-800" />
              ))}
            </div>
          ) : projects.length === 0 ? (
            <div className="mt-6 rounded-xl border border-dashed border-gray-300 px-4 py-10 text-center dark:border-gray-700">
              <p className="text-sm text-gray-600 dark:text-gray-400">No proposals yet.</p>
            </div>
          ) : (
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {projects.map((project) => (
                <div key={project.id} className="rounded-xl border border-gray-200 p-4 dark:border-gray-800">
                  <button
                    type="button"
                    onClick={() => router.push(`/workspace/proposals/${project.id}`)}
                    className="w-full text-left transition hover:opacity-80"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-semibold text-gray-900 dark:text-white">{project.title}</div>
                        <div className="mt-1 truncate text-sm text-gray-600 dark:text-gray-400">
                          {project.department || "Department not set"}
                        </div>
                      </div>
                      <ChevronRight size={18} className="mt-0.5 shrink-0 text-gray-400" />
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] font-medium uppercase tracking-wide text-gray-500">
                      <span className="rounded-full bg-gray-100 px-2 py-0.5 dark:bg-gray-800">
                        {project.metadata?.stage === "full_project" ? "Full project" : "Initial proposal"}
                      </span>
                      <span className="rounded-full bg-gray-100 px-2 py-0.5 dark:bg-gray-800">
                        {project.status || "draft"}
                      </span>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setConfirmDeleteId(project.id);
                    }}
                    className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-red-600 hover:text-red-700 dark:text-red-500 dark:hover:text-red-400"
                  >
                    <Trash2 size={14} />
                    Delete
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {showCreate ? (
        <div className="fixed inset-0 z-50 grid place-items-end p-4 sm:place-items-center">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => !creating && setShowCreate(false)}
            aria-hidden="true"
          />
          <form
            onSubmit={createProject}
            className="relative z-10 w-full max-w-md rounded-2xl border border-gray-200 bg-white p-5 shadow-xl dark:border-gray-800 dark:bg-gray-900 sm:p-6"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">New proposal</h2>
                <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                  Enter the proposal title and start. AI will guide the workflow and build the document one chapter at a time.
                </p>
              </div>
              <button
                type="button"
                disabled={creating}
                onClick={() => setShowCreate(false)}
                className="shrink-0 rounded-full border border-gray-200 p-1.5 text-gray-500 dark:border-gray-700"
                aria-label="Close"
              >
                <X size={16} />
              </button>
            </div>

            <div className="mt-5 space-y-4">
              <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500">
                Title
                <input
                  autoFocus
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Smart irrigation for small farms"
                  className="mt-1.5 box-border block w-full min-w-0 rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100 dark:border-gray-700 dark:bg-gray-950 dark:text-white"
                />
              </label>

              <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500">
                Department (optional)
                <input
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                  placeholder="e.g. Computer Science"
                  className="mt-1.5 box-border block w-full min-w-0 rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100 dark:border-gray-700 dark:bg-gray-950 dark:text-white"
                />
              </label>

              <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500">
                Workflow
                <select
                  value={workflowMode}
                  onChange={(e) => setWorkflowMode(e.target.value as "chat_to_work" | "classic")}
                  className="mt-1.5 box-border block w-full min-w-0 rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 outline-none focus:border-sky-400 dark:border-gray-700 dark:bg-gray-950 dark:text-white"
                >
                  <option value="chat_to_work">AI-guided chat to work</option>
                  <option value="classic">Classic manual workspace</option>
                </select>
              </label>

              <div className="rounded-xl border border-sky-200 bg-sky-50 px-3 py-3 text-xs text-sky-900">
                This flow starts directly with the school&apos;s required <span className="font-semibold">initial proposal</span>: cover page, table of contents, Chapters 1–3, conceptual framework only in Chapter 1, and IEEE references at the end.
              </div>
            </div>

            <div className="mt-6 flex gap-2">
              <button
                type="button"
                disabled={creating}
                onClick={() => setShowCreate(false)}
                className="min-w-0 flex-1 rounded-full border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 dark:border-gray-700 dark:text-gray-200"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={creating}
                className="inline-flex min-w-0 flex-1 items-center justify-center gap-2 rounded-full bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-60"
              >
                {creating ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
                {creating ? "Creating…" : workflowMode === "chat_to_work" ? "Start with AI" : "Create"}
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {confirmDeleteId ? (
        <div className="fixed inset-0 z-50 grid place-items-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => !deletingId && setConfirmDeleteId(null)} aria-hidden="true" />
          <div className="relative z-10 w-full max-w-sm rounded-2xl border border-gray-200 bg-white p-6 shadow-xl dark:border-gray-800 dark:bg-gray-900">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Delete proposal?</h2>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
              This will permanently delete <span className="font-semibold">{projectToDelete?.title}</span> and all its content. This action cannot be undone.
            </p>
            <div className="mt-6 flex gap-3">
              <button
                type="button"
                disabled={!!deletingId}
                onClick={() => setConfirmDeleteId(null)}
                className="min-w-0 flex-1 rounded-full border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!!deletingId}
                onClick={() => deleteProject(confirmDeleteId)}
                className="inline-flex min-w-0 flex-1 items-center justify-center gap-2 rounded-full bg-red-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60"
              >
                {deletingId === confirmDeleteId ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                {deletingId === confirmDeleteId ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
