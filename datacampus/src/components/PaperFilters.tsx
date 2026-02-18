import React from "react";

const schools = [
  {
    name: "School of Engineering & Technology",
    programs: [
      "Electrical & Electronics",
      "Telecommunications",
      "Instrumentation",
    ],
  },
  {
    name: "School of Business",
    programs: [
      "Accountancy",
      "BBA",
      "Marketing",
      "Purchasing & Supply",
    ],
  },
  {
    name: "School of Information & Communication Technology",
    programs: ["BSE", "Cyber Security", "BIT", "BICTE"],
  },
];

export default function PaperFilters({
  selectedSchool,
  setSelectedSchool,
  selectedProgram,
  setSelectedProgram,
}: {
  selectedSchool: string;
  setSelectedSchool: (s: string) => void;
  selectedProgram: string;
  setSelectedProgram: (p: string) => void;
}) {
  const programs = schools.find((s) => s.name === selectedSchool)?.programs || [];
  return (
    <div className="flex flex-wrap gap-2 mb-6">
      <select
        value={selectedSchool}
        onChange={e => {
          setSelectedSchool(e.target.value);
          setSelectedProgram("");
        }}
        className="p-2 rounded border"
      >
        <option value="">All Schools</option>
        {schools.map((school) => (
          <option key={school.name} value={school.name}>{school.name}</option>
        ))}
      </select>
      <select
        value={selectedProgram}
        onChange={e => setSelectedProgram(e.target.value)}
        className="p-2 rounded border"
        disabled={!selectedSchool}
      >
        <option value="">All Programs</option>
        {programs.map((prog) => (
          <option key={prog} value={prog}>{prog}</option>
        ))}
      </select>
    </div>
  );
}
