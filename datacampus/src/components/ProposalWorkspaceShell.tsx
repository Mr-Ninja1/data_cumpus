"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Eye,
  FileText,
  Loader2,
  Menu,
  Paperclip,
  Send,
  Square,
  X,
  Zap,
} from "lucide-react";
import Link from "next/link";
import ProposalCoverPagePreview, { type CoverPagePreviewProps } from "@/components/ProposalCoverPagePreview";
import { renderMarkdownToHtml, type RenderedDiagramLookup } from "@/utils/markdownToHtml";
import { formatIeeeReference } from "@/utils/ieeeReferences";

type StatusTone = "pending" | "generating" | "awaiting_input" | "complete" | "failed";
type AttachmentInfo = { path?: string; name?: string };
type ChapterLike = { chapter_key: string; title?: string; content_md?: string; incomplete?: boolean; missing_sections?: string[] };
type ReferenceLike = {
  id?: string;
  title?: string;
  author?: string;
  year?: string | number | null;
  journal?: string;
  publisher?: string;
  url?: string;
};
type ProposalLike = {
  title?: string;
  department?: string | null;
  metadata?: {
    references?: ReferenceLike[];
    title_refined?: boolean;
    original_title?: string | null;
    diagrams?: Record<string, { pngBase64?: string; width?: number; height?: number }>;
  } | null;
};
type MessageKind = "chat" | "status" | "milestone_full_project" | "clarification";
type WorkspaceMessage = {
  role: string;
  text: string;
  attachments?: AttachmentInfo[];
  kind?: MessageKind;
  chapterKey?: string;
};

type WorkspaceShellProps = {
  project: ProposalLike;
  currentStage: string;
  currentChapter: string;
  chapterStore: ChapterLike[];
  workflowMode?: "chat_to_work" | "classic";
  coverPageData?: Omit<CoverPagePreviewProps, "extraNotes">;
  specKey: string;
  setSpecKey: (value: string) => void;
  pendingQuestion: string | null;
  messages: WorkspaceMessage[];
  input: string;
  setInput: (value: string) => void;
  attachments: File[];
  onSend: () => void;
  onFileSelect: (event?: React.ChangeEvent<HTMLInputElement>) => void;
  onOpenFilePicker: () => void;
  onSaveReferences: () => void;
  onSaveChapterContent?: (chapterKey: string, contentMd: string) => Promise<void>;
  onSaveCoverField?: (field: string, value: string) => Promise<void>;
  onSaveProject: () => void;
  onExport: () => void;
  onRevertTitle?: () => void;
  onSelectChapter: (value: string) => void;
  initialProposalReady?: boolean;
  onContinueToFullProject?: () => void;
  continuingToFullProject?: boolean;
  onFindReferences: () => void;
  findingReferences: boolean;
  referenceHelpMessage: string | null;
  referenceInput: string;
  setReferenceInput: (value: string) => void;
  saving: boolean;
  exporting: boolean;
  busy: boolean;
  workingLabel?: string | null;
  onStop?: () => void;
  fileRef: React.RefObject<HTMLInputElement | null>;
  getStatus: (chapterKey: string) => StatusTone;
  getChapterLabel: (chapterKey: string) => string;
  creditBalance?: number | null;
  creditsCost?: number;
  onTopUp?: () => void;
  previewOpen: boolean;
  previewChapterKey: string;
  onOpenPreview: (key: string) => void;
  onClosePreview: () => void;
  autopilotEnabled?: boolean;
  autopilotStatus?: string;
  togglingAutopilot?: boolean;
  onToggleAutopilot?: () => void;
};

const STATUS_META: Record<StatusTone, { label: string; className: string }> = {
  pending: { label: "Pending", className: "bg-slate-100 text-slate-700" },
  generating: { label: "Generating", className: "bg-amber-100 text-amber-800" },
  awaiting_input: { label: "Awaiting input", className: "bg-rose-100 text-rose-800" },
  complete: { label: "Ready", className: "bg-emerald-100 text-emerald-800" },
  failed: { label: "Failed", className: "bg-red-100 text-red-800" },
};

