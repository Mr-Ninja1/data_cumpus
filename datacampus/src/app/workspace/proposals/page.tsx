"use client";

import React, { useEffect, useState } from "react";
import { FolderOpen, PlusCircle, Sparkles } from "lucide-react";
import { supabase } from "@/utils/supabaseClient";
import { useRouter } from "next/navigation";

export default function ProposalsPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void loadProjects();
  }, []);

  const loadProjects = async () => {
    setLoading(true);
    const session = await supabase.auth.getSession();
    const token = session.data.session?.access_token;
    if (!token) {
      setLoading(false);
      return;
    }

    const res = await fetch("/api/proposals", { headers: { Authorization: `Bearer ${token}` } });
    const json = await res.json();
    setProjects(json.projects ?? []);
    setLoading(false);
  };

  const createProject = async () => {
    const session = await supabase.auth.getSession();
    const token = session.data.session?.access_token;
    if (!token) return;

    const res = await fetch("/api/proposals", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ title: "New Proposal" }),
    });
    const json = await res.json();
    if (json.project) {
      router.push(`/workspace/proposals/${json.project.id}`);
    }
  };

  return (
    <div className="max-w-6xl mx-auto py-8 px-3 md:px-0 space-y-6">
      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-sky-100 p-3 text-sky-700"><FolderOpen size={20} /></div>
            <div>
              <h1 className="text-2xl font-semibold">Proposal workspace</h1>
              <p className="text-sm text-gray-600">Create proposal projects and generate draft sections with credits.</p>
            </div>
          </div>
          <button onClick={createProject} className="rounded-full bg-gray-900 px-4 py-2 text-sm font-semibold text-white">New proposal</button>
        </div>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-2">
          <Sparkles size={18} className="text-gray-500" />
          <h2 className="font-semibold">Your proposals</h2>
        </div>
        {loading ? <p className="mt-4 text-sm text-gray-500">Loading...</p> : projects.length === 0 ? <p className="mt-4 text-sm text-gray-500">No proposals yet. Create your first one to get started.</p> : <div className="mt-4 grid gap-4 md:grid-cols-2">{projects.map((project) => (
          <button key={project.id} onClick={() => router.push(`/workspace/proposals/${project.id}`)} className="rounded-2xl border border-gray-200 p-4 text-left hover:border-gray-400">
            <div className="flex items-center justify-between">
              <div className="font-semibold">{project.title}</div>
              <PlusCircle size={18} className="text-gray-400" />
            </div>
            <div className="mt-2 text-sm text-gray-600">{project.department || "Department not set"}</div>
            <div className="mt-2 text-xs uppercase tracking-wide text-gray-400">{project.status}</div>
          </button>
        ))}</div>}
      </div>
    </div>
  );
}
