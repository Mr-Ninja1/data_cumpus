"use client";

import React, { useMemo, useRef, useState } from "react";
import { AlertCircle, BookOpen, ChevronRight, FileText, FolderOpen, LayoutPanelLeft, Menu, Sparkles } from "lucide-react";
import Link from "next/link";

type StatusTone = "pending" | "generating" | "awaiting_input" | "complete" | "failed";

type WorkspaceShellProps = {
  project: any;
  currentStage: string;
  currentChapter: string;
  chapterStore: any[];
  specKey: string;
  setSpecKey: (value: string) => void;
  pendingQuestion: string | null;
  messages: Array<{ role: string; text: string; attachments?: any[] }>;
  input: string;
  setInput: (value: string) => void;
  attachments: File[];
  onSend: () => void;
  onFileSelect: (event?: React.ChangeEvent<HTMLInputElement>) => void;
  onSaveReferences: () => void;
  onSaveProject: () => void;
  onExport: () => void;
  onStageChange: (value: string) => void;
  onSelectChapter: (value: string) => void;
  referenceInput: string;
  setReferenceInput: (value: string) => void;
  saving: boolean;
  exporting: boolean;
  busy: boolean;
  fileRef: React.RefObject<HTMLInputElement | null>;
  getStatus: (chapterKey: string) => StatusTone;
  getChapterLabel: (chapterKey: string) => string;
};

const STAGE_OPTIONS = [
  { value: "initial_proposal", label: "Initial proposal" },
  { value: "full_project", label: "Full project" },
];

const STATUS_META: Record<StatusTone, { label: string; className: string }> = {
  pending: { label: "Pending", className: "bg-slate-100 text-slate-700" },
  generating: { label: "Generating", className: "bg-amber-100 text-amber-800" },
  awaiting_input: { label: "Awaiting input", className: "bg-rose-100 text-rose-800" },
  complete: { label: "Complete", className: "bg-emerald-100 text-emerald-800" },
  failed: { label: "Failed", className: "bg-red-100 text-red-800" },
};

