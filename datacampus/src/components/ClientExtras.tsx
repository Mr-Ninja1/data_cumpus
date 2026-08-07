"use client";

import React, { useCallback, useEffect, useState } from "react";

/**
 * Soft welcome: no forced school/program gate.
 * Users land on the full catalog; personalization learns from use.
 * Optional gentle tip after a delay, once, dismissible.
 */
export default function ClientExtras() {
  const [showTip, setShowTip] = useState(false);

  useEffect(() => {
    try {
      if (localStorage.getItem("dc:welcome_tip_seen") === "true") return;
    } catch {
      return;
    }
    const t = window.setTimeout(() => setShowTip(true), 4500);
    return () => window.clearTimeout(t);
  }, []);

  const dismiss = useCallback(() => {
    setShowTip(false);
    try {
      localStorage.setItem("dc:welcome_tip_seen", "true");
      localStorage.setItem("dc:onboarding_done", "true");
    } catch {
      // ignore
    }
  }, []);

  if (!showTip) return null;

  return (
    <div className="fixed bottom-[4.75rem] md:bottom-6 left-3 right-3 md:left-1/2 md:right-auto md:-translate-x-1/2 md:w-full md:max-w-sm z-[60] pointer-events-none">
      <div className="pointer-events-auto rounded-2xl bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 shadow-xl p-4 border border-white/10 dark:border-gray-300">
        <p className="text-sm font-medium leading-snug mb-1">Browse everything — we&apos;ll adapt</p>
        <p className="text-xs opacity-80 leading-relaxed mb-3">
          No need to pick a program first. Save or open papers you care about and DataCampus will gently surface more like them.
        </p>
        <button
          type="button"
          onClick={dismiss}
          className="w-full py-2 rounded-xl bg-white/15 dark:bg-gray-900/10 text-sm font-medium hover:bg-white/25 dark:hover:bg-gray-900/20 transition-colors"
        >
          Got it
        </button>
      </div>
    </div>
  );
}
