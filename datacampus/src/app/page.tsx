"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/utils/supabaseClient";
import PaperCard from "@/components/PaperCard";
import PaperFilters from "@/components/PaperFilters";
import LoadingSkeleton from "@/components/LoadingSkeleton";
import EmptyState from "@/components/EmptyState";
import VerifiedBadge from "@/components/VerifiedBadge";
import { usePreferences } from "@/hooks/usePreferences";
import { softRankPapers, topInterestPrograms } from "@/utils/interests";
import { fetchFollowingIds } from "@/hooks/useFollow";
import { enrichEngagement, mapPaperRow, attachUploaders } from "@/utils/engagement";
import { Bell, FileText, Sparkles, SlidersHorizontal } from "lucide-react";

interface SpotlightProfile {
  id: string;
  displayName: string | null;
  role: string | null;
  isVerified: boolean | null;
}

const SPOTLIGHT_GRADIENTS = [
  "from-indigo-500 to-purple-500",
  "from-emerald-500 to-teal-500",
  "from-amber-500 to-orange-500",
  "from-pink-500 to-rose-500",
  "from-sky-500 to-blue-500",
  "from-violet-500 to-fuchsia-500",
];

function spotlightGradientFor(id: string) {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return SPOTLIGHT_GRADIENTS[hash % SPOTLIGHT_GRADIENTS.length];
}

interface Paper {
  id: string;
  school: string;
  program: string;
  type: string;
  title: string;
  fileUrl: string;
  uploadedAt: any;
  uploadedBy?: string | null;
  uploaderName?: string | null;
  uploaderRole?: string | null;
  uploaderVerified?: boolean | null;
  viewCount?: number;
  likeCount?: number;
}