function MessageBubble({
  message,
  onPreview,
  onContinueToFullProject,
  continuingToFullProject,
}: {
  message: WorkspaceMessage;
  onPreview?: (key: string) => void;
  onContinueToFullProject?: () => void;
  continuingToFullProject?: boolean;
}) {
  const isUser = message.role === "user";

  if (message.kind === "milestone_full_project") {
    return (
      <div className="flex justify-start">
        <div className="max-w-[92%] rounded-2xl border border-emerald-200 bg-emerald-50 p-3.5 text-sm text-emerald-900 sm:max-w-[80%]">
          <div className="flex items-center gap-2 font-semibold">
            <CheckCircle2 size={16} /> Initial proposal complete
          </div>
          <p className="mt-1.5">{message.text}</p>
          {onContinueToFullProject ? (
            <button
              type="button"
              onClick={onContinueToFullProject}
              disabled={continuingToFullProject}
              className="mt-3 inline-flex items-center gap-2 rounded-full bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white disabled:opacity-60"
            >
              {continuingToFullProject ? <Loader2 size={13} className="animate-spin" /> : null}
              {continuingToFullProject ? "Unlocking…" : "Continue to full project"}
            </button>
          ) : null}
        </div>
      </div>
    );
  }

  if (message.kind === "clarification") {
    return (
      <div className="flex justify-start">
        <div className="max-w-[92%] rounded-2xl border border-amber-200 bg-amber-50 p-3.5 text-sm text-amber-900 sm:max-w-[80%]">
          <div className="flex items-center gap-2 font-semibold">
            <AlertCircle size={16} /> Needs a bit more detail
          </div>
          <p className="mt-1.5 whitespace-pre-wrap">{message.text}</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[92%] rounded-2xl px-3.5 py-2.5 text-sm sm:max-w-[80%] ${
          isUser
            ? "bg-slate-900 text-white"
            : message.kind === "status"
              ? "border border-sky-200 bg-sky-50 text-sky-900"
              : "bg-slate-100 text-slate-800"
        }`}
      >
        <div className="whitespace-pre-wrap">{message.text}</div>
        {message.attachments?.length ? (
          <div className="mt-1.5 text-xs opacity-70">
            Attached: {message.attachments.map((attachment) => attachment.path || attachment.name).join(", ")}
          </div>
        ) : null}
        {message.kind === "status" && message.chapterKey && onPreview ? (
          <button
            type="button"
            onClick={() => onPreview(message.chapterKey!)}
            className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-sky-300 bg-white px-3 py-1.5 text-xs font-medium text-sky-700"
          >
            <Eye size={13} /> Preview
          </button>
        ) : null}
      </div>
    </div>
  );
}

function DraftComposer({
  input,
  setInput,
  attachments,
  busy,
  chapterLabel,
  fileRef,
  onFileSelect,
  onOpenFilePicker,
  onSend,
  onStop,
  creditBalance,
  creditsCost,
  onTopUp,
}: {
  input: string;
  setInput: (value: string) => void;
  attachments: File[];
  busy: boolean;
  chapterLabel: string;
  fileRef: React.RefObject<HTMLInputElement | null>;
  onFileSelect: (event?: React.ChangeEvent<HTMLInputElement>) => void;
  onOpenFilePicker: () => void;
  onSend: () => void;
  onStop?: () => void;
  creditBalance?: number | null;
  creditsCost?: number;
  onTopUp?: () => void;
}) {
  const cost = creditsCost ?? 3;
  const lowBalance = typeof creditBalance === "number" && creditBalance < cost;
  const hasText = input.trim().length > 0;

  return (
    <div className="border-t border-slate-200 bg-white p-3 sm:p-4">
      {lowBalance ? (
        <p className="mb-2 text-xs font-medium text-amber-700">
          Balance: {creditBalance} credits — top up to keep generating.
        </p>
      ) : null}
      <div className="flex items-end gap-2">
        <input ref={fileRef} type="file" multiple onChange={(event) => onFileSelect(event)} className="hidden" />
        <button
          type="button"
          onClick={onOpenFilePicker}
          className="shrink-0 rounded-full border border-slate-300 p-2.5 text-slate-600"
          aria-label="Attach files"
          title="Attach files"
        >
          <Paperclip size={16} />
        </button>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          rows={1}
          placeholder={`Ask AI to continue with ${chapterLabel}, or describe a change…`}
          className="min-w-0 flex-1 resize-none rounded-2xl border border-slate-200 px-3.5 py-2.5 text-sm text-slate-800 outline-none focus:border-sky-300 focus:ring-2 focus:ring-sky-100"
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !busy) {
              e.preventDefault();
              if (lowBalance && onTopUp) onTopUp();
              else onSend();
            }
          }}
        />
        {lowBalance ? (
          <button
            type="button"
            onClick={() => onTopUp?.()}
            className="inline-flex shrink-0 items-center gap-2 rounded-full bg-amber-500 px-4 py-2.5 text-sm font-semibold text-white"
          >
            Top up
          </button>
        ) : (
          <button
            type="button"
            onClick={busy ? onStop : onSend}
            className={`inline-flex shrink-0 items-center gap-2 rounded-full px-4 py-2.5 text-sm font-semibold text-white ${
              busy ? "bg-rose-600" : "bg-sky-600"
            }`}
            aria-label={busy ? "Stop" : "Send"}
          >
            {busy ? <Square size={14} className="fill-current" /> : <Send size={16} />}
            {busy ? "Stop" : hasText ? "Send" : "Continue"}
          </button>
        )}
      </div>
      {attachments.length > 0 ? (
        <div className="mt-2 text-xs text-slate-600">
          Attached: {attachments.map((attachment) => attachment.name).join(", ")}
        </div>
      ) : null}
      <p className="mt-2 text-[11px] text-slate-400">
        Uses {cost} credits per generation · Enter to send, Shift+Enter for a new line
      </p>
    </div>
  );
}

const CHAPTER_NUMBER_WORDS = ['ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX'];

function chapterTocLabel(chapterKey: string, title: string): string {
  const match = chapterKey.match(/chapter_(\d+)/);
  if (!match) return (title || chapterKey).toUpperCase();
  const idx = parseInt(match[1], 10) - 1;
  const word = CHAPTER_NUMBER_WORDS[idx] ?? match[1];
  
  // If title is generic "Chapter X" or empty, don't duplicate — just use the chapter number.
  // Otherwise, append the actual chapter title (e.g., "Introduction", "Literature Review").
  const isGenericTitle = !title || title.toLowerCase() === `chapter ${match[1]}`;
  const suffix = isGenericTitle ? '' : `: ${title.toUpperCase()}`;
  return `CHAPTER ${word}${suffix}`;
}

/** Returns 1 for "1.1", 2 for "1.1.1", 3 for "1.1.1.1", etc. */
function headingSubDepth(number?: string): number {
  if (!number) return 1;
  return (number.match(/\./g) ?? []).length;
}

/** Extracts numbered and markdown headings from a chapter's markdown content. */
function extractTocHeadings(contentMd: string): Array<{ number?: string; text: string }> {
  const lines = String(contentMd || "").split(/\r?\n/);
  const headings: Array<{ number?: string; text: string }> = [];
  const seen = new Set<string>();
  const numberedPattern = /^(\d+(?:\.\d+){1,3})\s+(.{2,80})$/;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    const mdHeading = line.match(/^#{2,4}\s+(.+)$/);
    if (mdHeading) {
      const text = mdHeading[1].replace(/\*\*/g, "").trim();
      if (text && !seen.has(text)) { seen.add(text); headings.push({ text }); }
      continue;
    }

    const boldNumbered = line.match(/^\*\*(\d+(?:\.\d+){1,3})\s+([^*]+)\*\*$/);
    if (boldNumbered) {
      const text = boldNumbered[2].trim();
      if (text && !seen.has(text)) { seen.add(text); headings.push({ number: boldNumbered[1], text }); }
      continue;
    }

    const plainNumbered = line.match(numberedPattern);
    if (plainNumbered && line.length < 100) {
      const text = plainNumbered[2].trim();
      if (text && !seen.has(text)) { seen.add(text); headings.push({ number: plainNumbered[1], text }); }
    }
  }
  return headings.slice(0, 20);
}

function TocPreview({ chapterStore }: { chapterStore: ChapterLike[] }) {
  // Only show drafted chapters (not cover page or TOC itself)
  const drafted = chapterStore.filter(
    (c) =>
      c.chapter_key !== "table_of_contents" &&
      c.chapter_key !== "cover_page" &&
      c.content_md?.trim()
  );
  
  // Filter out generic "Chapter X: Chapter X" or "Chapter X: Introduction" style headings
  // that look like duplicate chapter labels, since we'll display them as the chapter title above
  const shouldSkipHeading = (heading: { number?: string; text: string }, chapterKey: string): boolean => {
    const chapterNum = chapterKey.match(/chapter_(\d+)/);
    if (!chapterNum) return false;
    const num = chapterNum[1];
    const text = heading.text.toLowerCase();
    // Skip if it's "Chapter X", "Chapter X: Introduction", etc.
    return text.startsWith(`chapter ${num}`) || text === 'chapter' || text === `introduction` && num === '1';
  };

  if (!drafted.length) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-slate-500">
          The Table of Contents is auto-built from your chapter headings. It will appear here as you complete each chapter.
        </p>
        <div className="rounded-xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-400">
          No chapters drafted yet — start with Chapter 1.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-500">
        Live preview — updates as chapters are completed. Final version auto-generates on export.
      </p>
      <div
        className="rounded-xl border border-slate-200 bg-white p-5"
        style={{ fontFamily: '"Times New Roman", Times, serif', fontSize: '12pt' }}
      >
        <p className="mb-4 text-center text-base font-bold uppercase tracking-wide text-slate-900">
          Table of Contents
        </p>
        <div className="space-y-3">
          {drafted.map((chapter) => {
            const label = chapterTocLabel(chapter.chapter_key, chapter.title || "");
            const headings = extractTocHeadings(chapter.content_md || "");
            return (
              <div key={chapter.chapter_key}>
                {/* Chapter title — ALL CAPS, bold, blue like Word heading hyperlink */}
                <div className="flex items-center gap-2">
                  <div className="font-bold text-blue-700 underline" style={{ fontSize: '11pt' }}>
                    {label}
                  </div>
                  {chapter.incomplete ? (
                    <span
                      className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800"
                      title={chapter.missing_sections?.length ? `Missing: ${chapter.missing_sections.join(', ')}` : 'Not fully drafted yet'}
                    >
                      Incomplete
                    </span>
                  ) : null}
                </div>
                {/* Section headings */}
                {headings
                  .filter((h) => !shouldSkipHeading(h, chapter.chapter_key))
                  .map((h, hi) => {
                    const depth = headingSubDepth(h.number);
                    const indentClass = depth === 1 ? "pl-5" : depth === 2 ? "pl-10" : "pl-14";
                    // depth 1 (x.x) → blue underline; depth 2+ (x.x.x / x.x.x.x) → gray, no underline
                    const colorClass = depth === 1 ? "text-blue-600 underline" : "text-slate-700";
                    return (
                      <div
                        key={hi}
                      className={`${indentClass} ${colorClass}`}
                      style={{ fontSize: '10.5pt' }}
                    >
                      {h.number ? `${h.number} ` : ""}{h.text}
                    </div>
                  );
                })}
              </div>
            );
          })}
          {/* References always at the end */}
          <div className="font-bold text-blue-700 underline" style={{ fontSize: '11pt' }}>
            REFERENCES
          </div>
        </div>
      </div>
    </div>
  );
}

function PreviewDrawer(props: {
  open: boolean;
  onClose: () => void;
  tabs: Array<{ key: string; label: string }>;
  activeKey: string;
  onSelectTab: (key: string) => void;
  coverPageData?: Omit<CoverPagePreviewProps, "extraNotes">;
  chapterStore: ChapterLike[];
  references: ReferenceLike[];
  referenceHelpMessage: string | null;
  onFindReferences: () => void;
  findingReferences: boolean;
  referenceInput: string;
  setReferenceInput: (value: string) => void;
  onSaveReferences: () => void;
  onSaveChapterContent?: (chapterKey: string, contentMd: string) => Promise<void>;
  onSaveCoverField?: (field: string, value: string) => Promise<void>;
  diagrams?: RenderedDiagramLookup;
}) {
  const [editingChapter, setEditingChapter] = useState(false);
  const [draftContent, setDraftContent] = useState("");
  const [savingChapter, setSavingChapter] = useState(false);
  const [editingCover, setEditingCover] = useState(false);
  const [coverDraft, setCoverDraft] = useState({ title: "", program: "", supervisor: "", year: "" });
  const [savingCover, setSavingCover] = useState(false);

  useEffect(() => {
    setEditingChapter(false);
    setEditingCover(false);
  }, [props.activeKey, props.open]);

  if (!props.open) return null;
  const activeChapter = props.chapterStore.find((chapter) => chapter.chapter_key === props.activeKey);
  const isCover = ["cover", "cover_page"].includes(props.activeKey);
  const isReferences = props.activeKey === "references";
  const isToc = props.activeKey === "table_of_contents";

  const startEditingChapter = () => {
    setDraftContent(activeChapter?.content_md || "");
    setEditingChapter(true);
  };
  const cancelEditingChapter = () => setEditingChapter(false);
  const saveEditingChapter = async () => {
    if (!props.onSaveChapterContent) return;
    setSavingChapter(true);
    try {
      await props.onSaveChapterContent(props.activeKey, draftContent);
      setEditingChapter(false);
    } finally {
      setSavingChapter(false);
    }
  };

  const startEditingCover = () => {
    setCoverDraft({
      title: props.coverPageData?.title || "",
      program: props.coverPageData?.program || "",
      supervisor: props.coverPageData?.supervisor || "",
      year: props.coverPageData?.year || "",
    });
    setEditingCover(true);
  };
  const cancelEditingCover = () => setEditingCover(false);
  const saveEditingCover = async () => {
    if (!props.onSaveCoverField) return;
    setSavingCover(true);
    try {
      const fieldMap: Array<[string, string]> = [
        ["title", coverDraft.title],
        ["department", coverDraft.program],
        ["supervisor", coverDraft.supervisor],
        ["academic_year", coverDraft.year],
      ];
      for (const [field, value] of fieldMap) {
        await props.onSaveCoverField(field, value);
      }
      setEditingCover(false);
    } finally {
      setSavingCover(false);
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-40 bg-slate-950/40" onClick={props.onClose} aria-hidden="true" />
      <div className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l border-slate-200 bg-white shadow-2xl sm:max-w-lg">
        <div className="flex items-center justify-between border-b border-slate-200 p-4">
          <div className="text-sm font-semibold text-slate-900">Preview</div>
          <button
            type="button"
            onClick={props.onClose}
            className="rounded-full border border-slate-200 p-1.5 text-slate-600"
            aria-label="Close preview"
          >
            <X size={16} />
          </button>
        </div>
        <div className="flex gap-2 overflow-x-auto border-b border-slate-200 p-3">
          {props.tabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => props.onSelectTab(tab.key)}
              className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium ${
                props.activeKey === tab.key
                  ? "border-sky-400 bg-sky-50 text-sky-800"
                  : "border-slate-200 bg-white text-slate-600"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        {(isCover && props.coverPageData && props.onSaveCoverField) ||
        (!isCover && !isToc && !isReferences && props.onSaveChapterContent) ? (
          <div className="flex items-center justify-end gap-2 border-b border-slate-200 px-4 py-2">
            {isCover ? (
              editingCover ? (
                <>
                  <button type="button" onClick={cancelEditingCover} className="rounded-full border border-slate-300 px-3 py-1 text-xs font-medium text-slate-700">
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={saveEditingCover}
                    disabled={savingCover}
                    className="rounded-full bg-sky-600 px-3 py-1 text-xs font-medium text-white disabled:opacity-60"
                  >
                    {savingCover ? "Saving…" : "Save"}
                  </button>
                </>
              ) : (
                <button type="button" onClick={startEditingCover} className="rounded-full border border-slate-300 px-3 py-1 text-xs font-medium text-slate-700">
                  Edit cover page
                </button>
              )
            ) : editingChapter ? (
              <>
                <button type="button" onClick={cancelEditingChapter} className="rounded-full border border-slate-300 px-3 py-1 text-xs font-medium text-slate-700">
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={saveEditingChapter}
                  disabled={savingChapter}
                  className="rounded-full bg-sky-600 px-3 py-1 text-xs font-medium text-white disabled:opacity-60"
                >
                  {savingChapter ? "Saving…" : "Save"}
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={startEditingChapter}
                disabled={!activeChapter?.content_md}
                className="rounded-full border border-slate-300 px-3 py-1 text-xs font-medium text-slate-700 disabled:opacity-40"
              >
                Edit text
              </button>
            )}
          </div>
        ) : null}
        <div className="flex-1 overflow-y-auto p-4">
          {isCover && props.coverPageData ? (
            editingCover ? (
              <div className="space-y-3">
                <label className="block text-xs font-medium text-slate-600">
                  Title
                  <input
                    value={coverDraft.title}
                    onChange={(e) => setCoverDraft((d) => ({ ...d, title: e.target.value }))}
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800"
                  />
                </label>
                <label className="block text-xs font-medium text-slate-600">
                  Program / Department
                  <input
                    value={coverDraft.program}
                    onChange={(e) => setCoverDraft((d) => ({ ...d, program: e.target.value }))}
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800"
                  />
                </label>
                <label className="block text-xs font-medium text-slate-600">
                  Supervisor
                  <input
                    value={coverDraft.supervisor}
                    onChange={(e) => setCoverDraft((d) => ({ ...d, supervisor: e.target.value }))}
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800"
                  />
                </label>
                <label className="block text-xs font-medium text-slate-600">
                  Academic year
                  <input
                    value={coverDraft.year}
                    onChange={(e) => setCoverDraft((d) => ({ ...d, year: e.target.value }))}
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800"
                  />
                </label>
                <p className="text-xs text-slate-500">
                  Student name and student ID come from your profile, not this project — update them there if needed.
                </p>
              </div>
            ) : (
              <ProposalCoverPagePreview {...props.coverPageData} extraNotes={activeChapter?.content_md || ""} />
            )
          ) : isToc ? (
            <TocPreview chapterStore={props.chapterStore} />
          ) : isReferences ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm text-slate-600">
                  Credible academic references found from your title, plus any you add.
                </p>
                <button
                  type="button"
                  onClick={props.onFindReferences}
                  disabled={props.findingReferences}
                  className="shrink-0 rounded-full border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 disabled:opacity-60"
                >
                  {props.findingReferences ? "Finding…" : "Find more"}
                </button>
              </div>
              {props.referenceHelpMessage ? (
                <div className="rounded-lg border border-cyan-200 bg-cyan-50 px-3 py-2 text-xs text-cyan-900">
                  {props.referenceHelpMessage}
                </div>
              ) : null}
              <div className="space-y-2">
                {props.references.length ? (
                  props.references.map((ref, index) => (
                    <div key={ref.id || index} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                      <div className="text-sm text-slate-800">{formatIeeeReference(ref, index)}</div>
                    </div>
                  ))
                ) : (
                  <div className="rounded-lg border border-dashed border-slate-200 px-3 py-3 text-sm text-slate-500">
                    No references yet.
                  </div>
                )}
              </div>
              <div className="space-y-2 border-t border-slate-200 pt-3">
                <label className="block text-xs font-medium text-slate-600">Add your own (one per line)</label>
                <textarea
                  value={props.referenceInput}
                  onChange={(e) => props.setReferenceInput(e.target.value)}
                  rows={2}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700"
                />
                <button
                  type="button"
                  onClick={props.onSaveReferences}
                  className="rounded-full border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700"
                >
                  Save
                </button>
              </div>
            </div>
          ) : editingChapter ? (
            <textarea
              value={draftContent}
              onChange={(e) => setDraftContent(e.target.value)}
              rows={20}
              className="w-full rounded-xl border border-slate-200 p-3 font-mono text-sm leading-relaxed text-slate-800"
            />
          ) : activeChapter?.content_md ? (
            <div
              className="proposal-doc-preview text-sm leading-relaxed text-slate-800"
              style={{ fontFamily: '"Times New Roman", Times, serif' }}
              dangerouslySetInnerHTML={{ __html: renderMarkdownToHtml(activeChapter.content_md, props.diagrams) }}
            />
          ) : (
            <div className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
              Not drafted yet. Ask AI to continue in the chat to generate this section.
            </div>
          )}
        </div>
      </div>
    </>
  );
}

export default function ProposalWorkspaceShell(props: WorkspaceShellProps) {
  const [showStructureNav, setShowStructureNav] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const { chapterStore, getChapterLabel } = props;

  const structureItems = useMemo(
    () => chapterStore.map((chapter) => ({ key: chapter.chapter_key, label: chapter.title || getChapterLabel(chapter.chapter_key) })),
    [chapterStore, getChapterLabel]
  );

  const previewTabs = useMemo(
    () => [...structureItems, { key: "references", label: "References" }],
    [structureItems]
  );

  const referencesCount = props.project.metadata?.references?.length || 0;

  const handleSelect = (key: string) => {
    props.onSelectChapter(key);
    setShowStructureNav(false);
  };

  const chapterNavRows = (onAfterSelect?: () => void) => (
    <div className="space-y-2">
      {structureItems.map((item) => {
        const status = props.getStatus(item.key);
        const isActive = props.currentChapter === item.key;
        const isReady = status === "complete";
        return (
          <div
            key={item.key}
            className={`flex items-center gap-1 rounded-xl border pr-1 ${
              isActive ? "border-sky-400 bg-sky-50" : "border-slate-200 bg-white"
            }`}
          >
            <button
              type="button"
              onClick={() => {
                handleSelect(item.key);
                onAfterSelect?.();
              }}
              className={`min-w-0 flex-1 truncate px-3 py-2 text-left text-sm ${
                isActive ? "text-sky-800" : "text-slate-700"
              }`}
            >
              {item.label}
            </button>
            <span className={`shrink-0 rounded-full px-2 py-1 text-[11px] font-medium ${STATUS_META[status].className}`}>
              {STATUS_META[status].label}
            </span>
            {isReady ? (
              <button
                type="button"
                onClick={() => props.onOpenPreview(item.key)}
                className="shrink-0 rounded-full p-1.5 text-slate-500 hover:bg-slate-100"
                aria-label={`Preview ${item.label}`}
              >
                <Eye size={14} />
              </button>
            ) : null}
          </div>
        );
      })}
      <button
        type="button"
        onClick={() => {
          props.onOpenPreview("references");
          onAfterSelect?.();
        }}
        className="flex w-full items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 hover:border-slate-300"
      >
        <span>References</span>
        <span className="text-xs text-slate-500">{referencesCount} found</span>
      </button>
      {props.currentStage === "initial_proposal" && props.initialProposalReady ? (
        <button
          type="button"
          onClick={props.onContinueToFullProject}
          disabled={props.continuingToFullProject}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
        >
          {props.continuingToFullProject ? <Loader2 size={14} className="animate-spin" /> : null}
          {props.continuingToFullProject ? "Unlocking…" : "Continue to full project"}
        </button>
      ) : null}
    </div>
  );

  const chatColumn = (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {props.messages.map((message, index) => (
          <MessageBubble
            key={`${message.role}-${index}`}
            message={message}
            onPreview={props.onOpenPreview}
            onContinueToFullProject={props.onContinueToFullProject}
            continuingToFullProject={props.continuingToFullProject}
          />
        ))}
        {props.busy ? (
          <div className="flex justify-start">
            <div className="inline-flex items-center gap-2 rounded-2xl bg-slate-100 px-3.5 py-2.5 text-sm text-slate-700">
              <Loader2 size={14} className="animate-spin" />
              {props.workingLabel || `Drafting ${props.getChapterLabel(props.currentChapter)}…`}
            </div>
          </div>
        ) : null}
        <div ref={messagesEndRef} />
      </div>
      <DraftComposer
        input={props.input}
        setInput={props.setInput}
        attachments={props.attachments}
        busy={props.busy}
        chapterLabel={props.getChapterLabel(props.currentChapter)}
        fileRef={props.fileRef}
        onFileSelect={props.onFileSelect}
        onOpenFilePicker={props.onOpenFilePicker}
        onSend={props.onSend}
        onStop={props.onStop}
        creditBalance={props.creditBalance}
        creditsCost={props.creditsCost ?? 3}
        onTopUp={props.onTopUp}
      />
    </div>
  );

  return (
    <div className="mx-auto flex h-[calc(100vh-4.5rem)] max-w-6xl flex-col px-0 py-3 sm:py-4 lg:px-0">
      <header className="mb-3 shrink-0 rounded-2xl border border-slate-200 bg-white p-3.5 shadow-sm sm:p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-1 items-start gap-2">
            <button
              type="button"
              className="mt-0.5 shrink-0 rounded-full border border-slate-200 p-2 text-slate-600 lg:hidden"
              onClick={() => setShowStructureNav(true)}
              aria-label="Open chapters"
            >
              <Menu size={16} />
            </button>
            <div className="min-w-0 flex-1">
              <Link href="/workspace/proposals" className="text-xs font-medium text-slate-500 hover:text-slate-700">
                ← Back to proposals
              </Link>
              <h1 className="min-w-0 truncate text-lg font-semibold text-slate-900 sm:text-xl">{props.project.title}</h1>
              {props.project.metadata?.title_refined && props.project.metadata?.original_title ? (
                <p className="mt-1 text-xs text-slate-500">
                  AI cleaned up your title from: <span className="italic">“{props.project.metadata.original_title}”</span>
                  {props.onRevertTitle ? (
                    <button type="button" onClick={props.onRevertTitle} className="ml-2 font-medium text-sky-700 hover:underline">
                      Undo
                    </button>
                  ) : null}
                </p>
              ) : null}
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-1.5 sm:gap-2">
            <button
              type="button"
              onClick={() => props.onOpenPreview(props.currentChapter)}
              className="inline-flex items-center gap-1.5 rounded-full border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700"
            >
              <Eye size={15} /> <span className="hidden sm:inline">Preview</span>
            </button>
            <button
              type="button"
              onClick={props.onSaveProject}
              disabled={props.saving}
              className="inline-flex items-center gap-1.5 rounded-full border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 disabled:opacity-60"
            >
              {props.saving ? <Loader2 size={14} className="animate-spin" /> : null}
              <span className="hidden sm:inline">{props.saving ? "Saving…" : "Save"}</span>
            </button>
            <button
              type="button"
              onClick={() => props.onExport()}
              disabled={props.exporting}
              className="inline-flex items-center gap-1.5 rounded-full bg-slate-900 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
            >
              {props.exporting ? <Loader2 size={14} className="animate-spin" /> : <FileText size={15} />}
              <span className="hidden sm:inline">{props.exporting ? "Preparing…" : "Export"}</span>
            </button>
            {props.onToggleAutopilot ? (
              <button
                type="button"
                onClick={props.onToggleAutopilot}
                disabled={props.togglingAutopilot}
                title={
                  props.autopilotEnabled
                    ? "Autopilot is drafting this proposal in the background — click to stop"
                    : "Let the assistant keep drafting every remaining chapter on its own, even if you close this tab"
                }
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-2 text-sm font-semibold disabled:opacity-60 ${
                  props.autopilotEnabled
                    ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                    : "border-slate-300 text-slate-700"
                }`}
              >
                {props.togglingAutopilot ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Zap size={15} className={props.autopilotEnabled ? "fill-emerald-500" : undefined} />
                )}
                <span className="hidden sm:inline">
                  {props.autopilotEnabled ? `Autopilot: ${props.autopilotStatus || "running"}` : "Autopilot"}
                </span>
              </button>
            ) : null}
          </div>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 gap-4">
        <aside className="hidden w-60 shrink-0 overflow-y-auto rounded-2xl border border-slate-200 bg-white p-3.5 shadow-sm lg:block">
          <div className="flex items-center justify-between px-1 pb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            <span>Chapters</span>
          </div>
          {chapterNavRows()}
        </aside>

        <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          {chatColumn}
        </main>
      </div>

      {showStructureNav ? (
        <div className="fixed inset-0 z-40 bg-slate-950/50 lg:hidden" onClick={() => setShowStructureNav(false)} />
      ) : null}
      <div
        className={`fixed inset-x-0 bottom-0 z-50 max-h-[80vh] overflow-auto rounded-t-2xl border border-slate-200 bg-white p-4 shadow-xl transition-transform duration-200 lg:hidden ${
          showStructureNav ? "translate-y-0" : "translate-y-full"
        }`}
      >
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold text-slate-900">Chapters</div>
          <button
            type="button"
            onClick={() => setShowStructureNav(false)}
            className="rounded-full border border-slate-200 px-2.5 py-1 text-slate-600"
          >
            <X size={16} />
          </button>
        </div>
        <div className="mt-4">{chapterNavRows(() => setShowStructureNav(false))}</div>
      </div>

      <PreviewDrawer
        open={props.previewOpen}
        onClose={props.onClosePreview}
        tabs={previewTabs}
        activeKey={props.previewChapterKey}
        onSelectTab={props.onOpenPreview}
        coverPageData={props.coverPageData}
        chapterStore={props.chapterStore}
        references={props.project.metadata?.references || []}
        referenceHelpMessage={props.referenceHelpMessage}
        onFindReferences={props.onFindReferences}
        findingReferences={props.findingReferences}
        referenceInput={props.referenceInput}
        setReferenceInput={props.setReferenceInput}
        onSaveReferences={props.onSaveReferences}
        onSaveChapterContent={props.onSaveChapterContent}
        onSaveCoverField={props.onSaveCoverField}
        diagrams={Object.fromEntries(
          Object.entries(props.project.metadata?.diagrams || {})
            .filter(([, value]) => value?.pngBase64)
            .map(([key, value]) => [key, { pngBase64: value.pngBase64 as string, width: value.width || 500, height: value.height || 300 }])
        )}
      />
    </div>
  );
}

