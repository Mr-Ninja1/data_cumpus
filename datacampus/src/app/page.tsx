"use client";

import React, { useEffect, useState } from "react";
import { supabase } from "@/utils/supabaseClient";
import PaperCard from "@/components/PaperCard";
import PaperFilters from "@/components/PaperFilters";

interface Paper {
  id: string;
  school: string;
  program: string;
  type: string;
  title: string;
  fileUrl: string;
  uploadedAt: any;
}

export default function HomePage() {
  const [papers, setPapers] = useState<Paper[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSchool, setSelectedSchool] = useState("");
  const [selectedProgram, setSelectedProgram] = useState("");

  useEffect(() => {
    const fetchPapers = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("papers")
        .select("*")
        .order("uploaded_at", { ascending: false })
        .limit(48);

      if (error) {
        console.error("Error fetching papers:", error.message);
        setPapers([]);
      } else if (data) {
        // Map DB fields to the Paper interface expected by the UI
        const mapped = data.map((row: any) => ({
          id: row.id,
          school: row.school,
          program: row.program,
          type: row.type,
          title: row.title,
          fileUrl: row.file_url,
          uploadedAt: row.uploaded_at,
        } as Paper));
        setPapers(mapped);
      }
      setLoading(false);
    };
    fetchPapers();
  }, []);

  // Filter papers by school and program
  const filteredPapers = papers.filter((paper) => {
    if (selectedSchool && paper.school !== selectedSchool) return false;
    if (selectedProgram && paper.program !== selectedProgram) return false;
    return true;
  });

  return (
    <div className="flex min-h-screen flex-col items-start bg-zinc-50 font-sans dark:bg-black">
      <main className="flex w-full max-w-6xl flex-col items-start py-12 px-4 bg-white dark:bg-black">
        <h1 className="text-2xl font-bold mb-4">Recent Papers</h1>
        <PaperFilters
          selectedSchool={selectedSchool}
          setSelectedSchool={setSelectedSchool}
          selectedProgram={selectedProgram}
          setSelectedProgram={setSelectedProgram}
        />
        {loading ? (
          <div>Loading...</div>
        ) : (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
            {filteredPapers.map((paper) => (
              <PaperCard
                key={paper.id}
                id={paper.id}
                title={paper.title}
                program={paper.program}
                type={paper.type}
                thumbnailUrl={undefined}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
