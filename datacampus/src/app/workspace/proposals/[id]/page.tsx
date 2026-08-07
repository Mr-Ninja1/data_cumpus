"use client";

import React, { useEffect, useState, useRef } from "react";
import { supabase } from "@/utils/supabaseClient";
import { useParams, useRouter } from "next/navigation";
import ProposalWorkspaceShell from "@/components/ProposalWorkspaceShell";

const STAGE_OPTIONS = [
  { value: "initial_proposal", label: "Initial proposal" },
  { value: "full_project", label: "Full project" },
];

const STAGE_CHAPTERS: Record<string, Array<{ key: string; label: string }>> = {
  initial_proposal: [
    { key: "chapter_1", label: "Chapter 1" },
    { key: "chapter_2", label: "Chapter 2" },
    { key: "chapter_3", label: "Chapter 3" },
  ],
  full_project: [
    { key: "chapter_1", label: "Chapter 1" },
    { key: "chapter_2", label: "Chapter 2" },
    { key: "chapter_3", label: "Chapter 3" },
    { key: "chapter_4", label: "Chapter 4" },
    { key: "chapter_5", label: "Chapter 5" },
    { key: "chapter_6", label: "Chapter 6" },
  ],
};

export default function ProposalWorkspacePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [project, setProject] = useState<any>(null);
  const [sections, setSections] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [currentSection, setCurrentSection] = useState<string>("chapter_1");
  const [currentStage, setCurrentStage] = useState<string>("initial_proposal");
  const [chapterStore, setChapterStore] = useState<any[]>([]);
  const [messages, setMessages] = useState<Array<{ role: string; text: string; attachments?: any[] }>>([]);
  const [input, setInput] = useState("");
  const [attachments, setAttachments] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [specKey, setSpecKey] = useState('default-proposal');
  const [pendingQuestion, setPendingQuestion] = useState<string | null>(null);
  const [referenceInput, setReferenceInput] = useState('');
  const fileRef = useRef<HTMLInputElement | null>(null);

  const getStatus = (chapterKey: string) => {
    if (pendingQuestion && currentSection === chapterKey) return 'awaiting_input' as const;
    const chapter = chapterStore.find((entry) => entry.chapter_key === chapterKey);
    if (chapter?.content_md) return 'complete' as const;
    return 'pending' as const;
  };

  useEffect(() => {
    void loadProject();
  }, [params.id]);

  useEffect(() => {
    const chapter = chapterStore.find((entry) => entry.chapter_key === currentSection);
    if (chapter?.content_md) {
      setMessages([{ role: 'assistant', text: chapter.content_md }]);
    } else {
      setMessages([]);
    }
  }, [chapterStore, currentSection]);

  const loadProject = async () => {
    setLoading(true);
    const session = await supabase.auth.getSession();
    const token = session.data.session?.access_token;
    if (!token) {
      setLoading(false);
      return;
    }

    const res = await fetch(`/api/proposals/${params.id}`, { headers: { Authorization: `Bearer ${token}` } });
    const json = await res.json();
    if (json.project) {
      setProject(json.project);
      setSections(json.sections ?? []);
      const metadata = json.project?.metadata || {};
      setChapterStore(Array.isArray(metadata.chapters) ? metadata.chapters : []);
      setCurrentStage(metadata.stage || 'initial_proposal');
      const stageChapters = STAGE_CHAPTERS[metadata.stage || 'initial_proposal'] || STAGE_CHAPTERS.initial_proposal;
      if (!stageChapters.some((chapter) => chapter.key === currentSection)) {
        setCurrentSection(stageChapters[0].key);
      }
    }
    setLoading(false);
  };

  const sendMessage = async () => {
    if (!input.trim() && attachments.length === 0) return;
    const session = await supabase.auth.getSession();
    const token = session.data.session?.access_token;
    if (!token) return;
    setBusy(true);

    // upload attachments first
    const uploaded: any[] = [];
    for (const f of attachments) {
      const path = `proposals/${params.id}/${Date.now()}-${f.name}`;
      const { error: upErr } = await supabase.storage.from('papers').upload(path, f, { upsert: false });
      if (!upErr) uploaded.push({ path });
    }

    // optimistic UI
    const userMsg = { role: 'user', text: input, attachments: uploaded };
    setMessages((m) => [...m, userMsg]);
    setInput('');
    setAttachments([]);

    const res = await fetch(`/api/proposals/${params.id}/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ sectionKey: currentSection, chapterKey: currentSection, chapterTitle: getChapterLabel(currentSection), stage: currentStage, promptText: input || `Expand ${getChapterLabel(currentSection)}`, creditsToSpend: 3, attachments: uploaded, specKey, references: referenceInput ? [referenceInput] : [] }),
    });
    const json = await res.json();
    setBusy(false);
    if (json.status === 'awaiting_input') {
      setPendingQuestion(json.question || 'More detail is needed before drafting this section.');
      setMessages((m) => [...m, { role: 'assistant', text: json.question || 'More detail is needed before drafting this section.' }]);
      setInput('');
      return;
    }
    if (json.responseText) {
      setMessages((m) => [...m, { role: 'assistant', text: json.responseText, attachments: uploaded }]);
      await loadProject();
    } else if (json.error) {
      setMessages((m) => [...m, { role: 'assistant', text: 'Error: ' + (json.error || 'generation failed') }]);
    }
  };

  const onFileChange = (e?: React.ChangeEvent<HTMLInputElement>) => {
    const files = e?.target?.files;
    if (!files) return;
    setAttachments((s) => [...s, ...Array.from(files)]);
    if (fileRef.current) fileRef.current.value = '';
  };

  const saveProject = async () => {
    const session = await supabase.auth.getSession();
    const token = session.data.session?.access_token;
    if (!token || !project) return;
    setSaving(true);
    const res = await fetch(`/api/proposals/${params.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        title: project.title,
        department: project.department,
        supervisor: project.supervisor,
        academic_year: project.academic_year,
        current_step: currentSection,
      }),
    });
    const json = await res.json();
    if (json.project) {
      setProject(json.project);
      const metadata = json.project?.metadata || {};
      setChapterStore(Array.isArray(metadata.chapters) ? metadata.chapters : []);
      setCurrentStage(metadata.stage || currentStage);
    }
    setSaving(false);
  };

  const saveReferences = async () => {
    const session = await supabase.auth.getSession();
    const token = session.data.session?.access_token;
    if (!token) return;
    const res = await fetch(`/api/proposals/${params.id}/references`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ references: referenceInput ? [referenceInput] : [] }),
    });
    const json = await res.json();
    if (json.project) {
      setProject(json.project);
      setReferenceInput('');
    }
  };

  const exportProposal = async () => {
    const session = await supabase.auth.getSession();
    const token = session.data.session?.access_token;
    if (!token) return;
    setExporting(true);
    const res = await fetch(`/api/proposals/${params.id}/export`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
    const json = await res.json();
    setExporting(false);
    if (json.html) {
      const blob = new Blob([json.html], { type: 'text/html;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${(project?.title || 'proposal').replace(/\s+/g, '-').toLowerCase()}.html`;
      link.click();
      URL.revokeObjectURL(url);
    } else if (json.markdown) {
      const blob = new Blob([json.markdown], { type: 'text/markdown;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${(project?.title || 'proposal').replace(/\s+/g, '-').toLowerCase()}.md`;
      link.click();
      URL.revokeObjectURL(url);
    } else if (json.error) {
      alert(json.error);
    }
  };

  const getChapterLabel = (chapterKey: string) => {
    const chapter = STAGE_CHAPTERS[currentStage].find((entry) => entry.key === chapterKey);
    return chapter?.label || chapterKey.replace(/_/g, ' ');
  };

  const handleStageChange = (stage: string) => {
    setCurrentStage(stage);
    const stageChapters = STAGE_CHAPTERS[stage] || STAGE_CHAPTERS.initial_proposal;
    setCurrentSection(stageChapters[0].key);
  };

  if (loading) return <div className="p-6 text-sm text-gray-500">Loading proposal...</div>;
  if (!project) return <div className="p-6 text-sm text-gray-500">Proposal not found.</div>;

  return (
    <ProposalWorkspaceShell
      project={project}
      currentStage={currentStage}
      currentChapter={currentSection}
      chapterStore={chapterStore.length ? chapterStore : STAGE_CHAPTERS[currentStage].map((chapter) => ({ chapter_key: chapter.key, title: chapter.label, content_md: '' }))}
      specKey={specKey}
      setSpecKey={setSpecKey}
      pendingQuestion={pendingQuestion}
      messages={messages}
      input={input}
      setInput={setInput}
      attachments={attachments}
      onSend={sendMessage}
      onFileSelect={onFileChange}
      onSaveReferences={saveReferences}
      onSaveProject={saveProject}
      onExport={exportProposal}
      onStageChange={handleStageChange}
      onSelectChapter={setCurrentSection}
      referenceInput={referenceInput}
      setReferenceInput={setReferenceInput}
      saving={saving}
      exporting={exporting}
      busy={busy}
      fileRef={fileRef}
      getStatus={getStatus}
      getChapterLabel={getChapterLabel}
    />
  );
}
