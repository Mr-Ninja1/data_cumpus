"use client";
import React, { useState, useEffect } from "react";
import { usePreferences } from "@/hooks/usePreferences";
import { Home } from "lucide-react";
import { useRouter } from "next/navigation";

const categories = [
  {
    label: "All Programs",
    children: [
      "BSE",
      "Cyber Security",
      "BIT",
      "BICTE",
      "Electrical & Electronics",
      "Telecommunications",
      "Instrumentation",
      "Accountancy",
      "BBA",
      "Marketing",
      "Purchasing & Supply",
    ],
  },
];

const allPrograms = [
  "BSE",
  "Cyber Security",
  "BIT",
  "BICTE",
  "Electrical & Electronics",
  "Telecommunications",
  "Instrumentation",
  "Accountancy",
  "BBA",
  "Marketing",
  "Purchasing & Supply",
];

const programsMap: Record<string, string[]> = {
  "School of Engineering & Technology": ["Electrical & Electronics", "Telecommunications", "Instrumentation"],
  "School of Business": ["Accountancy", "BBA", "Marketing", "Purchasing & Supply"],
  "School of Information & Communication Technology": ["BSE", "Cyber Security", "BIT", "BICTE"],
};
export default function Sidebar() {
  const router = useRouter();
  const [open, setOpen] = useState<boolean>(true);
  const { preferences } = usePreferences();

  // On mount, read persisted sidebar state; do this in effect to avoid
  // hydration mismatch between server and client renders.
  useEffect(() => {
    try {
      const v = window.localStorage.getItem("sidebar-open");
      if (v != null) setOpen(v === "true");
    } catch (err) {
      // ignore
    }
  }, []);

  useEffect(() => {
    function onToggle() {
      setOpen((v) => !v);
    }
    function onSet(e: Event) {
      try {
        const custom = e as CustomEvent<boolean | { open: boolean }>;
        const detail = custom.detail as any;
        let next: boolean | null = null;
        if (typeof detail === "boolean") {
          next = detail;
        } else if (detail && typeof detail.open === "boolean") {
          next = detail.open;
        }
        if (next !== null) {
          setOpen(next);
          try {
            window.localStorage.setItem("sidebar-open", next ? "true" : "false");
          } catch (err) {
            // ignore
          }
        }
      } catch (err) {
        // ignore
      }
    }

    window.addEventListener("toggle-sidebar", onToggle);
    window.addEventListener("set-sidebar", onSet as EventListener);
    return () => {
      window.removeEventListener("toggle-sidebar", onToggle);
      window.removeEventListener("set-sidebar", onSet as EventListener);
    };
  }, []);
  return (
    <aside className={`h-screen bg-white dark:bg-gray-900 border-r transition-all duration-200 ${open ? "w-56" : "w-16"} sticky top-0 z-20 overflow-y-auto` }>
      <div className="flex items-center px-3 py-3 border-b">
        <div className="flex items-center gap-2">
          <button onClick={() => router.push('/')} title="Home" className="p-2 rounded hover:bg-gray-200 dark:hover:bg-gray-700">
            <Home size={20} />
          </button>
          {open && <span className="font-bold text-lg">Programs</span>}
        </div>
      </div>
      <nav className="mt-4 px-2">
        {open && (
          <div className="mb-4">
            <div className="px-4 text-xs text-gray-500 uppercase mb-2">All Programs</div>
            <ul>
              {(preferences?.school ? (programsMap[preferences.school] || []) : allPrograms).map((prog) => (
                <li key={prog} className="px-6 py-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded cursor-pointer text-sm">
                  {prog}
                </li>
              ))}
            </ul>
          </div>
        )}
      </nav>
    </aside>
  );
}