export default function ProposalWorkspaceShell(props: WorkspaceShellProps) {
  const [showPrimaryNav, setShowPrimaryNav] = useState(false);
  const [showStructureNav, setShowStructureNav] = useState(false);
  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const frontMatterItems = useMemo(() => {
    const base = [
      { key: "cover_page", label: "Cover page", kind: "front_matter" as const },
      { key: "table_of_contents", label: "Table of contents", kind: "front_matter" as const },
    ];
    if (props.currentStage === "full_project") {
      return [...base, { key: "abstract", label: "Abstract", kind: "front_matter" as const }, { key: "acknowledgement", label: "Acknowledgement", kind: "front_matter" as const }];
    }
    return base;
  }, [props.currentStage]);

  const structureItems = useMemo(() => [...frontMatterItems, ...props.chapterStore.map((chapter: any) => ({ key: chapter.chapter_key, label: chapter.title || props.getChapterLabel(chapter.chapter_key), kind: "chapter" as const }))], [frontMatterItems, props.chapterStore, props.getChapterLabel]);

  const handleSelect = (key: string) => {
    props.onSelectChapter(key);
    setShowStructureNav(false);
    window.requestAnimationFrame(() => {
      sectionRefs.current[key]?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  const currentChapterContent = props.chapterStore.find((chapter: any) => chapter.chapter_key === props.currentChapter)?.content_md || "";
  const requiredDiagrams = props.currentStage === "full_project"
    ? ["Conceptual framework", "System architecture", "Methodology flowchart"]
    : ["Conceptual framework"];

  return (
    <div className="mx-auto max-w-7xl px-3 py-6 sm:px-4 lg:px-0 lg:py-8 space-y-6">
      <header className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3 min-w-0">
            <div className="hidden rounded-2xl bg-sky-100 p-2 text-sky-700 sm:flex">
              <BookOpen size={18} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <button className="rounded-full border border-slate-200 p-2 text-slate-600 lg:hidden" onClick={() => setShowPrimaryNav(true)}>
                  <Menu size={16} />
                </button>
                <button className="rounded-full border border-slate-200 p-2 text-slate-600 lg:hidden" onClick={() => setShowStructureNav(true)}>
                  <LayoutPanelLeft size={16} />
                </button>
                <h1 className="truncate text-xl font-semibold text-slate-900">{props.project.title}</h1>
              </div>
              <p className="mt-1 text-sm text-slate-600">Structured proposal drafting with stage-aware chapters, inline diagrams, and guided clarification.</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={props.onSaveProject} disabled={props.saving} className="rounded-full border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700">
              {props.saving ? "Saving..." : "Save"}
            </button>
            <button onClick={props.onExport} disabled={props.exporting} className="rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white flex items-center gap-2">
              <FileText size={16} /> {props.exporting ? "Preparing..." : "Export"}
            </button>
          </div>
        </div>
      </header>

      <div className="hidden gap-6 lg:grid lg:grid-cols-[220px_260px_minmax(0,1fr)]">
        <aside className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <FolderOpen size={16} /> Primary nav
          </div>
          <div className="mt-4 space-y-3">
            <Link href="/workspace/proposals" className="flex items-center justify-between rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 hover:border-sky-300 hover:bg-sky-50">
              <span>Back to proposals</span>
              <ChevronRight size={16} />
            </Link>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <div className="text-xs uppercase tracking-wide text-slate-500">Current project</div>
              <div className="mt-1 text-sm font-semibold text-slate-900">{props.project.title}</div>
              <div className="mt-1 text-xs text-slate-600">{props.project.department || "Department not set"}</div>
            </div>
          </div>
        </aside>

        <aside className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold text-slate-900">Structure</div>
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-600">{props.currentStage === "full_project" ? "Full project" : "Initial proposal"}</span>
          </div>

          <label className="mt-4 block text-xs font-medium uppercase tracking-wide text-slate-500">
            Stage
            <select value={props.currentStage} onChange={(e) => props.onStageChange(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
              {STAGE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>

          <label className="mt-3 block text-xs font-medium uppercase tracking-wide text-slate-500">
            Spec key
            <input value={props.specKey} onChange={(e) => props.setSpecKey(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700" placeholder="default-proposal" />
          </label>

          <div className="mt-4 space-y-2">
            {structureItems.map((item) => {
              const status = props.getStatus(item.key);
              const isActive = props.currentChapter === item.key;
              return (
                <button key={item.key} onClick={() => props.onSelectChapter(item.key)} className={`flex w-full items-center justify-between rounded-xl border px-3 py-2 text-left text-sm transition ${isActive ? "border-sky-400 bg-sky-50 text-sky-800" : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50"}`}>
                  <span className="truncate">{item.label}</span>
                  <span className={`rounded-full px-2 py-1 text-[11px] font-medium ${STATUS_META[status].className}`}>{STATUS_META[status].label}</span>
                </button>
              );
            })}
          </div>
        </aside>

        <main className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <section className="space-y-4">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="text-sm font-semibold text-slate-900">Document presenter</div>
                  <div className="text-sm text-slate-600">Live proposal content with inline guidance and diagram hints.</div>
                </div>
                <span className="rounded-full bg-sky-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-sky-800">{props.currentStage === "full_project" ? "Full project" : "Initial proposal"}</span>
              </div>
            </div>

            {props.pendingQuestion ? (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                <div className="flex items-center gap-2 font-semibold"><AlertCircle size={16} /> Clarification prompt</div>
                <div className="mt-2">{props.pendingQuestion}</div>
              </div>
            ) : null}

            <div ref={(node) => { sectionRefs.current[props.currentChapter] = node; }} className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-slate-900">{props.getChapterLabel(props.currentChapter)}</div>
                  <div className="text-xs uppercase tracking-wide text-slate-500">{props.currentChapter}</div>
                </div>
                <span className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${STATUS_META[props.getStatus(props.currentChapter)].className}`}>{STATUS_META[props.getStatus(props.currentChapter)].label}</span>
              </div>
              <div className="mt-3 space-y-3">
                {props.messages.length ? props.messages.map((message, index) => (
                  <div key={`${message.role}-${index}`} className={`rounded-xl p-3 ${message.role === "user" ? "bg-slate-900 text-white" : "bg-slate-50 text-slate-800"}`}>
                    <div className="whitespace-pre-wrap text-sm">{message.text}</div>
                    {message.attachments?.length ? <div className="mt-2 text-xs text-slate-500">Attachments: {message.attachments.map((attachment: any) => attachment.path || attachment.name).join(", ")}</div> : null}
                  </div>
                )) : <div className="rounded-xl border border-dashed border-slate-300 p-3 text-sm text-slate-600">No content generated yet for this chapter. Start drafting to populate the document presenter.</div>}
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="text-sm font-semibold text-slate-900">Inline diagrams</div>
                <ul className="mt-3 space-y-2 text-sm text-slate-600">
                  {requiredDiagrams.map((diagram) => (
                    <li key={diagram} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">{diagram}</li>
                  ))}
                </ul>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="text-sm font-semibold text-slate-900">References</div>
                <div className="mt-3 text-sm text-slate-600">
                  {props.project?.metadata?.references?.length ? props.project.metadata.references.map((ref: any, index: number) => <div key={`${ref.id || index}`} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 mt-2">{ref.title}</div>) : <div className="rounded-lg border border-dashed border-slate-200 px-3 py-2">Add references to ground the literature review.</div>}
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="flex items-center justify-between gap-2">
                <div className="text-sm font-semibold text-slate-900">Draft next step</div>
                <span className="rounded-full bg-slat-100 px-2.5 py-1 text-xs font-medium text-slate-600">Responsive workflow</span>
              </div>
              <div className="mt-3 space-y-3">
                <textarea value={props.referenceInput} onChange={(e) => props.setReferenceInput(e.target.value)} rows={3} placeholder="Optional references (one per line)" className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700" />
                <div className="flex flex-wrap gap-2">
                  <button onClick={props.onSaveReferences} className="rounded-full border border-slate-300 px-3 py-2 text-sm text-slate-700">Save references</button>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <input value={props.input} onChange={(e) => props.setInput(e.target.value)} placeholder={`Draft ${props.getChapterLabel(props.currentChapter)}...`} className="flex-1 min-w-0 rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700" />
                  <div className="flex gap-2">
                    <input ref={props.fileRef} type="file" multiple onChange={(event) => props.onFileSelect(event)} className="hidden" />
                    <button onClick={() => props.onFileSelect()} className="rounded-lg border border-slate-300 p-2 text-slate-600"><FileText size={16} /></button>
                    <button onClick={props.onSend} disabled={props.busy} className="rounded-full bg-sky-600 px-4 py-2 text-sm font-semibold text-white">{props.busy ? "…" : "Send"}</button>
                  </div>
                </div>
                {props.attachments.length > 0 ? <div className="text-xs text-slate-600">Attached: {props.attachments.map((attachment) => attachment.name).join(", ")}</div> : null}
              </div>
            </div>
          </section>
        </main>
      </div>

      <div className="space-y-4 lg:hidden">
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold text-slate-900">Document presenter</div>
            <span className="rounded-full bg-sky-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-sky-800">{props.currentStage === "full_project" ? "Full project" : "Initial proposal"}</span>
          </div>
          <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
            The presenter stays front and center on mobile while chapters and project navigation open as overlays.
          </div>
        </section>
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <div className="text-sm font-semibold text-slate-900">{props.getChapterLabel(props.currentChapter)}</div>
            <span className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${STATUS_META[props.getStatus(props.currentChapter)].className}`}>{STATUS_META[props.getStatus(props.currentChapter)].label}</span>
          </div>
          <div className="mt-3 space-y-3">
            {props.pendingQuestion ? (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{props.pendingQuestion}</div>
            ) : null}
            {props.messages.length ? props.messages.map((message, index) => (
              <div key={`${message.role}-${index}`} className={`rounded-xl p-3 ${message.role === "user" ? "bg-slate-900 text-white" : "bg-slate-50 text-slate-800"}`}>
                <div className="whitespace-pre-wrap text-sm">{message.text}</div>
              </div>
            )) : <div className="rounded-xl border border-dashed border-slate-300 p-3 text-sm text-slate-600">No content yet.</div>}
          </div>
        </section>
      </div>

      {showPrimaryNav ? (
        <div className="fixed inset-0 z-40 bg-slate-950/50 lg:hidden" onClick={() => setShowPrimaryNav(false)} />
      ) : null}
      <div className={`fixed inset-y-0 left-0 z-50 w-80 max-w-[85vw] border-r border-slate-200 bg-white p-4 shadow-xl transition-transform duration-200 lg:hidden ${showPrimaryNav ? "translate-x-0" : "-translate-x-full"}`}>
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold text-slate-900">Primary nav</div>
          <button onClick={() => setShowPrimaryNav(false)} className="rounded-full border border-slate-200 p-2 text-slate-600">×</button>
        </div>
        <div className="mt-4 space-y-3">
          <Link href="/workspace/proposals" className="flex items-center justify-between rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700" onClick={() => setShowPrimaryNav(false)}>
            <span>Back to proposals</span>
            <ChevronRight size={16} />
          </Link>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <div className="text-xs uppercase tracking-wide text-slate-500">Current project</div>
            <div className="mt-1 text-sm font-semibold text-slate-900">{props.project.title}</div>
          </div>
        </div>
      </div>

      {showStructureNav ? (
        <div className="fixed inset-0 z-40 bg-slate-950/50 lg:hidden" onClick={() => setShowStructureNav(false)} />
      ) : null}
      <div className={`fixed inset-x-0 bottom-0 z-50 max-h-[80vh] overflow-auto rounded-t-2xl border border-slate-200 bg-white p-4 shadow-xl transition-transform duration-200 lg:hidden ${showStructureNav ? "translate-y-0" : "translate-y-full"}`}>
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold text-slate-900">Chapters</div>
          <button onClick={() => setShowStructureNav(false)} className="rounded-full border border-slate-200 p-2 text-slate-600">×</button>
        </div>
        <div className="mt-4 space-y-2">
          {structureItems.map((item) => {
            const status = props.getStatus(item.key);
            const isActive = props.currentChapter === item.key;
            return (
              <button key={item.key} onClick={() => handleSelect(item.key)} className={`flex w-full items-center justify-between rounded-xl border px-3 py-2 text-left text-sm ${isActive ? "border-sky-400 bg-sky-50 text-sky-800" : "border-slate-200 bg-white text-slate-700"}`}>
                <span>{item.label}</span>
                <span className={`rounded-full px-2 py-1 text-[11px] font-medium ${STATUS_META[status].className}`}>{STATUS_META[status].label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
