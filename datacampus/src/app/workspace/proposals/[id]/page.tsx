"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { supabase } from "@/utils/supabaseClient";
import { useParams, useRouter } from "next/navigation";
import ProposalWorkspaceShell from "@/components/ProposalWorkspaceShell";
import { showToast } from "@/utils/toast";
import Link from "next/link";
import { isInitialProposalReady } from "@/utils/proposalFlow";
import { useProfile } from "@/hooks/useProfile";

type SchoolBranding = {
  school_name: string;
  school_short_name: string;
  default_program: string | null;
  logo_url: string | null;
};

type AttachmentRecord = { path?: string; name: string };
type ChapterEntry = {
  chapter_key: string;
  title: string;
  content_md: string;
  stage: string;
  status?: string;
};
type ReferenceEntry = {
  id?: string;
  title?: string;
  author?: string;
  year?: number | string | null;
  journal?: string;
  publisher?: string;
  url?: string;
};
type MessageKind = "chat" | "status" | "milestone_full_project" | "clarification";
type WorkspaceMessage = {
  role: string;
  text: string;
  attachments?: AttachmentRecord[];
  kind?: MessageKind;
  chapterKey?: string;
};
type ProposalMetadata = {
  stage?: string;
  workflow_mode?: 'chat_to_work' | 'classic';
  workflow?: {
    mode?: 'chat_to_work' | 'classic';
    status?: string;
    current_chapter_key?: string | null;
    next_chapter_key?: string | null;
    completed_chapter_keys?: string[];
    chapter_queue?: string[];
    initial_proposal_ready?: boolean;
    last_action?: string;
  } | null;
  spec_key?: string;
  chapters?: ChapterEntry[];
  references?: ReferenceEntry[];
  reference_lookup?: { message?: string; status?: string } | null;
  title_refined?: boolean;
  original_title?: string | null;
  [key: string]: unknown;
};
type ProposalProject = {
  id: string;
  title: string;
  department?: string | null;
  supervisor?: string | null;
  academic_year?: string | null;
  current_step?: string | null;
  metadata?: ProposalMetadata | null;
};

const STAGE_CHAPTERS: Record<string, Array<{ key: string; label: string }>> = {
  initial_proposal: [
    { key: "cover_page", label: "Cover page" },
    { key: "chapter_1", label: "Chapter 1" },
    { key: "chapter_2", label: "Chapter 2" },
    { key: "chapter_3", label: "Chapter 3" },
  ],
  full_project: [
    { key: "cover_page", label: "Cover page" },
    { key: "chapter_1", label: "Chapter 1" },
    { key: "chapter_2", label: "Chapter 2" },
    { key: "chapter_3", label: "Chapter 3" },
    { key: "chapter_4", label: "Chapter 4" },
    { key: "chapter_5", label: "Chapter 5" },
    { key: "chapter_6", label: "Chapter 6" },
  ],
};

function chaptersForStage(stage: string, existing: ChapterEntry[] = []): ChapterEntry[] {
  const defs = STAGE_CHAPTERS[stage] || STAGE_CHAPTERS.initial_proposal;
  return defs.map((chapter) => {
    const prev = existing.find((entry) => entry.chapter_key === chapter.key);
    return {
      chapter_key: chapter.key,
      title: prev?.title || chapter.label,
      content_md: prev?.content_md || "",
      stage,
      status: prev?.content_md ? "complete" : "pending",
    };
  });
}

/** Builds a short, chat-style narrative of what's already happened for this
 * project (references found, sections drafted, what's next) instead of
 * dumping raw chapter markdown into the conversation. Runs once per project. */