export default function HomePage() {
  const router = useRouter();
  const [papers, setPapers] = useState<Paper[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSchool, setSelectedSchool] = useState("");
  const [selectedProgram, setSelectedProgram] = useState("");
  const [selectedType, setSelectedType] = useState("");
  const [showDesktopFilters, setShowDesktopFilters] = useState(false);
  const [subscriptionFeed, setSubscriptionFeed] = useState<Paper[]>([]);
  const [spotlightProfiles, setSpotlightProfiles] = useState<SpotlightProfile[]>([]);
  const [interestPrograms, setInterestPrograms] = useState<string[]>([]);
  const { preferences } = usePreferences();

  // Defer localStorage-backed chips until after mount to avoid SSR hydration mismatch.
  useEffect(() => {
    setInterestPrograms(topInterestPrograms(3));
  }, []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await fetch("/api/social/spotlight");
        const json = await res.json();
        if (!mounted) return;
        if (Array.isArray(json?.profiles)) {
          setSpotlightProfiles(json.profiles);
        }
      } catch {
        // Fail silently — this is decorative, non-critical content.
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    // Soft model: never auto-lock filters from preferences.
    // Prefs only gently re-rank the feed (see softRankPapers below).
    const fetchPapers = async () => {
      setLoading(true);
      const [{ data, error }, countRes] = await Promise.all([
        supabase.from("papers").select("*").order("uploaded_at", { ascending: false }).limit(48),
        supabase.from("papers").select("*", { count: "exact", head: true }),
      ]);

      if (error) {
        console.error("Error fetching papers:", error.message);
        setPapers([]);
      } else if (data) {
        let mapped = data.map((row: any) => mapPaperRow(row) as Paper);
        mapped = await attachUploaders(mapped);
        mapped = await enrichEngagement(mapped);
        setPapers(mapped);
      }
      setLoading(false);
    };
    fetchPapers();
  }, []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      const uid = sessionData.session?.user?.id ?? null;
      const followingIds = await fetchFollowingIds(uid);
      if (!mounted || followingIds.length === 0) {
        setSubscriptionFeed([]);
        return;
      }

      const { data, error } = await supabase
        .from("papers")
        .select("*")
        .in("uploaded_by", followingIds)
        .order("uploaded_at", { ascending: false })
        .limit(12);

      if (!mounted || error || !data) {
        setSubscriptionFeed([]);
        return;
      }

      let mapped = data.map((row: any) => mapPaperRow(row) as Paper);
      mapped = await attachUploaders(mapped);
      mapped = await enrichEngagement(mapped);
      setSubscriptionFeed(mapped);
    })();
    return () => {
      mounted = false;
    };
  }, []);

  // Manual filters only (chips / desktop filters) — never forced from account prefs
  const filteredPapers = softRankPapers(
    papers.filter((paper) => {
      if (selectedSchool && paper.school !== selectedSchool) return false;
      if (selectedProgram && paper.program !== selectedProgram) return false;
      if (selectedType && paper.type !== selectedType) return false;
      return true;
    }),
    preferences
  );

  const featuredPapers = softRankPapers(papers, preferences).slice(0, 6);

  return (
    <div className="font-sans">
      {/* Feed-first home: less desktop marketing chrome */}

      {/* YouTube-style sticky chip row (mobile) — optional filters only */}
      <div className="md:hidden sticky top-12 z-20 -mx-0 bg-white dark:bg-gray-950 border-b border-gray-100 dark:border-gray-900">
        <div className="flex gap-2 overflow-x-auto px-3 py-2.5 scrollbar-hide">
          {[
            { id: "type:", label: "All", apply: () => { setSelectedType(""); setSelectedProgram(""); } },
            { id: "type:Exam", label: "Exams", apply: () => setSelectedType(selectedType === "Exam" ? "" : "Exam") },
            { id: "type:Test", label: "Tests", apply: () => setSelectedType(selectedType === "Test" ? "" : "Test") },
            { id: "type:Material", label: "Materials", apply: () => setSelectedType(selectedType === "Material" ? "" : "Material") },
          ].map((chip) => {
            const active =
              chip.id === "type:"
                ? !selectedType && !selectedProgram
                : chip.id === `type:${selectedType}`;
            return (
              <button
                key={chip.id}
                type="button"
                onClick={chip.apply}
                className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-[13px] font-medium whitespace-nowrap transition-colors ${
                  active
                    ? "bg-gray-900 dark:bg-white text-white dark:text-gray-900"
                    : "bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200"
                }`}
              >
                {chip.label}
              </button>
            );
          })}
          {/* Optional interest / prefs chips — never auto-applied */}
          {[...(preferences?.program ? [preferences.program] : []), ...interestPrograms.slice(0, 2)]
            .filter((v, i, arr) => arr.indexOf(v) === i)
            .map((prog) => (
              <button
                key={prog}
                type="button"
                onClick={() => setSelectedProgram(selectedProgram === prog ? "" : prog)}
                className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-[13px] font-medium whitespace-nowrap ${
                  selectedProgram === prog
                    ? "bg-gray-900 dark:bg-white text-white dark:text-gray-900"
                    : "bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200"
                }`}
              >
                {prog}
              </button>
            ))}
        </div>
      </div>

      {/* Desktop filters (kept light so content stays primary) */}
      <div className="hidden md:block sticky top-[73px] z-20 bg-white/95 dark:bg-gray-950/95 backdrop-blur border-b border-gray-200 dark:border-gray-800 -mx-3 md:-mx-8 px-3 md:px-8 mb-6">
        <div className="flex items-center gap-3 overflow-x-auto scrollbar-hide py-3">
          {[
            { id: "all", label: "All", onClick: () => { setSelectedType(""); setSelectedProgram(""); } },
            { id: "exam", label: "Exams", onClick: () => setSelectedType(selectedType === "Exam" ? "" : "Exam") },
            { id: "test", label: "Tests", onClick: () => setSelectedType(selectedType === "Test" ? "" : "Test") },
            { id: "material", label: "Materials", onClick: () => setSelectedType(selectedType === "Material" ? "" : "Material") },
            ...[...(preferences?.program ? [preferences.program] : []), ...interestPrograms]
              .filter((v, i, arr) => arr.indexOf(v) === i)
              .map((prog) => ({
                id: `prog:${prog}`,
                label: prog,
                onClick: () => setSelectedProgram(selectedProgram === prog ? "" : prog),
              })),
          ].map((chip) => {
            const active =
              chip.id === "all"
                ? !selectedType && !selectedProgram
                : chip.id === "exam"
                  ? selectedType === "Exam"
                  : chip.id === "test"
                    ? selectedType === "Test"
                    : chip.id === "material"
                      ? selectedType === "Material"
                      : selectedProgram === chip.label;
            return (
              <button
                key={chip.id}
                type="button"
                onClick={chip.onClick}
                className={`shrink-0 px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                  active
                    ? "bg-gray-900 dark:bg-white text-white dark:text-gray-900"
                    : "bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-700"
                }`}
              >
                {chip.label}
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => setShowDesktopFilters((s) => !s)}
            className={`shrink-0 inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
              showDesktopFilters || selectedSchool || selectedProgram
                ? "bg-white dark:bg-gray-900 border-gray-300 dark:border-gray-700 text-gray-900 dark:text-gray-100"
                : "bg-gray-100 dark:bg-gray-800 border-transparent text-gray-800 dark:text-gray-200"
            }`}
          >
            <SlidersHorizontal className="w-4 h-4" />
            Filters
          </button>
        </div>
        {showDesktopFilters && (
          <div className="pb-3">
            <PaperFilters
              selectedSchool={selectedSchool}
              setSelectedSchool={setSelectedSchool}
              selectedProgram={selectedProgram}
              setSelectedProgram={setSelectedProgram}
              selectedType={selectedType}
              setSelectedType={setSelectedType}
            />
          </div>
        )}
      </div>

      {loading ? (
        <LoadingSkeleton />
      ) : filteredPapers.length === 0 ? (
        <div className="px-3 md:px-0">
          <EmptyState
            type="no-results"
            onReset={() => {
              setSelectedSchool("");
              setSelectedProgram("");
              setSelectedType("");
            }}
          />
        </div>
      ) : papers.length === 0 ? (
        <div className="px-3 md:px-0">
          <EmptyState type="no-papers" />
        </div>
      ) : (
        <>
          {/* New from subscriptions — mobile + desktop */}
          {subscriptionFeed.length > 0 && (
            <section className="mb-6 md:mb-8 pt-3 md:pt-0 border-b border-gray-100 dark:border-gray-900 md:border-0 pb-4 md:pb-0">
              <div className="flex items-center gap-2 px-3 md:px-0 mb-3">
                <Bell className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                <h3 className="text-sm md:text-lg font-semibold text-gray-900 dark:text-white">
                  New from channels you follow
                </h3>
              </div>
              <div className="md:hidden divide-y divide-transparent">
                {subscriptionFeed.map((paper) => (
                  <PaperCard
                    key={paper.id}
                    id={paper.id}
                    title={paper.title}
                    program={paper.program}
                    type={paper.type}
                    school={paper.school}
                    uploadedAt={paper.uploadedAt}
                    uploaderName={paper.uploaderName}
                    uploadedBy={paper.uploadedBy}
                    uploaderRole={paper.uploaderRole}
                    uploaderVerified={paper.uploaderVerified}
                    viewCount={paper.viewCount}
                    likeCount={paper.likeCount}
                    variant="feed"
                  />
                ))}
              </div>
              <div className="hidden md:grid grid-cols-2 xl:grid-cols-3 gap-5">
                {subscriptionFeed.map((paper) => (
                  <PaperCard
                    key={paper.id}
                    id={paper.id}
                    title={paper.title}
                    program={paper.program}
                    type={paper.type}
                    school={paper.school}
                    uploadedAt={paper.uploadedAt}
                    uploaderName={paper.uploaderName}
                    uploadedBy={paper.uploadedBy}
                    uploaderRole={paper.uploaderRole}
                    uploaderVerified={paper.uploaderVerified}
                    viewCount={paper.viewCount}
                    likeCount={paper.likeCount}
                  />
                ))}
              </div>
            </section>
          )}

          {/* Discover — subtle sponsored-mentions strip (Spotlight profiles) */}
          {spotlightProfiles.length > 0 && (
            <section className="w-full mb-4 md:mb-6 pt-3 md:pt-0">
              <div className="flex items-center gap-2 px-3 md:px-0 mb-2">
                <Sparkles className="w-4 h-4 text-amber-500" />
                <h3 className="text-sm md:text-base font-semibold text-gray-900 dark:text-white">
                  Discover
                </h3>
              </div>
              <div className="flex gap-2 overflow-x-auto px-3 md:px-0 pb-1 scrollbar-hide md:flex-wrap md:overflow-x-visible">
                {spotlightProfiles.map((p) => {
                  const name = p.displayName || "Unnamed user";
                  const initial = (p.displayName || "U").trim().charAt(0).toUpperCase() || "U";
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => router.push(`/u/${p.id}`)}
                      className="flex-shrink-0 flex items-center gap-2 pl-1.5 pr-3 py-1.5 rounded-full bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors max-w-[200px]"
                    >
                      <span
                        className={`h-7 w-7 rounded-full bg-gradient-to-br ${spotlightGradientFor(
                          p.id
                        )} flex items-center justify-center text-white text-xs font-semibold shrink-0`}
                      >
                        {initial}
                      </span>
                      <span className="flex items-center gap-1 min-w-0">
                        <span className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                          {name}
                        </span>
                        <VerifiedBadge role={p.role} isVerified={p.isVerified} size="xs" />
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>
          )}

          {/* Mobile: YouTube single-column feed */}
          <div className="md:hidden">
            {/* Shorts-style rail near top of feed */}
            {featuredPapers.length > 0 && (
              <section className="pt-3 pb-2 border-b border-gray-100 dark:border-gray-900">
                <div className="flex items-center gap-2 px-3 mb-2">
                  <FileText className="w-4 h-4 text-red-600" />
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Quick picks</h3>
                </div>
                <div className="flex gap-2.5 overflow-x-auto px-3 pb-1 scrollbar-hide snap-x snap-mandatory">
                  {featuredPapers.map((paper) => (
                    <div key={paper.id} className="snap-start shrink-0 w-[118px]">
                      <PaperCard
                        id={paper.id}
                        title={paper.title}
                        program={paper.program}
                        type={paper.type}
                        school={paper.school}
                        uploadedAt={paper.uploadedAt}
                        uploaderName={paper.uploaderName}
                        uploadedBy={paper.uploadedBy}
                        uploaderRole={paper.uploaderRole}
                        uploaderVerified={paper.uploaderVerified}
                        viewCount={paper.viewCount}
                        likeCount={paper.likeCount}
                        variant="shorts"
                      />
                    </div>
                  ))}
                </div>
              </section>
            )}

            <div className="divide-y divide-transparent">
              {filteredPapers.map((paper) => (
                <PaperCard
                  key={paper.id}
                  id={paper.id}
                  title={paper.title}
                  program={paper.program}
                  type={paper.type}
                  school={paper.school}
                  uploadedAt={paper.uploadedAt}
                  uploaderName={paper.uploaderName}
                  uploadedBy={paper.uploadedBy}
                  uploaderRole={paper.uploaderRole}
                  uploaderVerified={paper.uploaderVerified}
                  viewCount={paper.viewCount}
                  likeCount={paper.likeCount}
                  variant="feed"
                />
              ))}
            </div>
          </div>

          {/* Desktop: academic media grid */}
          <div className="hidden md:block">
            <div className="grid grid-cols-2 xl:grid-cols-3 gap-5">
              {filteredPapers.map((paper) => (
                <PaperCard
                  key={paper.id}
                  id={paper.id}
                  title={paper.title}
                  program={paper.program}
                  type={paper.type}
                  school={paper.school}
                  uploadedAt={paper.uploadedAt}
                  uploaderName={paper.uploaderName}
                  uploadedBy={paper.uploadedBy}
                  uploaderRole={paper.uploaderRole}
                  uploaderVerified={paper.uploaderVerified}
                  viewCount={paper.viewCount}
                  likeCount={paper.likeCount}
                />
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
