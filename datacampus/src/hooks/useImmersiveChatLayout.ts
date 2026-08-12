"use client";

import { useEffect } from "react";

/** Give chat pages more horizontal room by collapsing the desktop sidebar. */
export function useImmersiveChatLayout(enabled = true) {
  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;

    let prevOpen: string | null = null;
    try {
      prevOpen = window.localStorage.getItem("sidebar-open");
    } catch {
      // ignore
    }

    window.dispatchEvent(new CustomEvent("set-sidebar", { detail: { open: false } }));

    return () => {
      if (prevOpen === "true") {
        window.dispatchEvent(new CustomEvent("set-sidebar", { detail: { open: true } }));
      }
    };
  }, [enabled]);
}
