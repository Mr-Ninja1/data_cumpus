"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { BadgeCheck, Shield, X } from "lucide-react";
import {
  actionLabel,
  dismissVerifyPrompt,
  VERIFY_REQUIRED_EVENT,
  type VerifyAction,
} from "@/utils/verificationGate";
import { useProfile } from "@/hooks/useProfile";

type Props = {
  /** Also show softly after login if unverified and not dismissed */
  softPrompt?: boolean;
};

export default function VerifyPromptModal({ softPrompt = true }: Props) {
  const router = useRouter();
  const { userId, canUseSocialFeatures, loading, verificationStatus } = useProfile();
  const [open, setOpen] = useState(false);
  const [action, setAction] = useState<VerifyAction>("general");
  const [forced, setForced] = useState(false);

  useEffect(() => {
    const onRequired = (e: Event) => {
      if (canUseSocialFeatures) return;
      const detail = (e as CustomEvent<{ action?: VerifyAction }>).detail;
      setAction(detail?.action || "general");
      setForced(true);
      setOpen(true);
    };
    window.addEventListener(VERIFY_REQUIRED_EVENT, onRequired);
    return () => window.removeEventListener(VERIFY_REQUIRED_EVENT, onRequired);
  }, [canUseSocialFeatures]);

  useEffect(() => {
    if (!softPrompt || loading || !userId || canUseSocialFeatures) return;
    if (verificationStatus === "pending" || verificationStatus === "needs_review") return;
    try {
      if (localStorage.getItem("dc:verify_prompt_dismissed") === "true") return;
      if (localStorage.getItem("dc:verify_soft_shown") === "true") return;
    } catch {
      return;
    }
    const t = window.setTimeout(() => {
      setAction("general");
      setForced(false);
      setOpen(true);
      try {
        localStorage.setItem("dc:verify_soft_shown", "true");
      } catch {
        // ignore
      }
    }, 2800);
    return () => window.clearTimeout(t);
  }, [softPrompt, loading, userId, canUseSocialFeatures, verificationStatus]);

  if (!open) return null;

  const closeNotNow = () => {
    dismissVerifyPrompt();
    setOpen(false);
  };

  const goVerify = () => {
    setOpen(false);
    router.push("/verify");
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/45 p-3 sm:items-center sm:p-6">
      <button
        type="button"
        aria-label="Close"
        className="absolute inset-0 cursor-default"
        onClick={forced ? undefined : closeNotNow}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="verify-prompt-title"
        className="relative w-full max-w-md overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-b from-slate-900 via-slate-900 to-indigo-950 text-white shadow-2xl"
      >
        <div className="pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full bg-sky-500/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-20 -left-10 h-44 w-44 rounded-full bg-indigo-500/25 blur-3xl" />

        <div className="relative p-6 sm:p-7">
          {!forced && (
            <button
              type="button"
              onClick={closeNotNow}
              className="absolute right-4 top-4 rounded-full p-1.5 text-white/60 transition hover:bg-white/10 hover:text-white"
              aria-label="Dismiss"
            >
              <X size={18} />
            </button>
          )}

          <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-sky-500/20 ring-1 ring-sky-400/30">
            <BadgeCheck className="text-sky-400" size={28} />
          </div>

          <h2 id="verify-prompt-title" className="text-xl font-semibold tracking-tight sm:text-2xl">
            Verify your student status
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-white/70">
            {forced
              ? `You need a verified student account to ${actionLabel(action)}. Browse papers freely — unlock likes, comments, follows, messages, and uploads after verifying your ZICTC ID.`
              : "Browse everything as a guest of campus. Verify once with your student ID to unlock social features and uploads — and earn your blue verified badge."}
          </p>

          <ul className="mt-5 space-y-2 text-sm text-white/75">
            {[
              "Like, comment, and follow channels",
              "Message other students",
              "Upload exams & materials",
              "Blue verified tick on your profile",
            ].map((item) => (
              <li key={item} className="flex items-start gap-2.5">
                <Shield size={15} className="mt-0.5 shrink-0 text-sky-400" />
                <span>{item}</span>
              </li>
            ))}
          </ul>

          <div className="mt-7 flex flex-col-reverse gap-2.5 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={closeNotNow}
              className="rounded-full px-5 py-2.5 text-sm font-medium text-white/80 transition hover:bg-white/10 hover:text-white"
            >
              Not now
            </button>
            <button
              type="button"
              onClick={goVerify}
              className="rounded-full bg-sky-500 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-sky-500/25 transition hover:bg-sky-400"
            >
              Verify
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
