import React from "react";

export default function LoadingSkeleton() {
  return (
    <>
      {/* Mobile YouTube feed skeleton */}
      <div className="md:hidden space-y-0">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="pb-4">
            <div className="aspect-video bg-gray-200 dark:bg-gray-800 relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent dark:via-white/5 animate-shimmer" />
            </div>
            <div className="flex gap-3 px-3 pt-3">
              <div className="h-9 w-9 rounded-full bg-gray-200 dark:bg-gray-800 animate-pulse flex-shrink-0" />
              <div className="flex-1 space-y-2 pt-0.5">
                <div className="h-3.5 bg-gray-200 dark:bg-gray-800 rounded animate-pulse w-[92%]" />
                <div className="h-3.5 bg-gray-200 dark:bg-gray-800 rounded animate-pulse w-[70%]" />
                <div className="h-3 bg-gray-200 dark:bg-gray-800 rounded animate-pulse w-[45%]" />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Desktop grid skeleton */}
      <div className="hidden md:grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {[...Array(8)].map((_, i) => (
          <div
            key={i}
            className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden"
          >
            <div className="aspect-video bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-800 dark:to-gray-900 relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-gray-200/50 to-transparent dark:via-gray-700/50 animate-shimmer" />
            </div>
            <div className="p-4 space-y-3">
              <div className="w-16 h-6 bg-gray-200 dark:bg-gray-700 rounded-full animate-pulse" />
              <div className="space-y-2">
                <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
                <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4 animate-pulse" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
