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

const typeColors: Record<string, { active: string; inactive: string; border: string }> = {
  "": {
    active: "bg-indigo-600 text-white border-indigo-600",
    inactive: "bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:border-indigo-300 dark:hover:border-indigo-600",
    border: "border-indigo-600",
  },
  Exam: {
    active: "bg-blue-600 text-white border-blue-600",
    inactive: "bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-600",
    border: "border-blue-600",
  },
  Test: {
    active: "bg-amber-500 text-white border-amber-500",
    inactive: "bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:border-amber-300 dark:hover:border-amber-500",
    border: "border-amber-500",
  },
  Material: {
    active: "bg-emerald-600 text-white border-emerald-600",
    inactive: "bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:border-emerald-300 dark:hover:border-emerald-600",
    border: "border-emerald-600",
  },
};

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

  const chipSizeClass = inlineChips
    ? "px-5 py-2.5 rounded-xl text-sm font-medium"
    : "px-4 py-2 rounded-full text-sm font-medium";

  const getChipClasses = (type: string) => {
    const colors = typeColors[type] || typeColors[""];
    return selectedType === type
      ? `${colors.active}`
      : `${colors.inactive}`;
  };

  const selectClass =
    "px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all disabled:opacity-50 disabled:cursor-not-allowed";

  if (inlineChips) {
    return (
      <div className="w-full flex flex-col md:flex-row md:items-center justify-between gap-3 mb-4 -mt-2">
        <div className="flex gap-2 items-center overflow-x-auto pb-1 md:pb-0 scrollbar-hide">
          <button
            type="button"
            onClick={() => setSelectedType("")}
            className={`${chipSizeClass} border transition-all duration-200 ${getChipClasses("")}`}
          >
            All
          </button>
          {types.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setSelectedType(t)}
              className={`${chipSizeClass} border transition-all duration-200 ${getChipClasses(t)}`}
            >
              {t}s
            </button>
          ))}
        </div>

        <div className="flex gap-2 items-center flex-shrink-0">
          <select
            value={selectedSchool}
            onChange={(e) => {
              setSelectedSchool(e.target.value);
              setSelectedProgram("");
            }}
            className={selectClass}
          >
            <option value="">All Schools</option>
            {schools.map((school) => (
              <option key={school.name} value={school.name}>
                {school.name}
              </option>
            ))}
          </select>
          <select
            value={selectedProgram}
            onChange={(e) => setSelectedProgram(e.target.value)}
            className={selectClass}
            disabled={!selectedSchool}
          >
            <option value="">All Programs</option>
            {programs.map((prog) => (
              <option key={prog} value={prog}>
                {prog}
              </option>
            ))}
          </select>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 mb-4 -mt-2 w-full">
      <div className="flex gap-2 items-center overflow-x-auto pb-2 scrollbar-hide">
        <button
          type="button"
          onClick={() => setSelectedType("")}
          className={`${chipSizeClass} border transition-all duration-200 ${getChipClasses("")}`}
        >
          All
        </button>
        {types.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setSelectedType(t)}
            className={`${chipSizeClass} border transition-all duration-200 ${getChipClasses(t)}`}
          >
            {t}s
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <select
          value={selectedSchool}
          onChange={(e) => {
            setSelectedSchool(e.target.value);
            setSelectedProgram("");
          }}
          className={selectClass}
        >
          <option value="">All Schools</option>
          {schools.map((school) => (
            <option key={school.name} value={school.name}>
              {school.name}
            </option>
          ))}
        </select>
        <select
          value={selectedProgram}
          onChange={(e) => setSelectedProgram(e.target.value)}
          className={selectClass}
          disabled={!selectedSchool}
        >
          <option value="">All Programs</option>
          {programs.map((prog) => (
            <option key={prog} value={prog}>
              {prog}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
