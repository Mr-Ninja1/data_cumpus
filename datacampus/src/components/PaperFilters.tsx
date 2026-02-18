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
  selectedType,
  setSelectedType,
  inlineChips,
}: {
  selectedSchool: string;
  setSelectedSchool: (s: string) => void;
  selectedProgram: string;
  setSelectedProgram: (p: string) => void;
  selectedType: string;
  setSelectedType: (t: string) => void;
  inlineChips?: boolean;
}) {
  const programs = schools.find((s) => s.name === selectedSchool)?.programs || [];
  const types = ["Exam", "Test", "Material"];

  // Chips: render larger when inlineChips, otherwise smaller
  const chipSizeClass = inlineChips ? 'px-4 py-2 rounded-xl text-base' : 'px-3 py-1 rounded-full text-sm';
  // When inlineChips is true, render chips on the left and selects on the right in one row
  if (inlineChips) {
    return (
      <div className="w-full flex items-center justify-end gap-4 mb-2 -mt-2">
        <div className="flex gap-2 items-center overflow-x-auto"> 
          <button
            type="button"
            onClick={() => setSelectedType("")}
            className={`${chipSizeClass} border ${selectedType === "" ? 'bg-white text-black dark:bg-gray-800 dark:text-white border-blue-600' : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200'}`}
          >
            All
          </button>
          {types.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setSelectedType(t)}
              className={`${chipSizeClass} border ${selectedType === t ? 'bg-white text-black dark:bg-gray-800 dark:text-white border-blue-600' : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200'}`}
            >
              {t}s
            </button>
          ))}
        </div>

        <div className="flex gap-2 items-center">
          <select
            value={selectedSchool}
            onChange={e => {
              setSelectedSchool(e.target.value);
              setSelectedProgram("");
            }}
            className="p-2 rounded border bg-white text-black dark:bg-gray-800 dark:text-white"
          >
            <option value="">All Schools</option>
            {schools.map((school) => (
              <option key={school.name} value={school.name}>{school.name}</option>
            ))}
          </select>
          <select
            value={selectedProgram}
            onChange={e => setSelectedProgram(e.target.value)}
            className="p-2 rounded border bg-white text-black dark:bg-gray-800 dark:text-white"
            disabled={!selectedSchool}
          >
            <option value="">All Programs</option>
            {programs.map((prog) => (
              <option key={prog} value={prog}>{prog}</option>
            ))}
          </select>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 mb-2 -mt-2 w-full">
      <div className="flex gap-2 items-center overflow-x-auto pb-1">
        <button
          type="button"
          onClick={() => setSelectedType("")}
          className={`${chipSizeClass} border ${selectedType === "" ? 'bg-white text-black dark:bg-gray-800 dark:text-white border-blue-600' : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200'}`}
        >
          All
        </button>
        {types.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setSelectedType(t)}
            className={`${chipSizeClass} border ${selectedType === t ? 'bg-white text-black dark:bg-gray-800 dark:text-white border-blue-600' : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200'}`}
          >
            {t}s
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <select
          value={selectedSchool}
          onChange={e => {
            setSelectedSchool(e.target.value);
            setSelectedProgram("");
          }}
          className="p-2 rounded border bg-white text-black dark:bg-gray-800 dark:text-white"
        >
          <option value="">All Schools</option>
          {schools.map((school) => (
            <option key={school.name} value={school.name}>{school.name}</option>
          ))}
        </select>
        <select
          value={selectedProgram}
          onChange={e => setSelectedProgram(e.target.value)}
          className="p-2 rounded border bg-white text-black dark:bg-gray-800 dark:text-white"
          disabled={!selectedSchool}
        >
          <option value="">All Programs</option>
          {programs.map((prog) => (
            <option key={prog} value={prog}>{prog}</option>
          ))}
        </select>
      </div>
    </div>
  );
}
