"use client";

import React, { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { supabase } from "@/utils/supabaseClient";
import { showToast } from "@/utils/toast";

const EARNING_LABELS: Record<string, string> = {
  transfer_in: "You received credits from a friend",
  follow_fee_in: "Someone paid to subscribe to you",
  message_request_fee_in: "Someone paid to message you",
  post_unlock_in: "Someone unlocked one of your posts",
};

/**
 * Soft welcome: no forced school/program gate.
 * Users land on the full catalog; personalization learns from use.
 * Optional gentle tip after a delay, once, dismissible.
 */
export default function ClientExtras() {
  const pathname = usePathname();
  const [showTip, setShowTip] = useState(false);

  // Live "you just earned credits" toast — powers the money-loop feedback
  // (post unlocks, follow/message fees, gifts) without needing a page
  // refresh. Requires `wallet_transactions` to be added to the
  // `supabase_realtime` publication (done in social_economy_v2.sql).
  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let mounted = true;

    (async () => {
      const { data } = await supabase.auth.getSession();
      const uid = data.session?.user?.id;
      if (!uid || !mounted) return;

      channel = supabase
        .channel(`wallet-earnings-${uid}`)
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "wallet_transactions", filter: `user_id=eq.${uid}` },
          (payload) => {
            const row = payload.new as { kind?: string; credits_delta?: number };
            if (!row.kind?.endsWith("_in") || !row.credits_delta || row.credits_delta <= 0) return;
            const label = EARNING_LABELS[row.kind] || "You earned credits";
            showToast("success", `\uD83D\uDCB0 ${label} (+${row.credits_delta})`);
          }
        )
        .subscribe();
    })();

    return () => {
      mounted = false;
      if (channel) void supabase.removeChannel(channel);
    };
  }, []);

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

  if (pathname?.startsWith("/admin")) return null;
  if (!showTip) return null;

  return (
    <div className="fixed inset-x-3 bottom-[4.75rem] md:inset-x-auto md:bottom-6 md:left-1/2 md:-translate-x-1/2 md:w-[24rem] z-[60] pointer-events-none">
      <div className="w-full pointer-events-auto rounded-2xl bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 shadow-xl p-4 border border-white/10 dark:border-gray-300">
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
