import React from "react";
import { FileText, Search, RefreshCw } from "lucide-react";

interface EmptyStateProps {
  type: "no-papers" | "no-results" | "empty-library";
  onReset?: () => void;
}

export default function EmptyState({ type, onReset }: EmptyStateProps) {
  if (type === "empty-library") {
    return (
      <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
        <div className="relative mb-6">
          <div className="absolute inset-0 bg-indigo-500/10 blur-3xl rounded-full" />
          <div className="relative bg-gradient-to-br from-indigo-100 to-purple-100 dark:from-indigo-900/30 dark:to-purple-900/30 p-8 rounded-2xl">
            <FileText className="text-indigo-600 dark:text-indigo-400 w-16 h-16" />
          </div>
        </div>
        <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">
          Nothing saved yet
        </h3>
        <p className="text-gray-500 dark:text-gray-400 max-w-md mb-6">
          Bookmark papers you want to revisit. They&apos;ll show up here.
        </p>
        <button
          onClick={onReset || (() => (window.location.href = "/"))}
          className="px-6 py-3 bg-indigo-600 dark:bg-indigo-500 text-white rounded-xl font-medium hover:bg-indigo-700 dark:hover:bg-indigo-600 transition-colors shadow-lg hover:shadow-xl"
        >
          Browse papers
        </button>
      </div>
    );
  }

  if (type === "no-papers") {
    return (
      <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
        <div className="relative mb-6">
          <div className="absolute inset-0 bg-indigo-500/10 blur-3xl rounded-full" />
          <div className="relative bg-gradient-to-br from-indigo-100 to-purple-100 dark:from-indigo-900/30 dark:to-purple-900/30 p-8 rounded-2xl">
            <FileText className="text-indigo-600 dark:text-indigo-400 w-16 h-16" />
          </div>
        </div>
        <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">
          No papers yet
        </h3>
        <p className="text-gray-500 dark:text-gray-400 max-w-md mb-6">
          Be the first to contribute! Upload past papers, notes, or study materials to help your fellow students.
        </p>
        <button
          onClick={() => (window.location.href = "/upload")}
          className="px-6 py-3 bg-indigo-600 dark:bg-indigo-500 text-white rounded-xl font-medium hover:bg-indigo-700 dark:hover:bg-indigo-600 transition-colors shadow-lg hover:shadow-xl"
        >
          Upload a Paper
        </button>
      </div>
    );
  }

  if (type === "no-results") {
    return (
      <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
        <div className="relative mb-6">
          <div className="absolute inset-0 bg-amber-500/10 blur-3xl rounded-full" />
          <div className="relative bg-gradient-to-br from-amber-100 to-orange-100 dark:from-amber-900/30 dark:to-orange-900/30 p-8 rounded-2xl">
            <Search className="text-amber-600 dark:text-amber-400 w-16 h-16" />
          </div>
        </div>
        <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">
          No results found
        </h3>
        <p className="text-gray-500 dark:text-gray-400 max-w-md mb-6">
          We couldn't find any papers matching your search. Try adjusting your filters or search terms.
        </p>
        {onReset && (
          <button
            onClick={onReset}
            className="flex items-center gap-2 px-6 py-3 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-xl font-medium hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
          >
            <RefreshCw size={18} />
            Clear filters
          </button>
        )}
      </div>
    );
  }

  return null;
}
