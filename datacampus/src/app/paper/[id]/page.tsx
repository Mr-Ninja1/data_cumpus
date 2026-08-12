"use client";

import React, { useEffect, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import {
  ArrowLeft,
  ZoomIn,
  ZoomOut,
  Download,
  Maximize2,
  Minimize2,
  ThumbsUp,
  Bookmark,
  FileText,
  Share2,
  Flag,
  Sparkles,
} from "lucide-react";
import { supabase } from "@/utils/supabaseClient";
import RightRecommendCard from "@/components/RightRecommendCard";
import FollowButton from "@/components/FollowButton";
import VerifiedBadge from "@/components/VerifiedBadge";
import CommentsSection from "@/components/CommentsSection";
import ReportModal from "@/components/ReportModal";
import { useLibrary } from "@/hooks/useLibrary";
import { useFollow } from "@/hooks/useFollow";
import { showToast } from "@/utils/toast";
import { bumpInterest } from "@/utils/interests";
import { formatCount } from "@/utils/formatCount";
import { attachUploaders, enrichEngagement, mapPaperRow } from "@/utils/engagement";

const PdfViewer = dynamic(() => import("@/components/PdfViewer"), { ssr: false });

interface Paper {
  id: string;
  school: string;
  program: string;
  type: string;
  title: string;
  file_url: string;
  uploaded_at: string;
  uploaded_by?: string | null;
  view_count?: number | null;
  like_count?: number | null;
}

type RecPaper = {
  id: string;
  title: string;
  program: string;
  type: string;
  file_url?: string;
  uploaderName?: string | null;
  uploaderVerified?: boolean;
  viewCount?: number;
  uploadedAt?: string;
};

function relativeDate(dateString?: string) {
  if (!dateString) return "";
  const date = new Date(dateString);
  const diff = Date.now() - date.getTime();
  const days = Math.floor(diff / 86400000);
  if (days < 1) return "Today";
  if (days === 1) return "1 day ago";
  if (days < 7) return `${days} days ago`;
  if (days < 30) return `${Math.floor(days / 7)} week${days >= 14 ? "s" : ""} ago`;
  if (days < 365) return `${Math.floor(days / 30)} month${days >= 60 ? "s" : ""} ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function initials(name?: string | null) {
  if (!name) return "DC";
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

export default function PaperDetailPage() {
  const params = useParams() as { id: string };
  const router = useRouter();
  const [paper, setPaper] = useState<Paper | null>(null);
  const [recommended, setRecommended] = useState<RecPaper[]>([]);
  const [loading, setLoading] = useState(true);
  const [zoom, setZoom] = useState(1);
  const [fullscreen, setFullscreen] = useState(false);
  const [descOpen, setDescOpen] = useState(false);
  const viewerContainerRef = useRef<HTMLDivElement | null>(null);
  const [fileBuffer, setFileBuffer] = useState<string | ArrayBuffer | null>(null);
  const [uploaderName, setUploaderName] = useState<string | null>(null);
  const [uploaderRole, setUploaderRole] = useState<string | null>(null);
  const [uploaderVerified, setUploaderVerified] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [viewCount, setViewCount] = useState(0);
  const [likeCount, setLikeCount] = useState(0);
  const { isSaved, isLiked, toggleSave, toggleLike } = useLibrary();
  const { followerCount } = useFollow(paper?.uploaded_by);

  const zoomLevels = [0.5, 0.75, 1, 1.25, 1.5, 2];

  const handleZoomIn = () => {
    const i = zoomLevels.indexOf(zoom);
    if (i < zoomLevels.length - 1) setZoom(zoomLevels[i + 1]);
  };

  const handleZoomOut = () => {
    const i = zoomLevels.indexOf(zoom);
    if (i > 0) setZoom(zoomLevels[i - 1]);
  };

  const handleDownload = async () => {
    if (!fileBuffer || typeof fileBuffer !== "string") return;
    const a = document.createElement("a");
    a.href = fileBuffer;
    a.download = `${paper?.title || "paper"}.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    showToast("success", "Download started");
  };

  const handleShare = async () => {
    const url = typeof window !== "undefined" ? window.location.href : "";
    try {
      if (navigator.share) {
        await navigator.share({ title: paper?.title || "DataCampus paper", url });
      } else {
        await navigator.clipboard.writeText(url);
        showToast("success", "Link copied");
      }
    } catch {
      try {
        await navigator.clipboard.writeText(url);
        showToast("success", "Link copied");
      } catch {
        showToast("error", "Could not share link");
      }
    }
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      viewerContainerRef.current?.requestFullscreen();
      setFullscreen(true);
    } else {
      document.exitFullscreen();
      setFullscreen(false);
    }
  };

  useEffect(() => {
    const onFs = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  useEffect(() => {
    if (!params?.id) return;
    let mounted = true;
    const load = async () => {
      setLoading(true);
      setDescOpen(false);
      const { data, error } = await supabase
        .from("papers")
        .select("*")
        .eq("id", params.id)
        .limit(1)
        .single();

      if (error) {
        console.error("Error fetching paper:", error);
      } else if (data && mounted) {
        const current = data as Paper;
        setPaper(current);
        setViewCount(Number(current.view_count) || 0);
        setLikeCount(Number(current.like_count) || 0);

        const { count: likes } = await supabase
          .from("likes")
          .select("*", { count: "exact", head: true })
          .eq("paper_id", params.id);
        if (mounted && likes != null) setLikeCount((prev) => Math.max(prev, likes));

        try {
          const key = `dc:viewed:${params.id}`;
          if (sessionStorage.getItem(key) !== "1") {
            sessionStorage.setItem(key, "1");
            void fetch(`/api/papers/${params.id}/view`, { method: "POST" })
              .then((r) => r.json())
              .then((json) => {
                if (!mounted) return;
                if (typeof json.viewCount === "number") setViewCount(json.viewCount);
                else setViewCount((v) => v + 1);
              })
              .catch(() => {
                if (mounted) setViewCount((v) => v + 1);
              });
          }
        } catch {
          // ignore
        }

        bumpInterest("programs", current.program, 1);
        bumpInterest("schools", current.school, 1);
        bumpInterest("types", current.type, 1);

        if (current.uploaded_by) {
          const { data: profile } = await supabase
            .from("profiles")
            .select("display_name, full_name, role, is_verified, verification_status")
            .eq("id", current.uploaded_by)
            .maybeSingle();
          if (mounted && profile) {
            setUploaderName(profile.full_name || profile.display_name || "Uploader");
            setUploaderRole(profile.role ?? null);
            setUploaderVerified(
              Boolean(profile.is_verified) || profile.verification_status === "verified"
            );
          }
        } else if (mounted) {
          setUploaderName(null);
          setUploaderRole(null);
          setUploaderVerified(false);
        }

        const { data: byProgram } = await supabase
          .from("papers")
          .select("*")
          .neq("id", params.id)
          .eq("program", current.program)
          .order("uploaded_at", { ascending: false })
          .limit(12);

        let recs = (byProgram || []) as Paper[];
        if (recs.length < 12) {
          const { data: latest } = await supabase
            .from("papers")
            .select("*")
            .neq("id", params.id)
            .order("uploaded_at", { ascending: false })
            .limit(12);
          const seen = new Set(recs.map((r) => r.id));
          for (const row of (latest || []) as Paper[]) {
            if (!seen.has(row.id)) {
              recs.push(row);
              seen.add(row.id);
            }
            if (recs.length >= 12) break;
          }
        }

        let mapped = await enrichEngagement(
          recs.slice(0, 12).map((row) =>
            mapPaperRow({
              ...row,
              file_url: row.file_url,
              uploaded_at: row.uploaded_at,
              uploaded_by: row.uploaded_by,
              view_count: row.view_count,
              like_count: row.like_count,
            })
          )
        );
        mapped = await attachUploaders(mapped);
        if (mounted) {
          setRecommended(
            mapped.map((p) => ({
              id: p.id,
              title: p.title,
              program: p.program,
              type: p.type,
              file_url: p.fileUrl,
              uploaderName: p.uploaderName,
              uploaderVerified: p.uploaderVerified,
              viewCount: p.viewCount,
              uploadedAt: p.uploadedAt,
            }))
          );
        }
      }
      if (mounted) setLoading(false);
    };
    void load();
    return () => {
      mounted = false;
    };
  }, [params?.id]);

  useEffect(() => {
    let mounted = true;
    try {
      window.localStorage.setItem("sidebar-open", "false");
    } catch {
      // ignore
    }
    window.dispatchEvent(new CustomEvent("set-sidebar", { detail: { open: false } }));

    async function fetchBytes() {
      if (!paper) return;
      try {
        const res = await fetch(`/api/papers/${paper.id}`);
        if (!res.ok) throw new Error(await res.text().catch(() => "Failed to fetch file"));
        const buf = await res.arrayBuffer();
        const url = URL.createObjectURL(new Blob([buf], { type: "application/pdf" }));
        if (mounted) {
          setFileBuffer((prev) => {
            if (typeof prev === "string") URL.revokeObjectURL(prev);
            return url;
          });
        } else {
          URL.revokeObjectURL(url);
        }
      } catch (e) {
        console.error("Failed to fetch PDF bytes", e);
      }
    }
    void fetchBytes();

    return () => {
      mounted = false;
      try {
        window.localStorage.setItem("sidebar-open", "true");
      } catch {
        // ignore
      }
      window.dispatchEvent(new CustomEvent("set-sidebar", { detail: { open: true } }));
    };
  }, [paper]);

  const onLike = () => {
    if (!paper) return;
    const was = isLiked(paper.id);
    const ok = toggleLike(paper.id, {
      program: paper.program,
      school: paper.school,
      type: paper.type,
    });
    if (ok) setLikeCount((n) => Math.max(0, n + (was ? -1 : 1)));
  };

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="text-center">
          <FileText className="mx-auto mb-4 h-12 w-12 animate-pulse text-indigo-600 dark:text-indigo-400" />
          <p className="text-gray-600 dark:text-gray-400">Loading paper…</p>
        </div>
      </div>
    );
  }

  if (!paper) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="text-center">
          <p className="mb-4 text-gray-600 dark:text-gray-400">Paper not found.</p>
          <button
            type="button"
            onClick={() => router.back()}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-white hover:bg-indigo-700"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  const channel = uploaderName || paper.program || "DataCampus";
  const liked = isLiked(paper.id);
  const saved = isSaved(paper.id);

  const ActionPills = () => (
    <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide">
      <div className="inline-flex shrink-0 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
        <button
          type="button"
          onClick={onLike}
          className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-sm font-semibold transition-colors ${
            liked
              ? "bg-gray-900 text-white dark:bg-white dark:text-gray-900"
              : "text-gray-900 hover:bg-gray-200 dark:text-gray-100 dark:hover:bg-gray-700"
          }`}
        >
          <ThumbsUp size={16} className={liked ? "fill-current" : ""} />
          {formatCount(likeCount)}
        </button>
        <span className="w-px self-stretch bg-gray-300 dark:bg-gray-600" />
        <button
          type="button"
          onClick={() =>
            toggleSave(paper.id, {
              program: paper.program,
              school: paper.school,
              type: paper.type,
            })
          }
          className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium transition-colors ${
            saved
              ? "text-amber-700 dark:text-amber-300"
              : "text-gray-900 hover:bg-gray-200 dark:text-gray-100 dark:hover:bg-gray-700"
          }`}
          aria-label={saved ? "Unsave" : "Save"}
        >
          <Bookmark size={16} className={saved ? "fill-current" : ""} />
        </button>
      </div>

      <button
        type="button"
        onClick={() => router.push("/workspace")}
        className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-gradient-to-r from-violet-600 to-indigo-500 px-3.5 py-2 text-sm font-semibold text-white shadow-sm shadow-indigo-500/20 hover:from-violet-500 hover:to-indigo-400"
        aria-label="Work"
      >
        <Sparkles size={16} strokeWidth={2.25} />
        Work
      </button>
      <button
        type="button"
        onClick={handleShare}
        className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-gray-100 px-3.5 py-2 text-sm font-medium text-gray-900 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-100 dark:hover:bg-gray-700"
      >
        <Share2 size={16} />
        Share
      </button>
      <button
        type="button"
        onClick={handleDownload}
        disabled={!fileBuffer}
        className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-gray-100 px-3.5 py-2 text-sm font-medium text-gray-900 hover:bg-gray-200 disabled:opacity-50 dark:bg-gray-800 dark:text-gray-100 dark:hover:bg-gray-700"
      >
        <Download size={16} />
        Download
      </button>
      <button
        type="button"
        onClick={() => setShowReport(true)}
        className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-gray-100 px-3.5 py-2 text-sm font-medium text-gray-900 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-100 dark:hover:bg-gray-700"
      >
        <Flag size={16} />
        Report
      </button>
    </div>
  );

  const RecList = ({ className = "" }: { className?: string }) =>
    recommended.length === 0 ? null : (
      <div className={className}>
        <h3 className="mb-2 px-1 text-sm font-semibold text-gray-900 dark:text-gray-100 lg:hidden">
          Up next
        </h3>
        <div className="space-y-1">
          {recommended.map((p) => (
            <RightRecommendCard
              key={p.id}
              id={p.id}
              title={p.title}
              program={p.program}
              type={p.type}
              file_url={p.file_url}
              uploaderName={p.uploaderName}
              uploaderVerified={p.uploaderVerified}
              viewCount={p.viewCount}
              uploadedAt={p.uploadedAt}
            />
          ))}
        </div>
      </div>
    );

  return (
    <div className="-mx-3 bg-white dark:bg-gray-950 md:-mx-8 md:bg-transparent">
      {/* Slim top bar */}
      <div className="mb-0 flex items-center gap-2 border-b border-gray-100 px-3 py-2 dark:border-gray-900 md:mb-4 md:border-0 md:px-0 md:py-0">
        <button
          type="button"
          onClick={() => router.back()}
          className="inline-flex items-center gap-1.5 rounded-full px-2 py-1.5 text-sm text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
        >
          <ArrowLeft size={18} />
          <span className="hidden sm:inline">Back</span>
        </button>
      </div>

      <div className="flex flex-col gap-4 lg:flex-row lg:gap-6 lg:px-0">
        {/* Main column */}
        <div className="min-w-0 flex-1">
          {/* Player */}
          <div
            ref={viewerContainerRef}
            className={`relative overflow-hidden bg-black ${
              fullscreen ? "fixed inset-0 z-50" : "aspect-video w-full md:rounded-xl"
            }`}
          >
            <div
              className={`overflow-auto ${fullscreen ? "h-full" : "h-full max-h-[min(70vh,720px)]"}`}
            >
              <div className="flex min-h-full w-full justify-center">
                {fileBuffer ? (
                  <PdfViewer fileUrl={fileBuffer} scale={zoom} />
                ) : (
                  <div className="flex h-full min-h-[240px] w-full items-center justify-center p-6 text-white">
                    <div className="text-center">
                      <FileText className="mx-auto mb-3 h-10 w-10 animate-pulse" />
                      <p className="text-sm">Preparing document…</p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Viewer toolbar overlay */}
            <div className="absolute bottom-0 left-0 right-0 flex items-center justify-between bg-gradient-to-t from-black/80 to-transparent px-3 py-2">
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={handleZoomOut}
                  disabled={zoom === zoomLevels[0]}
                  className="rounded-full p-1.5 text-white/90 hover:bg-white/15 disabled:opacity-40"
                >
                  <ZoomOut size={16} />
                </button>
                <span className="w-10 text-center text-xs text-white/80">{Math.round(zoom * 100)}%</span>
                <button
                  type="button"
                  onClick={handleZoomIn}
                  disabled={zoom === zoomLevels[zoomLevels.length - 1]}
                  className="rounded-full p-1.5 text-white/90 hover:bg-white/15 disabled:opacity-40"
                >
                  <ZoomIn size={16} />
                </button>
              </div>
              <button
                type="button"
                onClick={toggleFullscreen}
                className="rounded-full p-1.5 text-white/90 hover:bg-white/15"
              >
                {fullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
              </button>
            </div>
          </div>

          {/* Meta under player — YouTube style */}
          <div className="px-3 pt-3 md:px-0">
            <h1 className="text-lg font-semibold leading-snug text-gray-900 dark:text-gray-50 sm:text-xl">
              {paper.title}
            </h1>

            <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-center gap-3">
                <button
                  type="button"
                  onClick={() => paper.uploaded_by && router.push(`/u/${paper.uploaded_by}`)}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-red-500 to-rose-600 text-sm font-bold text-white"
                >
                  {initials(channel)}
                </button>
                <div className="min-w-0">
                  <button
                    type="button"
                    onClick={() => paper.uploaded_by && router.push(`/u/${paper.uploaded_by}`)}
                    className="flex max-w-full items-center gap-1.5 text-left"
                  >
                    <span className="truncate text-sm font-semibold text-gray-900 dark:text-gray-50">
                      {channel}
                    </span>
                    <VerifiedBadge
                      role={uploaderRole}
                      isVerified={uploaderVerified}
                      size="sm"
                      className="shrink-0"
                    />
                  </button>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {formatCount(followerCount)} subscriber{followerCount === 1 ? "" : "s"}
                  </p>
                </div>
                {paper.uploaded_by && (
                  <FollowButton userId={paper.uploaded_by} size="sm" className="ml-1 shrink-0" />
                )}
              </div>

              <ActionPills />
            </div>

            {/* Description box */}
            <button
              type="button"
              onClick={() => setDescOpen((o) => !o)}
              className="mt-3 w-full rounded-xl bg-gray-100 px-3 py-2.5 text-left transition-colors hover:bg-gray-200 dark:bg-gray-900 dark:hover:bg-gray-800"
            >
              <p className="text-sm font-semibold text-gray-900 dark:text-gray-50">
                {formatCount(viewCount)} views · {relativeDate(paper.uploaded_at)}
              </p>
              <p
                className={`mt-1 text-sm text-gray-700 dark:text-gray-300 ${
                  descOpen ? "" : "line-clamp-2"
                }`}
              >
                {paper.type} · {paper.program}
                {paper.school ? ` · ${paper.school}` : ""}
                {" · "}
                Past paper / study material on DataCampus.
                {descOpen ? (
                  <>
                    <br />
                    <br />
                    Opened from campus resources. Like, save, comment, and share once you&apos;re a
                    verified student.
                  </>
                ) : null}
              </p>
              <span className="mt-1 inline-block text-sm font-semibold text-gray-900 dark:text-gray-100">
                {descOpen ? "Show less" : "...more"}
              </span>
            </button>

            {/* Comments before Up next on mobile — not buried under recommendations */}
            <div className="mt-2 lg:mt-2">
              <CommentsSection paperId={paper.id} paperTitle={paper.title} />
            </div>

            <RecList className="mt-5 lg:hidden" />
          </div>
        </div>

        {/* Desktop right rail */}
        <aside className="hidden w-full shrink-0 lg:block lg:w-[402px]">
          <RecList />
        </aside>
      </div>

      {showReport && (
        <ReportModal paperId={paper.id} onClose={() => setShowReport(false)} />
      )}
    </div>
  );
}