function buildInitialLog(project: ProposalProject, chapters: ChapterEntry[]): WorkspaceMessage[] {
  const log: WorkspaceMessage[] = [];
  const metadata = project.metadata || {};
  const lookupStatus = metadata.reference_lookup?.status;
  const referencesCount = Array.isArray(metadata.references) ? metadata.references.length : 0;

  const otherChapters = chapters.filter((chapter) => chapter.chapter_key !== "cover_page");
  log.push({
    role: "assistant",
    kind: "chat",
    text: `I'll build "${project.title}" step by step: cover page → ${otherChapters
      .map((chapter) => chapter.title)
      .join(" → ")} → references.`,
  });

  if (lookupStatus === "found" || lookupStatus === "shallow") {
    log.push({
      role: "assistant",
      kind: "status",
      chapterKey: "references",
      text: metadata.reference_lookup?.message || `Found ${referencesCount} reference(s) from your title.`,
    });
  } else if (lookupStatus === "not_found" || lookupStatus === "not_enough_title_detail") {
    log.push({
      role: "assistant",
      kind: "chat",
      text: metadata.reference_lookup?.message || "I couldn't find strong references from the title yet — you can try again or add your own.",
    });
  }

  const completedChapters = chapters.filter((chapter) => chapter.content_md && chapter.content_md.trim().length > 0);
  for (const chapter of completedChapters) {
    log.push({ role: "assistant", kind: "status", chapterKey: chapter.chapter_key, text: `${chapter.title} is ready.` });
  }

  const pendingNext = chapters.find((chapter) => !chapter.content_md || !chapter.content_md.trim().length);
  if (pendingNext) {
    log.push({ role: "assistant", kind: "chat", text: `Next up: ${pendingNext.title}. Tap Continue below whenever you're ready.` });
  } else {
    log.push({ role: "assistant", kind: "chat", text: "All required sections are drafted. Review, tweak anything via chat, or export when ready." });
  }

  return log;
}

