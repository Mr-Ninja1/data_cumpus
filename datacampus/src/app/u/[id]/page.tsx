"use client";

import React, { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/utils/supabaseClient";
import PaperCard from "@/components/PaperCard";
import LoadingSkeleton from "@/components/LoadingSkeleton";
import EmptyState from "@/components/EmptyState";
import FollowButton from "@/components/FollowButton";
import { useFollow } from "@/hooks/useFollow";
import { Users, Upload } from "lucide-react";

interface Paper {
  id: string;
  school: string;
  program: string;
  type: string;
  title: string;
  uploadedAt: string;
  uploadedBy?: string | null;
}

function formatCount(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
}

export default function ChannelPage() {
  const params = useParams() as { id: string };
  const router = useRouter();
  const [name, setName] = useState("Uploader");
  const [papers, setPapers] = useState<Paper[]>([]);
  const [loading, setLoading] = useState(true);
  const { followerCount, followingCount, isSelf } = useFollow(params?.id);

  useEffect(() => {
    if (!params?.id) return;
    let mounted = true;
    (async () => {
      setLoading(true);
      const [{ data: profile }, { data, error }] = await Promise.all([
        supabase.from("profiles").select("display_name").eq("id", params.id).maybeSingle(),
        supabase
          .from("papers")
          .select("*")
          .eq("uploaded_by", params.id)
          .order("uploaded_at", { ascending: false })
          .limit(48),
      ]);

      if (!mounted) return;
      if (profile?.display_name) setName(profile.display_name);
      if (error) {
        console.warn(error.message);
        setPapers([]);
      } else {
        setPapers(
          (data || []).map((row: any) => ({
            id: row.id,
            school: row.school,
            program: row.program,
            type: row.type,
            title: row.title,
            uploadedAt: row.uploaded_at,
            uploadedBy: row.uploaded_by,
          }))
        );
      }
      setLoading(false);
    })();
    return () => {
      mounted = false;
    };
  }, [params?.id]);

  return (
    <div className="px-3 pt-4 md:px-0 md:pt-0">
      <button
        type="button"
        onClick={() => router.back()}
        className="text-sm text-gray-500 hover:text-gray-800 dark:hover:text-gray-200 mb-4"
      >
        ← Back
      </button>

      {/* YouTube-style channel header */}
      <div className="mb-6 p-4 sm:p-6 bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800">
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="h-20 w-20 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-2xl font-bold text-white shrink-0">
            {name[0]?.toUpperCase() || "U"}
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-gray-100 truncate">
              {name}
            </h1>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-sm text-gray-500 dark:text-gray-400">
              <span className="inline-flex items-center gap-1">
                <Users className="w-3.5 h-3.5" />
                {formatCount(followerCount)} subscriber{followerCount === 1 ? "" : "s"}
              </span>
              <span>·</span>
              <span>{formatCount(followingCount)} following</span>
              <span>·</span>
              <span className="inline-flex items-center gap-1">
                <Upload className="w-3.5 h-3.5" />
                {loading ? "…" : `${papers.length} upload${papers.length === 1 ? "" : "s"}`}
              </span>
            </div>
          </div>
          {!isSelf && <FollowButton userId={params.id} />}
        </div>
      </div>

      <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4 px-0.5">Videos</h2>

      {loading ? (
        <LoadingSkeleton />
      ) : papers.length === 0 ? (
        <EmptyState type="no-papers" />
      ) : (
        <>
          <div className="md:hidden divide-y divide-transparent">
            {papers.map((p) => (
              <PaperCard
                key={p.id}
                id={p.id}
                title={p.title}
                program={p.program}
                type={p.type}
                school={p.school}
                uploadedAt={p.uploadedAt}
                uploaderName={name}
                uploadedBy={params.id}
                variant="feed"
              />
            ))}
          </div>
          <div className="hidden md:grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {papers.map((p) => (
              <PaperCard
                key={p.id}
                id={p.id}
                title={p.title}
                program={p.program}
                type={p.type}
                uploadedAt={p.uploadedAt}
                uploaderName={name}
                uploadedBy={params.id}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
