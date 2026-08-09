"use client";
import React, { useEffect, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/utils/supabaseClient";
import RightRecommendCard from "@/components/RightRecommendCard";
import dynamic from "next/dynamic";
import { ArrowLeft, ZoomIn, ZoomOut, Download, Maximize2, Minimize2, ThumbsUp, Bookmark, X, FileText, Share2, Flag } from "lucide-react";
import { useLibrary } from "@/hooks/useLibrary";
import { showToast } from "@/utils/toast";
import { bumpInterest } from "@/utils/interests";
import CommentsSection from "@/components/CommentsSection";
import ReportModal from "@/components/ReportModal";
import VerifiedBadge from "@/components/VerifiedBadge";

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
}

export default function PaperDetailPage() {
  const params = useParams() as { id: string };
  const router = useRouter();
  const [paper, setPaper] = useState<Paper | null>(null);
  const [recommended, setRecommended] = useState<Paper[]>([]);
  const [loading, setLoading] = useState(true);
  const [zoom, setZoom] = useState<number>(1);
  const [fullscreen, setFullscreen] = useState(false);
  const [showMobileRecs, setShowMobileRecs] = useState(false);
  const viewerContainerRef = useRef<HTMLDivElement | null>(null);
  const viewerInnerRef = useRef<HTMLDivElement | null>(null);
  const [fileBuffer, setFileBuffer] = useState<string | ArrayBuffer | null>(null);
  const [uploaderName, setUploaderName] = useState<string | null>(null);
  const [uploaderRole, setUploaderRole] = useState<string | null>(null);
  const [uploaderVerified, setUploaderVerified] = useState<boolean | null>(null);
  const [showReport, setShowReport] = useState(false);
  const { isSaved, isLiked, toggleSave, toggleLike } = useLibrary();

  const zoomLevels = [0.5, 0.75, 1, 1.25, 1.5, 2];

  const handleZoomIn = () => {
    const currentIndex = zoomLevels.indexOf(zoom);
    if (currentIndex < zoomLevels.length - 1) {
      setZoom(zoomLevels[currentIndex + 1]);
    }
  };

  const handleZoomOut = () => {
    const currentIndex = zoomLevels.indexOf(zoom);
    if (currentIndex > 0) {
      setZoom(zoomLevels[currentIndex - 1]);
    }
  };

  const handleDownload = async () => {
    if (!fileBuffer || typeof fileBuffer !== 'string') return;
    const a = document.createElement('a');
    a.href = fileBuffer;
    a.download = `${paper?.title || 'paper'}.pdf`;
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
    const handleFullscreenChange = () => {
      setFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  useEffect(() => {
    if (!params?.id) return;
    let mounted = true;
    const load = async () => {
      setLoading(true);
      const { data, error } = await supabase.from("papers").select("*").eq("id", params.id).limit(1).single();
      if (error) {
        console.error("Error fetching paper:", error);
      } else if (data && mounted) {
        setPaper(data as Paper);
        const current = data as Paper;
        // Viewing a paper is a soft interest signal (does not filter the site)
        bumpInterest("programs", current.program, 1);
        bumpInterest("schools", current.school, 1);
        bumpInterest("types", current.type, 1);

        if (current.uploaded_by) {
          const { data: profile } = await supabase
            .from("profiles")
            .select("display_name, role, is_verified")
            .eq("id", current.uploaded_by)
            .maybeSingle();
          if (mounted && profile?.display_name) setUploaderName(profile.display_name);
          if (mounted) {
            setUploaderRole(profile?.role ?? null);
            setUploaderVerified(profile?.is_verified ?? null);
          }
        }

        const { data: byProgram } = await supabase
          .from("papers")
          .select("*")
          .neq("id", params.id)
          .eq("program", current.program)
          .order("uploaded_at", { ascending: false })
          .limit(6);

        let recs = (byProgram || []) as Paper[];
        if (recs.length < 6) {
          const { data: bySchool } = await supabase
            .from("papers")
            .select("*")
            .neq("id", params.id)
            .eq("school", current.school)
            .order("uploaded_at", { ascending: false })
            .limit(6);
          const seen = new Set(recs.map((r) => r.id));
          for (const row of (bySchool || []) as Paper[]) {
            if (!seen.has(row.id)) {
              recs.push(row);
              seen.add(row.id);
            }
            if (recs.length >= 6) break;
          }
        }
        if (recs.length < 6) {
          const { data: latest } = await supabase
            .from("papers")
            .select("*")
            .neq("id", params.id)
            .order("uploaded_at", { ascending: false })
            .limit(6);
          const seen = new Set(recs.map((r) => r.id));
          for (const row of (latest || []) as Paper[]) {
            if (!seen.has(row.id)) {
              recs.push(row);
              seen.add(row.id);
            }
            if (recs.length >= 6) break;
          }
        }
        if (mounted) setRecommended(recs.slice(0, 6));
      }
      setLoading(false);
    };
    load();
    return () => {
      mounted = false;
    };
  }, [params?.id]);

  useEffect(() => {
    let mounted = true;
    try {
      window.localStorage.setItem('sidebar-open', 'false');
    } catch (err) {}
    window.dispatchEvent(new CustomEvent('set-sidebar', { detail: { open: false } }));
    async function fetchBytes() {
      if (!paper) return;
      try {
        const res = await fetch(`/api/papers/${paper.id}`);
        if (!res.ok) {
          const text = await res.text().catch(() => '(no body)');
          console.error('Failed to fetch file from server', { status: res.status, body: text });
          throw new Error('Failed to fetch file from server: ' + text);
        }
        const buf = await res.arrayBuffer();
        const blob = new Blob([buf], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);
        if (mounted) {
          setFileBuffer((prev) => {
            if (typeof prev === 'string') URL.revokeObjectURL(prev);
            return url;
          });
        } else {
          URL.revokeObjectURL(url);
        }
      } catch (e) {
        console.error('Failed to fetch PDF bytes', e);
      }
    }
    fetchBytes();
    return () => {
      mounted = false;
      try {
        window.localStorage.setItem('sidebar-open', 'true');
      } catch (err) {}
      window.dispatchEvent(new CustomEvent('set-sidebar', { detail: { open: true } }));
    };
  }, [paper]);

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950">
      <div className="text-center">
        <FileText className="w-12 h-12 text-indigo-600 dark:text-indigo-400 mx-auto mb-4 animate-pulse" />
        <p className="text-gray-600 dark:text-gray-400">Loading paper...</p>
      </div>
    </div>
  );
  if (!paper) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950">
      <div className="text-center">
        <p className="text-gray-600 dark:text-gray-400 mb-4">Paper not found.</p>
        <button onClick={() => router.back()} className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors">
          Go Back
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      {/* Mobile Header */}
      <div className="lg:hidden sticky top-0 z-50 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 px-4 py-3">
        <div className="flex items-center justify-between">
          <button onClick={() => router.back()} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors">
            <ArrowLeft className="w-5 h-5 text-gray-700 dark:text-gray-300" />
          </button>
          <h1 className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate max-w-[200px]">{paper.title}</h1>
          <button onClick={() => setShowMobileRecs(true)} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors">
            <FileText className="w-5 h-5 text-gray-700 dark:text-gray-300" />
          </button>
        </div>
      </div>

      {/* Desktop Header */}
      <div className="hidden lg:block bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button onClick={() => router.back()} className="flex items-center gap-2 px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors">
                <ArrowLeft className="w-5 h-5 text-gray-700 dark:text-gray-300" />
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Back</span>
              </button>
              <div className="h-6 w-px bg-gray-200 dark:border-gray-700" />
              <div>
                <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{paper.title}</h1>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {paper.program} • {new Date(paper.uploaded_at).toLocaleDateString()}
                  {uploaderName ? (
                    <>
                      {" · "}
                      <button
                        type="button"
                        className="text-indigo-600 dark:text-indigo-400 hover:underline inline-flex items-center"
                        onClick={() => paper.uploaded_by && router.push(`/u/${paper.uploaded_by}`)}
                      >
                        {uploaderName}
                      </button>
                      <VerifiedBadge role={uploaderRole} isVerified={uploaderVerified} size="sm" className="ml-0.5" />
                    </>
                  ) : null}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowReport(true)}
                className="flex items-center gap-2 px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors text-gray-700 dark:text-gray-300"
              >
                <Flag className="w-4 h-4" />
                <span className="text-sm">Report</span>
              </button>
              <button
                type="button"
                onClick={handleShare}
                className="flex items-center gap-2 px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors text-gray-700 dark:text-gray-300"
              >
                <Share2 className="w-4 h-4" />
                <span className="text-sm">Share</span>
              </button>
              <button
                type="button"
                onClick={() =>
                  toggleLike(paper.id, {
                    program: paper.program,
                    school: paper.school,
                    type: paper.type,
                  })
                }
                className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
                  isLiked(paper.id)
                    ? "bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300"
                    : "hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300"
                }`}
              >
                <ThumbsUp className="w-4 h-4" />
                <span className="text-sm">Like</span>
              </button>
              <button
                type="button"
                onClick={() =>
                  toggleSave(paper.id, {
                    program: paper.program,
                    school: paper.school,
                    type: paper.type,
                  })
                }
                className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
                  isSaved(paper.id)
                    ? "bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300"
                    : "hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300"
                }`}
              >
                <Bookmark className="w-4 h-4" />
                <span className="text-sm">Save</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row">
        {/* Main Viewer Area */}
        <div className="flex-1 lg:flex-none lg:w-[calc(100%-400px)]">
          {/* Toolbar */}
          <div className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 px-4 py-2">
            <div className="flex items-center justify-between max-w-7xl mx-auto">
              <div className="flex items-center gap-2">
                <button onClick={handleZoomOut} disabled={zoom === zoomLevels[0]} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed" title="Zoom out">
                  <ZoomOut className="w-4 h-4 text-gray-700 dark:text-gray-300" />
                </button>
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300 w-12 text-center">{Math.round(zoom * 100)}%</span>
                <button onClick={handleZoomIn} disabled={zoom === zoomLevels[zoomLevels.length - 1]} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed" title="Zoom in">
                  <ZoomIn className="w-4 h-4 text-gray-700 dark:text-gray-300" />
                </button>
                <div className="h-4 w-px bg-gray-200 dark:border-gray-700 mx-2" />
                <button onClick={toggleFullscreen} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors" title="Toggle fullscreen">
                  {fullscreen ? <Minimize2 className="w-4 h-4 text-gray-700 dark:text-gray-300" /> : <Maximize2 className="w-4 h-4 text-gray-700 dark:text-gray-300" />}
                </button>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={handleDownload} disabled={!fileBuffer} className="flex items-center gap-2 px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed" title="Download PDF">
                  <Download className="w-4 h-4" />
                  <span className="hidden sm:inline text-sm font-medium">Download</span>
                </button>
              </div>
            </div>
          </div>

          {/* PDF Viewer */}
          <div ref={viewerContainerRef} className={`bg-gray-900 ${fullscreen ? 'fixed inset-0 z-50' : ''}`}>
            <div className="w-full bg-gray-900">
              <div style={{ height: fullscreen ? '100vh' : 'calc(100vh - 120px)' }} className="overflow-auto">
                <div ref={viewerInnerRef} className="w-full flex justify-center">
                  {fileBuffer ? (
                    <div className={`${fullscreen ? 'h-full' : 'min-h-[calc(100vh-120px)]'}`}>
                      <PdfViewer fileUrl={fileBuffer} scale={zoom} />
                    </div>
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-white p-6">
                      <div className="text-center">
                        <FileText className="w-12 h-12 mx-auto mb-4 animate-pulse" />
                        <p>Preparing document for secure viewing...</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Mobile Paper Info — YouTube action row */}
          <div className="lg:hidden bg-white dark:bg-gray-950 px-3 pt-3 pb-4">
            <h2 className="text-[18px] font-semibold leading-snug text-gray-900 dark:text-gray-50 mb-1">
              {paper.title}
            </h2>
            <p className="text-[13px] text-gray-500 dark:text-gray-400 mb-3">
              {uploaderName ? `${uploaderName} · ` : ""}
              {paper.program}
              {" · "}
              {new Date(paper.uploaded_at).toLocaleDateString()}
            </p>
            <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1">
              <button
                type="button"
                onClick={() =>
                  toggleLike(paper.id, {
                    program: paper.program,
                    school: paper.school,
                    type: paper.type,
                  })
                }
                className={`flex-shrink-0 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full text-[13px] font-medium ${
                  isLiked(paper.id)
                    ? "bg-gray-900 dark:bg-white text-white dark:text-gray-900"
                    : "bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200"
                }`}
              >
                <ThumbsUp className="w-4 h-4" />
                Like
              </button>
              <button
                type="button"
                onClick={() =>
                  toggleSave(paper.id, {
                    program: paper.program,
                    school: paper.school,
                    type: paper.type,
                  })
                }
                className={`flex-shrink-0 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full text-[13px] font-medium ${
                  isSaved(paper.id)
                    ? "bg-gray-900 dark:bg-white text-white dark:text-gray-900"
                    : "bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200"
                }`}
              >
                <Bookmark className="w-4 h-4" />
                Save
              </button>
              <button
                type="button"
                onClick={handleShare}
                className="flex-shrink-0 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full text-[13px] font-medium bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200"
              >
                <Share2 className="w-4 h-4" />
                Share
              </button>
              <button
                type="button"
                onClick={handleDownload}
                disabled={!fileBuffer}
                className="flex-shrink-0 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full text-[13px] font-medium bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200 disabled:opacity-50"
              >
                <Download className="w-4 h-4" />
                Download
              </button>
              <button
                type="button"
                onClick={() => setShowReport(true)}
                className="flex-shrink-0 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full text-[13px] font-medium bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200"
              >
                <Flag className="w-4 h-4" />
                Report
              </button>
            </div>
          </div>
        </div>

        {/* Desktop Right Sidebar - Recommendations */}
        {recommended.length > 0 && (
          <aside className="hidden lg:block w-[400px] bg-white dark:bg-gray-900 border-l border-gray-200 dark:border-gray-800 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 73px)' }}>
            <div className="p-4">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-1">Up next</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">Switch papers quickly</p>
              <div className="space-y-3">
                {recommended.map((p) => (
                  <RightRecommendCard key={p.id} id={p.id} title={p.title} program={p.program} type={p.type} file_url={p.file_url} />
                ))}
              </div>
            </div>
          </aside>
        )}
      </div>

      <CommentsSection paperId={paper.id} paperTitle={paper.title} />

      {showReport && (
        <ReportModal paperId={paper.id} onClose={() => setShowReport(false)} />
      )}

      {/* Mobile Recommendations Modal */}
      {showMobileRecs && recommended.length > 0 && (
        <div className="lg:hidden fixed inset-0 z-50 bg-black/50 backdrop-blur-sm">
          <div className="absolute bottom-0 left-0 right-0 bg-white dark:bg-gray-900 rounded-t-2xl max-h-[70vh] overflow-y-auto">
            <div className="p-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Up next</h3>
                <button onClick={() => setShowMobileRecs(false)} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg">
                  <X className="w-5 h-5 text-gray-700 dark:text-gray-300" />
                </button>
              </div>
              <div className="space-y-3">
                {recommended.map((p) => (
                  <RightRecommendCard key={p.id} id={p.id} title={p.title} program={p.program} type={p.type} file_url={p.file_url} />
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