export default function ProposalWorkspacePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { fullName, studentId, program, department } = useProfile();
  const [schoolBranding, setSchoolBranding] = useState<SchoolBranding | null>(null);
  const [project, setProject] = useState<ProposalProject | null>(null);
  const [loading, setLoading] = useState(true);
  const [authRequired, setAuthRequired] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [busy, setBusy] = useState(false);
  const [currentSection, setCurrentSection] = useState<string>("cover_page");
  const [currentStage, setCurrentStage] = useState<string>("initial_proposal");
  const [chapterStore, setChapterStore] = useState<ChapterEntry[]>([]);
  const [messages, setMessages] = useState<WorkspaceMessage[]>([]);
  const [input, setInput] = useState("");
  const [attachments, setAttachments] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [specKey, setSpecKey] = useState("default-proposal");
  const [pendingQuestion, setPendingQuestion] = useState<string | null>(null);
  const [referenceInput, setReferenceInput] = useState("");
  const [creditBalance, setCreditBalance] = useState<number | null>(null);
  const [findingReferences, setFindingReferences] = useState(false);
  const [referenceHelpMessage, setReferenceHelpMessage] = useState<string | null>(null);
  const [continuingToFullProject, setContinuingToFullProject] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewChapterKey, setPreviewChapterKey] = useState("cover_page");
  const seededProjectIdRef = useRef<string | null>(null);
  const announcedFullProjectReadyRef = useRef(false);

  useEffect(() => {
    (async () => {
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;
      if (!token) return;
      try {
        const res = await fetch("/api/workspace/school-branding", {
          headers: { Authorization: `Bearer ${token}` },
        });
        const json = await res.json();
        if (res.ok) setSchoolBranding(json);
      } catch {
        // best-effort — preview falls back to defaults if this fails
      }
    })();
  }, []);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const draftStorageKey = `proposal-draft-${params.id}`;
  const CREDITS_COST = 3;

  const openPreview = useCallback((key: string) => {
    setPreviewChapterKey(key);
    setPreviewOpen(true);
  }, []);
  const closePreview = useCallback(() => setPreviewOpen(false), []);

  const loadCredits = async () => {
    const session = await supabase.auth.getSession();
    const uid = session.data.session?.user?.id;
    if (!uid) {
      setCreditBalance(null);
      return;
    }
    const { data: wallet } = await supabase
      .from("wallets")
      .select("balance_credits")
      .eq("user_id", uid)
      .maybeSingle();
    setCreditBalance(
      typeof wallet?.balance_credits === "number" ? wallet.balance_credits : 0
    );
  };

  const getStatus = (chapterKey: string) => {
    if (busy && currentSection === chapterKey) return "generating" as const;
    if (pendingQuestion && currentSection === chapterKey) return "awaiting_input" as const;
    const chapter = chapterStore.find((entry) => entry.chapter_key === chapterKey);
    if (chapter?.content_md) return "complete" as const;
    if (chapterKey.startsWith("chapter_")) return "pending" as const;
    return "pending" as const;
  };

  useEffect(() => {
    void loadCredits();
  }, [params.id]);

  useEffect(() => {
    if (!params.id || typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(draftStorageKey);
      if (!raw) return;
      const saved = JSON.parse(raw) as {
        input?: string;
        referenceInput?: string;
        currentStage?: string;
        currentSection?: string;
      };
      if (saved.input) setInput(saved.input);
      if (saved.referenceInput) setReferenceInput(saved.referenceInput);
      if (saved.currentStage) setCurrentStage(saved.currentStage);
      if (saved.currentSection) setCurrentSection(saved.currentSection);
    } catch {
      // ignore malformed drafts
    }
  }, [draftStorageKey, params.id]);

  useEffect(() => {
    if (!params.id || typeof window === "undefined") return;
    try {
      window.localStorage.setItem(
        draftStorageKey,
        JSON.stringify({ input, referenceInput, currentStage, currentSection })
      );
    } catch {
      // ignore storage errors
    }
  }, [currentSection, currentStage, draftStorageKey, input, params.id, referenceInput]);

  const loadProject = useCallback(async () => {
    setLoading(true);
    setAuthRequired(false);
    setNotFound(false);
    const session = await supabase.auth.getSession();
    const token = session.data.session?.access_token;
    if (!token) {
      setAuthRequired(true);
      setProject(null);
      setLoading(false);
      return;
    }

    try {
      const res = await fetch(`/api/proposals/${params.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (res.status === 401) {
        setAuthRequired(true);
        setProject(null);
        return;
      }
      if (res.status === 404 || !json.project) {
        setNotFound(true);
        setProject(null);
        return;
      }
      if (!res.ok) {
        showToast("error", json.error || "Could not load proposal");
        setNotFound(true);
        return;
      }

      setProject(json.project);
      const metadata = json.project?.metadata || {};
      const stage = metadata.stage || "initial_proposal";
      const chapters = Array.isArray(metadata.chapters)
        ? chaptersForStage(stage, metadata.chapters)
        : chaptersForStage(stage);
      setChapterStore(chapters);
      setCurrentStage(stage);
      setReferenceHelpMessage(metadata?.reference_lookup?.message || null);
      if (metadata.spec_key) setSpecKey(metadata.spec_key);

      if (seededProjectIdRef.current !== params.id) {
        seededProjectIdRef.current = params.id;
        setMessages(buildInitialLog(json.project, chapters));
      }

      const workflow = metadata?.workflow as ProposalMetadata['workflow'];
      const nextCurrentStep = workflow?.next_chapter_key || json.project?.current_step || chapters[0]?.chapter_key || "cover_page";
      if (chapters.some((chapter) => chapter.chapter_key === nextCurrentStep)) {
        setCurrentSection(nextCurrentStep);
      } else if (!chapters.some((chapter) => chapter.chapter_key === currentSection)) {
        setCurrentSection(chapters[0]?.chapter_key || "cover_page");
      }
    } catch {
      showToast("error", "Could not load proposal");
      setNotFound(true);
    } finally {
      setLoading(false);
    }
  }, [currentSection, params.id]);

  useEffect(() => {
    void loadProject();
  }, [loadProject]);

  const findReferences = useCallback(async (force = false) => {
    const session = await supabase.auth.getSession();
    const token = session.data.session?.access_token;
    if (!token) return;

    setFindingReferences(true);
    try {
      const res = await fetch(`/api/proposals/${params.id}/references/suggest`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ force }),
      });
      const json = await res.json();
      setReferenceHelpMessage(json.message || null);
      if (res.ok) {
        await loadProject();
        if (Array.isArray(json.references) && json.references.length) {
          setMessages((m) => [...m, { role: "assistant", kind: "status", chapterKey: "references", text: json.message || `Found ${json.references.length} references.` }]);
          showToast("success", `Added ${json.references.length} suggested references`);
        } else if (json.message) {
          setMessages((m) => [...m, { role: "assistant", kind: "chat", text: json.message }]);
          showToast("info", json.message);
        }
      } else {
        showToast("error", json.error || json.message || "Could not find references");
      }
    } catch {
      showToast("error", "Could not find references");
    } finally {
      setFindingReferences(false);
    }
  }, [loadProject, params.id]);

  useEffect(() => {
    const existingRefs = Array.isArray(project?.metadata?.references) ? project.metadata.references : [];
    const lookupState = project?.metadata?.reference_lookup?.status;
    if (!project?.id || findingReferences) return;
    if (existingRefs.length > 0) return;
    if (["found", "shallow", "not_found", "failed", "not_enough_title_detail"].includes(String(lookupState || ""))) return;
    if (!project?.title || String(project.title).trim().length < 6) return;
    void findReferences(false);
  }, [findReferences, findingReferences, project?.id, project?.metadata, project?.title]);

  const initialProposalReady =
    Boolean(project?.metadata?.workflow?.initial_proposal_ready) ||
    isInitialProposalReady(chapterStore, project?.metadata?.references || []);

  useEffect(() => {
    if (initialProposalReady && !announcedFullProjectReadyRef.current && currentStage === "initial_proposal") {
      announcedFullProjectReadyRef.current = true;
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          kind: "milestone_full_project",
          text: "Cover page, Chapters 1–3, and references are all in place.",
        },
      ]);
    }
  }, [currentStage, initialProposalReady]);

  const sendMessage = async () => {
    if (busy) return;
    if (["table_of_contents", "abstract", "acknowledgement"].includes(currentSection)) {
      showToast("info", "The table of contents is built automatically from your drafted chapters when you export — no need to draft it separately.");
      return;
    }

    const session = await supabase.auth.getSession();
    const token = session.data.session?.access_token;
    if (!token) {
      showToast("info", "Sign in to draft with AI");
      return;
    }

    if (typeof creditBalance === "number" && creditBalance < CREDITS_COST) {
      showToast("info", "Not enough credits — top up to generate");
      router.push("/wallet");
      return;
    }

    setBusy(true);
    setPendingQuestion(null);

    const uploaded: AttachmentRecord[] = [];
    for (const f of attachments) {
      const path = `proposals/${params.id}/${Date.now()}-${f.name}`;
      const { error: upErr } = await supabase.storage.from("papers").upload(path, f, { upsert: false });
      if (!upErr) uploaded.push({ path, name: f.name });
      else showToast("error", `Could not upload ${f.name}`);
    }

    const label = getChapterLabel(currentSection);
    const trimmedInput = input.trim();
    const promptText = trimmedInput || `Continue drafting ${label}`;
    const userDisplayText = trimmedInput || `Continue with ${label}`;
    setMessages((m) => [...m, { role: "user", kind: "chat", text: userDisplayText, attachments: uploaded }]);
    setInput("");
    setAttachments([]);

    try {
      const res = await fetch(`/api/proposals/${params.id}/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          sectionKey: currentSection,
          chapterKey: currentSection,
          chapterTitle: label,
          stage: currentStage,
          promptText,
          creditsToSpend: CREDITS_COST,
          attachments: uploaded,
          specKey,
          references: referenceInput ? [referenceInput] : [],
        }),
      });
      const json = await res.json();
      if (json.status === "awaiting_input") {
        setPendingQuestion(json.question || "More detail is needed before drafting this section.");
        setMessages((m) => [
          ...m,
          { role: "assistant", kind: "clarification", text: json.question || "More detail is needed before drafting this section." },
        ]);
        return;
      }
      if (json.responseText) {
        setMessages((m) => [...m, { role: "assistant", kind: "status", chapterKey: currentSection, text: `${label} is ready.` }]);
        openPreview(currentSection);
        await loadProject();
        await loadCredits();
        showToast("success", "Draft generated");
      } else if (json.error) {
        setMessages((m) => [...m, { role: "assistant", kind: "chat", text: `Error: ${json.error}` }]);
        showToast("error", json.error);
        if (String(json.error).toLowerCase().includes("credit")) {
          await loadCredits();
        }
      } else {
        showToast("error", "Generation failed");
      }
    } catch {
      showToast("error", "Generation failed");
    } finally {
      setBusy(false);
    }
  };

  const onFileChange = (e?: React.ChangeEvent<HTMLInputElement>) => {
    const files = e?.target?.files;
    if (!files?.length) return;
    setAttachments((s) => [...s, ...Array.from(files)]);
    if (fileRef.current) fileRef.current.value = "";
  };

  const onOpenFilePicker = () => {
    fileRef.current?.click();
  };

  const saveProject = async () => {
    const session = await supabase.auth.getSession();
    const token = session.data.session?.access_token;
    if (!token || !project) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/proposals/${params.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          title: project.title,
          department: project.department,
          supervisor: project.supervisor,
          academic_year: project.academic_year,
          current_step: currentSection,
          metadata: {
            ...(project.metadata || {}),
            stage: currentStage,
            chapters: chapterStore,
            spec_key: specKey,
          },
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        showToast("error", json.error || "Save failed");
        return;
      }
      if (json.project) {
        setProject(json.project);
        const metadata = json.project?.metadata || {};
        setChapterStore(
          Array.isArray(metadata.chapters)
            ? chaptersForStage(metadata.stage || currentStage, metadata.chapters)
            : chapterStore
        );
        setCurrentStage(metadata.stage || currentStage);
        showToast("success", "Saved");
      }
    } catch {
      showToast("error", "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const saveReferences = async () => {
    const session = await supabase.auth.getSession();
    const token = session.data.session?.access_token;
    if (!token) {
      showToast("info", "Sign in to save references");
      return;
    }
    if (!referenceInput.trim()) {
      showToast("info", "Add at least one reference line");
      return;
    }
    try {
      const res = await fetch(`/api/proposals/${params.id}/references`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ references: referenceInput.split("\n").map((line) => line.trim()).filter(Boolean) }),
      });
      const json = await res.json();
      if (!res.ok) {
        showToast("error", json.error || "Could not save references");
        return;
      }
      if (json.project) {
        setProject(json.project);
        setReferenceInput("");
        showToast("success", "References saved");
      }
    } catch {
      showToast("error", "Could not save references");
    }
  };

  const exportProposal = async () => {
    const session = await supabase.auth.getSession();
    const token = session.data.session?.access_token;
    if (!token) {
      showToast("info", "Sign in to export");
      return;
    }
    setExporting(true);
    try {
      const res = await fetch(`/api/proposals/${params.id}/export`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (json.html) {
        const blob = new Blob([json.html], { type: "text/html;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `${(project?.title || "proposal").replace(/\s+/g, "-").toLowerCase()}.html`;
        link.click();
        URL.revokeObjectURL(url);
        showToast("success", "Export downloaded");
      } else if (json.markdown) {
        const blob = new Blob([json.markdown], { type: "text/markdown;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `${(project?.title || "proposal").replace(/\s+/g, "-").toLowerCase()}.md`;
        link.click();
        URL.revokeObjectURL(url);
        showToast("success", "Export downloaded");
      } else {
        showToast("error", json.error || "Export failed");
      }
    } catch {
      showToast("error", "Export failed");
    } finally {
      setExporting(false);
    }
  };

  const getChapterLabel = (chapterKey: string) => {
    const chapter = STAGE_CHAPTERS[currentStage]?.find((entry) => entry.key === chapterKey);
    return chapter?.label || chapterKey.replace(/_/g, " ");
  };

  const revertTitle = async () => {
    const originalTitle = project?.metadata?.original_title;
    if (!originalTitle || !project) return;
    const session = await supabase.auth.getSession();
    const token = session.data.session?.access_token;
    if (!token) {
      showToast("info", "Sign in to update the title");
      return;
    }
    try {
      const res = await fetch(`/api/proposals/${params.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          title: originalTitle,
          department: project.department,
          supervisor: project.supervisor,
          academic_year: project.academic_year,
          current_step: currentSection,
          metadata: { ...(project.metadata || {}), title_refined: false, original_title: null },
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        showToast("error", json.error || "Could not revert title");
        return;
      }
      if (json.project) {
        setProject(json.project);
        showToast("success", "Reverted to your original title");
      }
    } catch {
      showToast("error", "Could not revert title");
    }
  };

  const continueToFullProject = async () => {
    const session = await supabase.auth.getSession();
    const token = session.data.session?.access_token;
    if (!token) {
      showToast("info", "Sign in to continue");
      return;
    }
    setContinuingToFullProject(true);
    try {
      const res = await fetch(`/api/proposals/${params.id}/upgrade-stage`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (!res.ok) {
        showToast("error", json.error || "Could not continue to the full project yet");
        return;
      }
      setMessages((m) => [...m, { role: "assistant", kind: "chat", text: "Full project chapters unlocked. Next up: Chapter 4." }]);
      showToast("success", "Continuing to the full project — Chapters 4-6 unlocked");
      await loadProject();
      setCurrentSection("chapter_4");
    } catch {
      showToast("error", "Could not continue to the full project yet");
    } finally {
      setContinuingToFullProject(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center gap-2 text-sm text-gray-500">
        <Loader2 size={18} className="animate-spin" />
        Loading proposal…
      </div>
    );
  }

  if (authRequired) {
    return (
      <div className="mx-auto max-w-md rounded-2xl border border-dashed border-gray-300 bg-white p-8 text-center dark:border-gray-700 dark:bg-gray-900">
        <h1 className="text-lg font-semibold text-gray-900 dark:text-white">Sign in required</h1>
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
          Open this proposal after signing in so we can load your draft securely.
        </p>
        <button
          type="button"
          onClick={() => void supabase.auth.signInWithOAuth({ provider: "google" })}
          className="mt-5 inline-flex rounded-full bg-sky-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-sky-700"
        >
          Sign in with Google
        </button>
        <div className="mt-4">
          <Link href="/workspace/proposals" className="text-sm text-sky-700 hover:underline dark:text-sky-400">
            Back to proposals
          </Link>
        </div>
      </div>
    );
  }

  if (notFound || !project) {
    return (
      <div className="mx-auto max-w-md rounded-2xl border border-dashed border-gray-300 bg-white p-8 text-center dark:border-gray-700 dark:bg-gray-900">
        <h1 className="text-lg font-semibold text-gray-900 dark:text-white">Proposal not found</h1>
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
          It may have been deleted, or you don’t have access.
        </p>
        <button
          type="button"
          onClick={() => router.push("/workspace/proposals")}
          className="mt-5 inline-flex rounded-full bg-gray-900 px-5 py-2.5 text-sm font-semibold text-white"
        >
          Back to proposals
        </button>
      </div>
    );
  }

  return (
    <ProposalWorkspaceShell
      project={project}
      currentStage={currentStage}
      currentChapter={currentSection}
      chapterStore={
        chapterStore.length
          ? chapterStore
          : chaptersForStage(currentStage)
      }
      workflowMode={project.metadata?.workflow_mode || project.metadata?.workflow?.mode || 'classic'}
      coverPageData={{
        title: project.title,
        schoolName: schoolBranding?.school_name || "Zambia University College of Technology",
        program: project.department || department || program || schoolBranding?.default_program || "School of Information and Communication Technology",
        studentName: fullName || "",
        studentId: studentId || "",
        supervisor: project.supervisor || "",
        year: project.academic_year || String(new Date().getFullYear()),
        logoUrl: schoolBranding?.logo_url || null,
      }}
      specKey={specKey}
      setSpecKey={setSpecKey}
      pendingQuestion={pendingQuestion}
      messages={messages}
      input={input}
      setInput={setInput}
      attachments={attachments}
      onSend={sendMessage}
      onFileSelect={onFileChange}
      onOpenFilePicker={onOpenFilePicker}
      onSaveReferences={saveReferences}
      onSaveProject={saveProject}
      onExport={exportProposal}
      onSelectChapter={setCurrentSection}
      onRevertTitle={project.metadata?.original_title ? revertTitle : undefined}
      initialProposalReady={initialProposalReady}
      onContinueToFullProject={continueToFullProject}
      continuingToFullProject={continuingToFullProject}
      onFindReferences={() => findReferences(true)}
      findingReferences={findingReferences}
      referenceHelpMessage={referenceHelpMessage}
      referenceInput={referenceInput}
      setReferenceInput={setReferenceInput}
      saving={saving}
      exporting={exporting}
      busy={busy}
      fileRef={fileRef}
      getStatus={getStatus}
      getChapterLabel={getChapterLabel}
      creditBalance={creditBalance}
      creditsCost={CREDITS_COST}
      onTopUp={() => router.push("/wallet")}
      previewOpen={previewOpen}
      previewChapterKey={previewChapterKey}
      onOpenPreview={openPreview}
      onClosePreview={closePreview}
    />
  );
}
