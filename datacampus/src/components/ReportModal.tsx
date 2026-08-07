"use client";

import React, { useState } from "react";
import { X, Flag, Loader2 } from "lucide-react";
import ModalPortal from "@/components/ModalPortal";
import { supabase } from "@/utils/supabaseClient";
import { showToast } from "@/utils/toast";

const REASONS = [
  "Spam or misleading",
  "Copyright / academic integrity",
  "Harassment or hate",
  "Wrong subject or program",
  "Other",
];

type Props = {
  paperId?: string;
  commentId?: string;
  onClose: () => void;
};

export default function ReportModal({ paperId, commentId, onClose }: Props) {
  const [reason, setReason] = useState(REASONS[0]);
  const [details, setDetails] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    const { data: sessionData } = await supabase.auth.getSession();
    const userId = sessionData.session?.user?.id;
    if (!userId) {
      showToast("info", "Sign in to report content");
      await supabase.auth.signInWithOAuth({ provider: "google" });
      return;
    }

    setSubmitting(true);
    try {
      const { error } = await supabase.from("reports").insert({
        reporter_id: userId,
        paper_id: paperId || null,
        comment_id: commentId || null,
        reason,
        details: details.trim() || null,
      });
      if (error) throw error;
      showToast("success", "Report submitted — staff will review it");
      onClose();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Could not submit report";
      showToast("error", msg.includes("reports") ? "Run wave_c migration in Supabase first" : msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4">
        <button
          type="button"
          className="absolute inset-0 bg-black/50 backdrop-blur-sm"
          aria-label="Close"
          onClick={onClose}
        />
        <div className="relative w-full sm:max-w-md bg-white dark:bg-gray-900 rounded-t-2xl sm:rounded-2xl shadow-xl border border-gray-200 dark:border-gray-800 p-5 pb-8 sm:pb-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Flag className="w-5 h-5 text-amber-600" />
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Report content</h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
            Reports go to moderators. Abuse of reporting may lead to account restrictions.
          </p>

          <label className="block mb-3">
            <span className="text-xs font-semibold uppercase text-gray-500">Reason</span>
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="mt-1 w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm"
            >
              {REASONS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </label>

          <label className="block mb-5">
            <span className="text-xs font-semibold uppercase text-gray-500">Details (optional)</span>
            <textarea
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              rows={3}
              maxLength={1000}
              placeholder="Anything else staff should know?"
              className="mt-1 w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm resize-none"
            />
          </label>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2.5 rounded-xl bg-gray-100 dark:bg-gray-800 text-sm font-medium"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={submitting}
              onClick={() => void submit()}
              className="flex-1 px-4 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium disabled:opacity-50 inline-flex items-center justify-center gap-2"
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              Submit report
            </button>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}
