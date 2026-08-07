"use client";

import React, { useEffect, useState } from "react";
import { Megaphone, X, ExternalLink } from "lucide-react";
import { supabase } from "@/utils/supabaseClient";
import { useRouter } from "next/navigation";

type Announcement = {
  id: string;
  kind: "banner" | "alert" | "promo" | string;
  title: string;
  body: string | null;
  link: string | null;
  link_label: string | null;
};

const DISMISS_KEY = "dc:dismissed_announcements";

function readDismissed(): string[] {
  try {
    const raw = localStorage.getItem(DISMISS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function writeDismissed(ids: string[]) {
  try {
    localStorage.setItem(DISMISS_KEY, JSON.stringify(ids.slice(-40)));
  } catch {
    // ignore
  }
}

function kindStyles(kind: string) {
  if (kind === "alert") {
    return "bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800 text-amber-950 dark:text-amber-50";
  }
  if (kind === "promo") {
    return "bg-rose-50 dark:bg-rose-950/30 border-rose-200 dark:border-rose-900 text-rose-950 dark:text-rose-50";
  }
  return "bg-indigo-50 dark:bg-indigo-950/40 border-indigo-200 dark:border-indigo-900 text-indigo-950 dark:text-indigo-50";
}

export default function SiteBanner() {
  const router = useRouter();
  const [items, setItems] = useState<Announcement[]>([]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const dismissed = new Set(readDismissed());
      const { data, error } = await supabase
        .from("announcements")
        .select("id, kind, title, body, link, link_label")
        .eq("is_active", true)
        .order("created_at", { ascending: false })
        .limit(5);

      if (!mounted) return;
      if (error) {
        // Table may not exist yet
        return;
      }
      setItems((data || []).filter((a) => !dismissed.has(a.id)) as Announcement[]);
    })();
    return () => {
      mounted = false;
    };
  }, []);

  if (items.length === 0) return null;

  const a = items[0];

  const dismiss = () => {
    const next = [...readDismissed(), a.id];
    writeDismissed(next);
    setItems((prev) => prev.filter((x) => x.id !== a.id));
  };

  return (
    <div className={`border-b ${kindStyles(a.kind)}`}>
      <div className="max-w-7xl mx-auto px-3 md:px-8 py-2.5 flex items-start gap-3">
        <Megaphone className="w-4 h-4 mt-0.5 shrink-0 opacity-80" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold leading-snug">{a.title}</p>
          {a.body && (
            <p className="text-xs sm:text-sm opacity-80 mt-0.5 leading-relaxed line-clamp-2">{a.body}</p>
          )}
          {a.link && (
            <button
              type="button"
              onClick={() => {
                if (a.link!.startsWith("http")) {
                  window.open(a.link!, "_blank", "noopener,noreferrer");
                } else {
                  router.push(a.link!);
                }
              }}
              className="mt-1.5 inline-flex items-center gap-1 text-xs font-semibold underline underline-offset-2"
            >
              {a.link_label || "Learn more"}
              <ExternalLink className="w-3 h-3" />
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={dismiss}
          className="p-1 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 shrink-0"
          aria-label="Dismiss"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
