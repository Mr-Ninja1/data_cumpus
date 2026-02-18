"use client";
import React, { useEffect, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/utils/supabaseClient";
import PaperCard from "@/components/PaperCard";
import CompactPaperCard from "@/components/CompactPaperCard";
import RightRecommendCard from "@/components/RightRecommendCard";
import dynamic from "next/dynamic";

const PdfViewer = dynamic(() => import("@/components/PdfViewer"), { ssr: false });

interface Paper {
  id: string;
  school: string;
  program: string;
  type: string;
  title: string;
  file_url: string;
  uploaded_at: string;
}

export default function PaperDetailPage() {
  const params = useParams() as { id: string };
  const router = useRouter();
  const [paper, setPaper] = useState<Paper | null>(null);
  const [recommended, setRecommended] = useState<Paper[]>([]);
  const [loading, setLoading] = useState(true);
  const [zoom, setZoom] = useState<number>(1);
  const viewerContainerRef = useRef<HTMLDivElement | null>(null);
  const viewerInnerRef = useRef<HTMLDivElement | null>(null);
  const [fileBuffer, setFileBuffer] = useState<string | ArrayBuffer | null>(null);

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
      }

      const { data: recs } = await supabase.from("papers").select("*").neq("id", params.id).order("uploaded_at", { ascending: false }).limit(6);
      if (mounted && recs) setRecommended(recs as Paper[]);
      setLoading(false);
    };
    load();
    return () => {
      mounted = false;
    };
  }, [params?.id]);

  useEffect(() => {
    // fetch bytes via our server proxy so the client never gets a public URL
    let mounted = true;
    // collapse sidebar (like video player mode)
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
        // Create an object URL from the bytes to avoid ArrayBuffer detach issues
        const blob = new Blob([buf], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);
        if (mounted) {
          setFileBuffer((prev) => {
            // revoke previous object URL if any
            if (typeof prev === 'string') URL.revokeObjectURL(prev);
            return url;
          });
        } else {
          // if not mounted, revoke immediately
          URL.revokeObjectURL(url);
        }
      } catch (e) {
        console.error('Failed to fetch PDF bytes', e);
      }
    }
    fetchBytes();
    return () => {
      mounted = false;
      // restore sidebar when leaving the page
      try {
        window.localStorage.setItem('sidebar-open', 'true');
      } catch (err) {}
      window.dispatchEvent(new CustomEvent('set-sidebar', { detail: { open: true } }));
    };
  }, [paper]);

  if (loading) return <div className="p-8">Loading...</div>;
  if (!paper) return <div className="p-8">Paper not found.</div>;

  // zoom is still passed as scale but there are no UI buttons per user request

  return (
    <div className="min-h-screen bg-white dark:bg-gray-900">
      <div className="w-full px-6 py-6 lg:pr-[420px]">
        <div className="grid grid-cols-[minmax(0,1fr),380px] gap-6 max-w-full">
          <main className="min-w-0">
            <div ref={viewerContainerRef} className="bg-black rounded overflow-hidden shadow-lg relative min-w-0">
              {/* viewer has no external controls to avoid exposing the native PDF UI */}

              <div className="w-full bg-black min-w-0">
                <div style={{ height: '72vh' }} className="overflow-auto min-w-0">
                  <div ref={viewerInnerRef} className="w-full min-w-0">
                          {fileBuffer ? (
                            <div className="h-[72vh]">
                              <PdfViewer fileUrl={fileBuffer} scale={zoom} />
                            </div>
                          ) : (
                            <div className="w-full h-[72vh] flex items-center justify-center text-white p-6">Preparing document for secure viewing...</div>
                          )}
                        </div>
                </div>
              </div>

              <div className="p-4 bg-white dark:bg-gray-900">
                <h1 className="text-2xl md:text-3xl font-bold mb-3">{paper.title}</h1>
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
                  <div className="flex items-center gap-4">
                    <div className="text-sm md:text-base text-gray-600 dark:text-gray-300">
                      <span className="font-semibold">{paper.program}</span>
                      <span className="mx-2">•</span>
                      <span className="text-xs md:text-sm">{new Date(paper.uploaded_at).toLocaleString()}</span>
                    </div>
                    <div className="hidden md:flex items-center gap-2">
                      <button className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-gray-800 rounded shadow text-sm md:text-base">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14 9l-6 6M8 9l6 6"/></svg>
                        <span>Like</span>
                      </button>
                      <button className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-gray-800 rounded shadow text-sm md:text-base">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 15l6-6M10 9l6 6"/></svg>
                        <span>Save</span>
                      </button>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <button onClick={() => router.back()} className="px-4 py-2 bg-gray-100 dark:bg-gray-800 rounded text-sm md:text-base">Back</button>
                  </div>
                </div>
                {/* Fixed right-side recommended panel (like YouTube's up-next) */}
                {recommended.length > 0 && (
                  <aside className="hidden lg:block fixed right-6 top-24 w-[380px] max-h-[calc(100vh-120px)] overflow-y-auto z-40">
                    <div className="p-3 bg-white dark:bg-gray-900 rounded shadow mb-4">
                      <h3 className="text-lg md:text-xl font-semibold">Up next</h3>
                      <p className="text-sm text-gray-500 dark:text-gray-400">Switch papers quickly</p>
                    </div>
                    <div className="space-y-3 px-1">
                      {recommended.map((p) => (
                        <RightRecommendCard key={p.id} id={p.id} title={p.title} program={p.program} type={p.type} file_url={p.file_url} />
                      ))}
                    </div>
                  </aside>
                )}
              </div>
            </div>

            <div className="mt-6">
              <div className="prose dark:prose-invert text-sm text-gray-700 dark:text-gray-300">This viewer displays the PDF; scroll inside the player to read the document.</div>
            </div>
          </main>

          {/* inline recommendations removed — fixed right-side panel is used instead */}
        </div>
      </div>
    </div>
  );
}
