"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  ClipboardList,
  FilePlus2,
  Presentation,
  Sparkles,
  Wallet,
  Wrench,
  X,
} from "lucide-react";
import { supabase } from "@/utils/supabaseClient";
import { showToast } from "@/utils/toast";

const TIP_KEY = "datacampus_work_tip_v1";
const WAITLIST_KEY = "datacampus_work_waitlist_v1";

type Tool = {
  id: string;
  title: string;
  description: string;
  cost: string;
  href?: string;
  cta: string;
  mode: "live" | "waitlist";
  icon: typeof FilePlus2;
  accent: string;
};

const TOOLS: Tool[] = [
  {
    id: "proposal",
    title: "Project proposal",
    description: "Write chapters with AI",
    cost: "3 credits per AI draft",
    href: "/workspace/proposals",
    cta: "Start proposal",
    mode: "live",
    icon: FilePlus2,
    accent: "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300",
  },
  {
    id: "systems",
    title: "Request a system",
    description: "We build your app / FYP system",
    cost: "Free to request · get a quote",
    href: "/workspace/systems",
    cta: "Request in 3 steps",
    mode: "live",
    icon: Wrench,
    accent: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  },
  {
    id: "assignment",
    title: "Assignment",
    description: "Homework drafts",
    cost: "Coming next",
    cta: "Notify me",
    mode: "waitlist",
    icon: ClipboardList,
    accent: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  },
  {
    id: "presentation",
    title: "Presentation",
    description: "Slides from your proposal",
    cost: "Coming next",
    cta: "Notify me",
    mode: "waitlist",
    icon: Presentation,
    accent: "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300",
  },
];

function readWaitlist(): string[] {
  try {
    const raw = localStorage.getItem(WAITLIST_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export default function WorkspaceHubPage() {
  const router = useRouter();
  const [credits, setCredits] = useState<number | null>(null);
  const [tipOpen, setTipOpen] = useState(false);
  const [waitlisted, setWaitlisted] = useState<string[]>([]);

  useEffect(() => {
    setWaitlisted(readWaitlist());
    try {
      if (!localStorage.getItem(TIP_KEY)) setTipOpen(true);
    } catch {
      /* ignore */
    }

    void (async () => {
      const { data } = await supabase.auth.getSession();
      const uid = data.session?.user?.id;
      if (!uid) return;
      const { data: wallet } = await supabase
        .from("wallets")
        .select("balance_credits")
        .eq("user_id", uid)
        .maybeSingle();
      if (wallet && typeof wallet.balance_credits === "number") {
        setCredits(wallet.balance_credits);
      } else {
        setCredits(0);
      }
    })();
  }, []);

  const dismissTip = () => {
    setTipOpen(false);
    try {
      localStorage.setItem(TIP_KEY, "1");
    } catch {
      /* ignore */
    }
  };

  const joinWaitlist = (id: string, title: string) => {
    const next = Array.from(new Set([...readWaitlist(), id]));
    try {
      localStorage.setItem(WAITLIST_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
    setWaitlisted(next);
    showToast("success", `We’ll message you when ${title.toLowerCase()} is ready.`);
  };

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 py-6 md:py-2">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight text-gray-900 dark:text-white sm:text-3xl">
            Work
          </h1>
          <p className="mt-1.5 text-sm text-gray-600 dark:text-gray-400 sm:text-base">
            Finish campus work in a few steps.
          </p>
        </div>
        {credits !== null && (
          <Link
            href="/wallet"
            className="inline-flex shrink-0 items-center gap-2 self-start rounded-full bg-gray-900 px-4 py-2 text-sm font-semibold text-white dark:bg-white dark:text-gray-900"
          >
            <Wallet size={16} />
            {credits} credits
          </Link>
        )}
      </div>

      <div className="space-y-3">
        {TOOLS.map((tool) => {
          const Icon = tool.icon;
          const onWaitlist = waitlisted.includes(tool.id);
          return (
            <button
              key={tool.id}
              type="button"
              onClick={() => {
                if (tool.mode === "live" && tool.href) {
                  router.push(tool.href);
                  return;
                }
                joinWaitlist(tool.id, tool.title);
              }}
              className="flex w-full items-center gap-4 rounded-2xl border border-gray-200 bg-white p-4 text-left transition hover:border-sky-300 hover:shadow-sm dark:border-gray-800 dark:bg-gray-900 dark:hover:border-sky-700"
            >
              <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${tool.accent}`}>
                <Icon size={22} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="text-base font-semibold text-gray-900 dark:text-white">
                    {tool.title}
                  </span>
                  {tool.mode === "live" && tool.id === "systems" && (
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold uppercase text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                      Service
                    </span>
                  )}
                </span>
                <span className="mt-0.5 block text-sm text-gray-600 dark:text-gray-400">
                  {tool.description}
                </span>
                <span className="mt-1 block text-xs font-medium text-gray-500 dark:text-gray-400">
                  {tool.cost}
                </span>
              </span>
              <span className="inline-flex shrink-0 items-center gap-1 text-sm font-semibold text-sky-700 dark:text-sky-400">
                {tool.mode === "waitlist" && onWaitlist ? "Notified" : tool.cta}
                {tool.mode === "live" && <ArrowRight size={16} />}
              </span>
            </button>
          );
        })}
      </div>

      <p className="text-center text-xs text-gray-500 dark:text-gray-400">
        Questions? Message campus support from Inbox — we reply with a quote for system builds.
      </p>

      {tipOpen && (
        <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/40 p-4 sm:items-center">
          <div className="w-full max-w-md rounded-3xl bg-white p-5 shadow-2xl dark:bg-gray-950">
            <div className="flex items-start justify-between gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300">
                <Sparkles size={20} />
              </div>
              <button
                type="button"
                onClick={dismissTip}
                className="rounded-full p-2 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-900"
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>
            <h2 className="mt-3 text-lg font-semibold text-gray-900 dark:text-white">
              Two simple ways to start
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-gray-600 dark:text-gray-400">
              Start with a proposal for chapter writing, or request a full system if you need an app
              built for you.
            </p>
            <div className="mt-5 flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                onClick={() => {
                  dismissTip();
                  router.push("/workspace/proposals");
                }}
                className="flex-1 rounded-full bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white"
              >
                Start proposal
              </button>
              <button
                type="button"
                onClick={() => {
                  dismissTip();
                  router.push("/workspace/systems");
                }}
                className="flex-1 rounded-full border border-gray-300 px-4 py-2.5 text-sm font-semibold text-gray-800 dark:border-gray-700 dark:text-gray-100"
              >
                Request a system
              </button>
            </div>
            <button
              type="button"
              onClick={dismissTip}
              className="mt-3 w-full py-2 text-sm text-gray-500"
            >
              Maybe later
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
