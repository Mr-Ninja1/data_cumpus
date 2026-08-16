"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { supabase } from "@/utils/supabaseClient";
import { useParams, useRouter } from "next/navigation";
import ProposalWorkspaceShell from "@/components/ProposalWorkspaceShell";
import { showToast } from "@/utils/toast";
import Link from "next/link";
import { isInitialProposalReady } from '@/utils/proposalFlow';
import { extractContextFromUserMessage, addContextEntry, type ProposalContext } from '@/utils/proposalContextMemory';
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
  incomplete?: boolean;
  missing_sections?: string[];
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
  diagrams?: Record<string, { pngBase64?: string; width?: number; height?: number }>;
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
  autopilot_enabled?: boolean;
  autopilot_status?: string;
};

const STAGE_CHAPTERS: Record<string, Array<{ key: string; label: string }>> = {
  initial_proposal: [
    { key: "cover_page", label: "Cover page" },
    { key: "table_of_contents", label: "Table of Contents" },
    { key: "chapter_1", label: "Chapter 1" },
    { key: "chapter_2", label: "Chapter 2" },
    { key: "chapter_3", label: "Chapter 3" },
  ],
  full_project: [
    { key: "cover_page", label: "Cover page" },
    { key: "table_of_contents", label: "Table of Contents" },
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
      incomplete: prev?.incomplete,
      missing_sections: prev?.missing_sections,
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

  const workChapters = chapters.filter(
    (chapter) => chapter.chapter_key !== "cover_page" && chapter.chapter_key !== "table_of_contents"
  );
  log.push({
    role: "assistant",
    kind: "chat",
    text: `I'll build "${project.title}" step by step: cover page → ${workChapters
      .map((chapter) => chapter.title)
      .join(" → ")} → references. The Table of Contents will auto-populate from your chapter headings as you go.`,
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
  const [workingLabel, setWorkingLabel] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
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
  const [pendingConfirmation, setPendingConfirmation] = useState<{ action: Record<string, unknown> } | null>(null);
  const [togglingAutopilot, setTogglingAutopilot] = useState(false);
  const seededProjectIdRef = useRef<string | null>(null);
  const announcedFullProjectReadyRef = useRef(false);
  const lastAutopilotStatusRef = useRef<string | null>(null);

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

  const stopWorking = () => {
    abortControllerRef.current?.abort();
  };

  // Drives the live status text in the chat composer from the actual
  // classification, not a hardcoded "editing chapter 1" placeholder —
  // updates the moment intent is known, not only once the job finishes.
  const buildWorkingLabel = (classification: { intent?: string; action?: Record<string, unknown> }, fallbackChapterKey: string): string => {
    if (classification.intent === "edit_request" && classification.action) {
      const action = classification.action as Record<string, unknown>;
      switch (action.tool) {
        case "update_metadata_field":
          return `Updating cover page — ${action.field}…`;
        case "update_front_matter_order":
          return "Updating front matter order…";
        case "insert_front_matter_page":
          return `Adding the ${action.page_type} page…`;
        case "regenerate_diagram":
          return `Redrawing the "${action.diagram_key}" diagram…`;
        case "regenerate_chapter_section":
          return `Revising ${action.section_number ? `section ${action.section_number} of ` : ""}${getChapterLabel(String(action.chapter_key || fallbackChapterKey))}…`;
        default:
          return "Applying edit…";
      }
    }
    if (classification.intent === "continue_generation") {
      return `Drafting ${getChapterLabel(fallbackChapterKey)}…`;
    }
    if (classification.intent === "question") return "Thinking…";
    if (classification.intent === "unsupported_reframe") return "Checking that…";
    if (classification.intent === "unclear") return "Thinking…";
    return "Working…";
  };

  // Direct edits made right in the preview drawer — no LLM call, no
  // credit cost, since it's the user's own typed text, not an AI request.
  const saveChapterContentDirect = async (chapterKey: string, contentMd: string) => {
    const session = await supabase.auth.getSession();
    const token = session.data.session?.access_token;
    if (!token) {
      showToast("info", "Sign in to save edits");
      return;
    }
    try {
      const res = await fetch(`/api/proposals/${params.id}/edit`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action: { tool: "set_chapter_content", chapter_key: chapterKey, content_md: contentMd } }),
      });
      const json = await res.json();
      if (json.error) {
        showToast("error", json.error);
        return;
      }
      await loadProject();
      showToast("success", "Saved");
    } catch {
      showToast("error", "Could not save edit");
    }
  };

  const saveCoverFieldDirect = async (field: string, value: string) => {
    const session = await supabase.auth.getSession();
    const token = session.data.session?.access_token;
    if (!token) {
      showToast("info", "Sign in to save edits");
      return;
    }
    try {
      const res = await fetch(`/api/proposals/${params.id}/edit`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action: { tool: "update_metadata_field", field, value } }),
      });
      const json = await res.json();
      if (json.error) {
        showToast("error", json.error);
        return;
      }
      await loadProject();
      showToast("success", "Saved");
    } catch {
      showToast("error", "Could not save edit");
    }
  };

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

    // Table of contents is auto-generated from document headings when you export.
    // Mark it complete once the required chapters for this stage exist.
    if (chapterKey === "table_of_contents") {
      const requiredChaptersForStage = currentStage === "full_project"
        ? ["cover_page", "chapter_1", "chapter_2", "chapter_3", "chapter_4", "chapter_5", "chapter_6"]
        : ["cover_page", "chapter_1", "chapter_2", "chapter_3"];
      const allChaptersPresent = requiredChaptersForStage.every(
        (key) => chapterStore.some((c) => c.chapter_key === key && c.content_md?.trim())
      );
      return allChaptersPresent ? "complete" : "pending";
    }

    const chapter = chapterStore.find((entry) => entry.chapter_key === chapterKey) as (ChapterEntry & { incomplete?: boolean }) | undefined;
    if (chapter?.content_md && chapter.incomplete) return "awaiting_input" as const;
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

      const workflow = metadata?.workflow as ProposalMetadata['workflow'];
      if (seededProjectIdRef.current !== params.id) {
        // Only jump to the "next chapter to work on" the very first time a
        // project is opened. Reloads after a generate/edit call must never
        // silently move the conversation to a different chapter — that was
        // the exact bug where replying "yes, fill those in" to an incomplete
        // chapter ended up drafting the next one instead.
        seededProjectIdRef.current = params.id;
        setMessages(buildInitialLog(json.project, chapters));
        const nextCurrentStep = workflow?.next_chapter_key || json.project?.current_step || chapters[0]?.chapter_key || "cover_page";
        setCurrentSection(
          chapters.some((chapter) => chapter.chapter_key === nextCurrentStep) ? nextCurrentStep : chapters[0]?.chapter_key || "cover_page"
        );
      } else if (!chapters.some((chapter) => chapter.chapter_key === currentSection)) {
        // The previously selected chapter no longer exists in this list
        // (e.g. stage changed) — fall back safely without jumping ahead.
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

  // While autopilot is running, poll for progress so the workspace reflects
  // background work even if this tab was left open, and surface a message
  // (plus a best-effort browser notification) the moment it finishes,
  // fails, or pauses — without requiring the user to keep asking.
  useEffect(() => {
    if (!project?.autopilot_enabled) return;
    const interval = setInterval(() => {
      void loadProject();
    }, 15000);
    return () => clearInterval(interval);
  }, [project?.autopilot_enabled, loadProject]);

  useEffect(() => {
    const status = project?.autopilot_status;
    if (!status || status === lastAutopilotStatusRef.current) {
      lastAutopilotStatusRef.current = status || null;
      return;
    }
    const previous = lastAutopilotStatusRef.current;
    lastAutopilotStatusRef.current = status;
    if (!previous) return; // don't announce on first load, only on a real transition

    if (status === "completed") {
      const text = `Autopilot finished — "${project?.title || "your proposal"}" is fully drafted. Check the messages/notifications for details, or preview it here.`;
      setMessages((m) => [...m, { role: "assistant", kind: "status", chapterKey: currentSection, text }]);
      showToast("success", "Autopilot finished your proposal");
      if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
        new Notification("Your proposal is ready", { body: text });
      }
    } else if (status === "paused_insufficient_credits") {
      setMessages((m) => [...m, { role: "assistant", kind: "clarification", text: "Autopilot paused — you're out of credits. Top up your wallet and turn autopilot back on to keep going." }]);
      showToast("info", "Autopilot paused — insufficient credits");
    } else if (status === "failed") {
      setMessages((m) => [...m, { role: "assistant", kind: "clarification", text: "Autopilot stopped after repeated errors. Check the chapter here and continue manually, or try turning it back on." }]);
      showToast("error", "Autopilot stopped");
    }
  }, [project?.autopilot_status, project?.title, currentSection]);

  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    if (Notification.permission === "default") {
      void Notification.requestPermission();
    }
  }, []);

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

    const session = await supabase.auth.getSession();
    const token = session.data.session?.access_token;
    if (!token) {
      showToast("info", "Sign in to draft with AI");
      return;
    }

    const label = getChapterLabel(currentSection);
    const trimmedInput = input.trim();
    
    // Extract context from user message for this round
    const messageContext = extractContextFromUserMessage(trimmedInput);
    const existingContext = (project?.metadata?.proposal_context as ProposalContext) || { preferences: {}, chapters_with_notes: {}, recent_decisions: [], pending_clarifications: [] };
    const updatedContext = {
      ...existingContext,
      ...messageContext,
    };

    // Skip generation for auto-generated chapters (table of contents, abstract, acknowledgement).
    // These are completed once their dependencies exist; never ask the model to draft them.
    if (["table_of_contents", "abstract", "acknowledgement"].includes(currentSection)) {
      const autoGenName = currentSection === "table_of_contents"
        ? "Table of Contents is auto-generated from your document headings when you export"
        : `${label} is auto-generated from your draft when you export`;
      if (!trimmedInput) {
        showToast("info", `${autoGenName}. No manual drafting needed.`);
        return;
      }
      // If the user typed something while viewing TOC/abstract/etc., treat it as a note/preference, not a generation request.
      setMessages((m) => [...m, { role: "user", kind: "chat", text: trimmedInput }]);
      setInput("");
      setMessages((m) => [
        ...m,
        { role: "assistant", kind: "chat", text: `Got it: "${trimmedInput}". I'll keep that in mind when assembling your final document. Feel free to continue working on the chapters, or ask me anything else about the proposal.` },
      ]);
      return;
    }

    // Resolve a pending structural-removal confirmation before anything else.
    if (pendingConfirmation) {
      const lower = trimmedInput.toLowerCase();
      const isConfirm = /\b(yes|confirm|proceed|do it|go ahead)\b/.test(lower);
      const isCancel = /\b(no|cancel|stop|don't|do not)\b/.test(lower);
      if (isConfirm || isCancel) {
        setMessages((m) => [...m, { role: "user", kind: "chat", text: trimmedInput || (isConfirm ? "Yes" : "No") }]);
        setInput("");
        if (isCancel) {
          setPendingConfirmation(null);
          setMessages((m) => [...m, { role: "assistant", kind: "chat", text: "Okay, I left the front matter order as-is." }]);
          return;
        }
        setBusy(true);
        setWorkingLabel("Updating front matter order…");
        const confirmController = new AbortController();
        abortControllerRef.current = confirmController;
        try {
          const res = await fetch(`/api/proposals/${params.id}/edit`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({ action: pendingConfirmation.action, confirmed: true }),
            signal: confirmController.signal,
          });
          const json = await res.json();
          setPendingConfirmation(null);
          if (json.error) {
            setMessages((m) => [...m, { role: "assistant", kind: "chat", text: `Error: ${json.error}` }]);
            showToast("error", json.error);
          } else {
            setMessages((m) => [...m, { role: "assistant", kind: "chat", text: "Done — front matter order updated." }]);
            await loadProject();
            showToast("success", "Updated");
          }
        } catch (err) {
          if ((err as { name?: string })?.name === "AbortError") {
            setMessages((m) => [...m, { role: "assistant", kind: "chat", text: "Cancelled." }]);
          } else {
            showToast("error", "Could not apply the edit");
          }
        } finally {
          setBusy(false);
          setWorkingLabel(null);
          abortControllerRef.current = null;
        }
        return;
      }
      // Not a clear yes/no reply — drop the pending confirmation and classify this as a new message instead.
      setPendingConfirmation(null);
    }



    // Autopilot is a control action, not a document request — catch it here
    // (in plain language) before it ever reaches chapter generation.
    if (trimmedInput) {
      const wantsAutopilotOn = /\b(autopilot|auto[- ]?pilot)\b/i.test(trimmedInput) && !/\b(stop|off|cancel|disable|turn off)\b/i.test(trimmedInput);
      const wantsAutopilotOff = /\b(autopilot|auto[- ]?pilot)\b/i.test(trimmedInput) && /\b(stop|off|cancel|disable|turn off)\b/i.test(trimmedInput);
      const wantsKeepGoing = /\b(keep (on )?(going|working)|work in the background|finish (it |this )?(automatically|on your own|by yourself)|don'?t stop until|leave it running)\b/i.test(trimmedInput);
      if (wantsAutopilotOff) {
        setMessages((m) => [...m, { role: "user", kind: "chat", text: trimmedInput }]);
        setInput("");
        await toggleAutopilot(false);
        return;
      }
      if (wantsAutopilotOn || wantsKeepGoing) {
        setMessages((m) => [...m, { role: "user", kind: "chat", text: trimmedInput }]);
        setInput("");
        await toggleAutopilot(true);
        return;
      }
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

    const promptText = trimmedInput || `Continue drafting ${label}`;
    const userDisplayText = trimmedInput || `Continue with ${label}`;
    setMessages((m) => [...m, { role: "user", kind: "chat", text: userDisplayText, attachments: uploaded }]);
    setInput("");
    setAttachments([]);

    const controller = new AbortController();
    abortControllerRef.current = controller;
    setWorkingLabel("Thinking…");

    try {
      // Classify the message before doing anything else (idea.md Section 3).
      // This is what stops "change the cover page" from silently generating
      // Chapter 1 instead.
      const classifyRes = await fetch(`/api/proposals/${params.id}/classify-intent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          message: promptText,
          currentChapterKey: currentSection,
          currentChapterTitle: label,
          availableChapters: chapterStore.map((c) => c.chapter_key).filter(Boolean),
          // So a correction like "no, I meant the original title" can be
          // resolved against what was actually just proposed/said, instead
          // of being classified with zero memory of the previous turn.
          recentMessages: messages
            .slice(-6)
            .filter((m) => m.text)
            .map((m) => ({ role: m.role, text: m.text })),
        }),
        signal: controller.signal,
      });
      const classifyJson = await classifyRes.json();
      const classification = classifyJson.classification || { intent: "continue_generation" };
      // The working label must reflect whatever chapter the classifier
      // actually resolved the request to (classification.target_chapter_key),
      // not just whatever tab happens to be open in the UI — otherwise a
      // "generate chapter 1" sent while viewing the cover page shows
      // "Drafting Cover page…" even though chapter 1 is what's really
      // being generated.
      const labelTargetKey = classification.target_chapter_key;
      const isValidLabelTarget = Boolean(labelTargetKey) && chapterStore.some((c) => c.chapter_key === labelTargetKey);
      const labelChapterKey = isValidLabelTarget ? (labelTargetKey as string) : currentSection;
      setWorkingLabel(buildWorkingLabel(classification, labelChapterKey));

      if (classification.intent === "unclear") {
        setMessages((m) => [
          ...m,
          {
            role: "assistant",
            kind: "clarification",
            text: classification.clarifying_question || "Could you clarify what you'd like me to do?",
          },
        ]);
        return;
      }

      if (classification.intent === "unsupported_reframe") {
        setMessages((m) => [
          ...m,
          {
            role: "assistant",
            kind: "chat",
            text:
              classification.unsupported_reason ||
              "I can't reliably control that from the content — it depends on the final page layout, which shifts whenever anything else changes. Try describing it in terms of a section, heading, or field instead.",
          },
        ]);
        return;
      }

      if (classification.intent === "question") {
        const askRes = await fetch(`/api/proposals/${params.id}/ask`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ message: promptText }),
          signal: controller.signal,
        });
        const askJson = await askRes.json();
        setMessages((m) => [
          ...m,
          { role: "assistant", kind: "chat", text: askJson.reply || askJson.error || "I couldn't find an answer to that." },
        ]);
        return;
      }

      if (classification.intent === "edit_request") {
        const action = classification.action;
        if (!action) {
          setMessages((m) => [
            ...m,
            {
              role: "assistant",
              kind: "clarification",
              text: 'I can tell you want to change something, but not exactly what. Could you name the field or section (e.g. "change the supervisor to ..." or "make 1.2 more concise")?',
            },
          ]);
          return;
        }
        const editRes = await fetch(`/api/proposals/${params.id}/edit`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ action }),
          signal: controller.signal,
        });
        const editJson = await editRes.json();
        if (editJson.requiresConfirmation) {
          setPendingConfirmation({ action });
          setMessages((m) => [
            ...m,
            {
              role: "assistant",
              kind: "clarification",
              text: editJson.message || 'This would remove required structure — reply "yes" to confirm or "no" to cancel.',
            },
          ]);
          return;
        }
        if (editJson.error) {
          setMessages((m) => [...m, { role: "assistant", kind: "chat", text: `Error: ${editJson.error}` }]);
          showToast("error", editJson.error);
          return;
        }
        const confirmationText =
          action.tool === "update_metadata_field"
            ? `Updated ${action.field} to "${action.value}".`
            : action.tool === "update_front_matter_order"
              ? "Updated the front matter order."
              : action.tool === "remove_front_matter_page"
                ? `Removed the ${action.page_type} page.`
              : action.tool === "insert_front_matter_page"
                ? editJson.generated
                  ? `Added and drafted the ${action.page_type} page.`
                  : `Added the ${action.page_type} page to the front matter order.`
                : action.tool === "regenerate_diagram"
                  ? `Updated the "${action.diagram_key}" diagram in ${getChapterLabel(action.chapter_key)}.`
                  : `Updated ${action.section_number ? `section ${action.section_number} of ` : ""}${getChapterLabel(action.chapter_key)}.`;
        setMessages((m) => [...m, { role: "assistant", kind: "status", chapterKey: action.chapter_key, text: confirmationText }]);
        await loadProject();
        if (action.tool === "regenerate_chapter_section" || action.tool === "regenerate_diagram" || (action.tool === "insert_front_matter_page" && editJson.generated)) {
          await loadCredits();
        }
        showToast("success", "Updated");
        return;
      }

      // continue_generation — deterministic, spec-driven. Stays on whatever
      // chapter is currently in view UNLESS the user explicitly asked to
      // move to a different one (classification.target_chapter_key), so a
      // vague "continue"/"yes" never drafts the wrong chapter.
      const targetKey = classification.target_chapter_key;
      const isValidTarget = Boolean(targetKey) && chapterStore.some((c) => c.chapter_key === targetKey);
      const effectiveChapterKey = isValidTarget ? (targetKey as string) : currentSection;
      const effectiveLabel = isValidTarget ? getChapterLabel(targetKey as string) : label;
      if (isValidTarget && targetKey !== currentSection) {
        setCurrentSection(targetKey as string);
      }

      const res = await fetch(`/api/proposals/${params.id}/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          sectionKey: effectiveChapterKey,
          chapterKey: effectiveChapterKey,
          chapterTitle: effectiveLabel,
          stage: currentStage,
          promptText,
          creditsToSpend: CREDITS_COST,
          attachments: uploaded,
          specKey,
          references: referenceInput ? [referenceInput] : [],
          context: updatedContext,
        }),
        signal: controller.signal,
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
        const readyText = json.incomplete
          ? `${effectiveLabel} drafted, but it looks like it's missing section(s) ${Array.isArray(json.missingSections) ? json.missingSections.join(", ") : "listed in the spec"} — you can ask me to fill those in.`
          : `${effectiveLabel} is ready.`;
        setMessages((m) => [...m, { role: "assistant", kind: "status", chapterKey: effectiveChapterKey, text: readyText }]);
        if (Array.isArray(json.diagramWarnings) && json.diagramWarnings.length) {
          // A diagram this chapter needed couldn't be generated reliably —
          // never let that fail silently or look like it just didn't happen.
          setMessages((m) => [
            ...m,
            {
              role: "assistant",
              kind: "clarification",
              chapterKey: effectiveChapterKey,
              text: `Heads up — ${json.diagramWarnings.length === 1 ? "a diagram" : "some diagrams"} in ${effectiveLabel} couldn't be generated reliably: ${json.diagramWarnings.join(" ")} You can ask me to try that diagram again.`,
            },
          ]);
        }
        openPreview(effectiveChapterKey);
        await loadProject();
        await loadCredits();
        
        // Store generation decision in context for next round
        if (json.responseText && project) {
          const nextContext = addContextEntry(updatedContext, {
            timestamp: new Date().toISOString(),
            type: 'ai_decision',
            chapter_key: effectiveChapterKey,
            content: `Generated ${effectiveLabel}${json.incomplete ? ' (incomplete)' : ''}.`,
            resolved: !json.incomplete,
          });
          await fetch(`/api/proposals/${params.id}/edit`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({
              action: {
                tool: 'update_metadata_field',
                field: 'proposal_context',
                value: JSON.stringify(nextContext),
              },
            }),
          }).catch(() => {}); // Fail silently — context is best-effort
        }
        
        showToast(json.incomplete ? "info" : "success", json.incomplete ? "Draft generated, but incomplete" : "Draft generated");
        // Only nudge toward the next chapter when this one is actually done
        // — never switch the conversation there automatically. The user has
        // to say so (or tap the tab) before anything about the next chapter
        // gets generated.
        if (!json.incomplete && json.nextChapterKey) {
          const nextLabel = getChapterLabel(json.nextChapterKey);
          setMessages((m) => [
            ...m,
            { role: "assistant", kind: "chat", text: `Feel free to keep discussing or tweaking ${effectiveLabel} here. Next up whenever you're ready: ${nextLabel}.` },
          ]);
        }
      } else if (json.error) {
        setMessages((m) => [...m, { role: "assistant", kind: "chat", text: `Error: ${json.error}` }]);
        showToast("error", json.error);
        if (String(json.error).toLowerCase().includes("credit")) {
          await loadCredits();
        }
      } else {
        showToast("error", "Generation failed");
      }
    } catch (err) {
      if ((err as { name?: string })?.name === "AbortError") {
        setMessages((m) => [...m, { role: "assistant", kind: "chat", text: "Cancelled." }]);
      } else {
        showToast("error", "Generation failed");
      }
    } finally {
      setBusy(false);
      setWorkingLabel(null);
      abortControllerRef.current = null;
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

  const toggleAutopilot = async (enabled: boolean) => {
    const session = await supabase.auth.getSession();
    const token = session.data.session?.access_token;
    if (!token) {
      showToast("info", "Sign in to use autopilot");
      return;
    }
    setTogglingAutopilot(true);
    try {
      const res = await fetch(`/api/proposals/${params.id}/autopilot`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ enabled }),
      });
      const json = await res.json();
      if (!res.ok) {
        showToast("error", json.error || "Could not update autopilot");
        return;
      }
      setProject(json.project);
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          kind: "chat",
          text: enabled
            ? "Autopilot is on — I'll keep drafting every remaining chapter (and finding references if needed) in the background, even if you close this tab. I'll notify you when the proposal is fully ready."
            : "Autopilot is off. I won't draft anything else until you ask.",
        },
      ]);
      showToast("success", enabled ? "Autopilot enabled" : "Autopilot disabled");
    } catch {
      showToast("error", "Could not update autopilot");
    } finally {
      setTogglingAutopilot(false);
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
        const existingCount = Array.isArray(project?.metadata?.references) ? project.metadata.references.length : 0;
        const nextCount = Array.isArray(json.project?.metadata?.references) ? json.project.metadata.references.length : existingCount;
        setProject(json.project);
        setReferenceInput("");
        showToast("success", nextCount > existingCount ? "References saved. Existing citation numbers were preserved; new references were added at the end." : "References saved");
        if (chapterStore.some((chapter) => String(chapter.content_md || '').includes('[')) && nextCount > existingCount) {
          setMessages((m) => [
            ...m,
            {
              role: "assistant",
              kind: "chat",
              text: "I kept the existing reference order so your current IEEE citation numbers stay stable. Any new references were added at the end. If you want, I can now refresh a drafted section to use any newly added sources."
            },
          ]);
        }
      }
    } catch {
      showToast("error", "Could not save references");
    }
  };

  const exportProposal = async (force = false) => {
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
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ force }),
      });
      const json = await res.json();
      if (res.status === 409 && json.requiresConfirmation) {
        setExporting(false);
        const confirmed = window.confirm(
          `${json.message}\n\nExport anyway with the missing sections left blank?`
        );
        if (confirmed) {
          await exportProposal(true);
        } else {
          setMessages((m) => [
            ...m,
            {
              role: "assistant",
              kind: "clarification",
              text: json.message || "Some chapters still have missing sections. Ask me to fill those in before exporting.",
            },
          ]);
        }
        return;
      }
      if (json.docxBase64) {
        const byteChars = atob(json.docxBase64);
        const byteNumbers = new Array(byteChars.length);
        for (let i = 0; i < byteChars.length; i++) byteNumbers[i] = byteChars.charCodeAt(i);
        const blob = new Blob([new Uint8Array(byteNumbers)], {
          type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `${(project?.title || "proposal").replace(/\s+/g, "-").toLowerCase()}.docx`;
        link.click();
        URL.revokeObjectURL(url);
        showToast("success", "Word document downloaded — ready to print or export as PDF from Word");
      } else if (json.html) {
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
      onSaveChapterContent={saveChapterContentDirect}
      onSaveCoverField={saveCoverFieldDirect}
      onSaveProject={saveProject}
      onExport={exportProposal}
      autopilotEnabled={Boolean(project.autopilot_enabled)}
      autopilotStatus={project.autopilot_status}
      togglingAutopilot={togglingAutopilot}
      onToggleAutopilot={() => toggleAutopilot(!project.autopilot_enabled)}
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
      workingLabel={workingLabel}
      onStop={stopWorking}
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
