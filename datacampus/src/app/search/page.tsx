"use client";

import React, { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import { supabase } from "@/utils/supabaseClient";
import PaperCard from "@/components/PaperCard";
import PaperFilters from "@/components/PaperFilters";
import LoadingSkeleton from "@/components/LoadingSkeleton";
import EmptyState from "@/components/EmptyState";

interface Paper {
  id: string;
  school: string;
  program: string;
  type: string;
  title: string;
  fileUrl: string;
  uploadedAt: string;
}

function SearchPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialQ = searchParams.get("q") || "";

  const [query, setQuery] = useState(initialQ);
  const [papers, setPapers] = useState<Paper[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [selectedSchool, setSelectedSchool] = useState("");
  const [selectedProgram, setSelectedProgram] = useState("");
  const [selectedType, setSelectedType] = useState("");

  useEffect(() => {
    setQuery(initialQ);
  }, [initialQ]);

  useEffect(() => {
    const q = initialQ.trim();
    if (!q && !selectedSchool && !selectedProgram && !selectedType) {
      setPapers([]);
      setSearched(false);
      return;
    }

    let mounted = true;
    const run = async () => {
      setLoading(true);
      setSearched(true);
      let req = supabase
        .from("papers")
        .select("*")
        .order("uploaded_at", { ascending: false })
        .limit(48);

      if (q) req = req.ilike("title", `%${q}%`);
      if (selectedSchool) req = req.eq("school", selectedSchool);
      if (selectedProgram) req = req.eq("program", selectedProgram);
      if (selectedType) req = req.eq("type", selectedType);

      const { data, error } = await req;
      if (!mounted) return;
      if (error) {
        console.error("Search error:", error.message);
        setPapers([]);
      } else {
        setPapers(
          (data || []).map((row: any) => ({
            id: row.id,
            school: row.school,
            program: row.program,
            type: row.type,
            title: row.title,
            fileUrl: row.file_url,
            uploadedAt: row.uploaded_at,
          }))
        );
      }
      setLoading(false);
    };
    run();
    return () => {
      mounted = false;
    };
  }, [initialQ, selectedSchool, selectedProgram, selectedType]);

  const submitSearch = (e?: React.FormEvent) => {
    e?.preventDefault();
    const q = query.trim();
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    router.push(`/search${params.toString() ? `?${params}` : ""}`);
  };

  const clearAll = () => {
    setQuery("");
    setSelectedSchool("");
    setSelectedProgram("");
    setSelectedType("");
    router.push("/search");
  };

  return (
    <div className="font-sans px-3 pt-4 md:px-0 md:pt-0">
      <div className="mb-6">
        <h1 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-gray-100 mb-1">
          Search
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Find past papers by title, school, or program
        </p>
      </div>

      <form onSubmit={submitSearch} className="mb-6">
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by title..."
            className="w-full pl-12 pr-28 py-3.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-base"
            autoFocus
          />
          <button
            type="submit"
            className="absolute right-2 top-1/2 -translate-y-1/2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors"
          >
            Search
          </button>
        </div>
      </form>

      <PaperFilters
        selectedSchool={selectedSchool}
        setSelectedSchool={setSelectedSchool}
        selectedProgram={selectedProgram}
        setSelectedProgram={setSelectedProgram}
        selectedType={selectedType}
        setSelectedType={setSelectedType}
        inlineChips
      />

      {loading ? (
        <LoadingSkeleton />
      ) : !searched ? (
        <div className="flex flex-col items-center justify-center py-16 text-center text-gray-500 dark:text-gray-400">
          <Search className="w-12 h-12 mb-4 opacity-40" />
          <p>Type a title or pick filters to find papers</p>
        </div>
      ) : papers.length === 0 ? (
        <EmptyState type="no-results" onReset={clearAll} />
      ) : (
        <>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
            {papers.length} result{papers.length === 1 ? "" : "s"}
            {initialQ ? ` for “${initialQ}”` : ""}
          </p>
          <div className="md:hidden -mx-3">
            {papers.map((paper) => (
              <PaperCard
                key={paper.id}
                id={paper.id}
                title={paper.title}
                program={paper.program}
                type={paper.type}
                uploadedAt={paper.uploadedAt}
                variant="feed"
              />
            ))}
          </div>
          <div className="hidden md:grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4 md:gap-6">
            {papers.map((paper) => (
              <PaperCard
                key={paper.id}
                id={paper.id}
                title={paper.title}
                program={paper.program}
                type={paper.type}
                uploadedAt={paper.uploadedAt}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export default function SearchPage() {
  return (
    <Suspense fallback={<LoadingSkeleton />}>
      <SearchPageInner />
    </Suspense>
  );
}
