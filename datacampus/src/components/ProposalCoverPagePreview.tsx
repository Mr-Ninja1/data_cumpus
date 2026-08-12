"use client";

import React, { useState } from "react";
import { ChevronDown, ChevronUp, ImageOff } from "lucide-react";
import Link from "next/link";

export type CoverPagePreviewProps = {
  title: string;
  schoolName: string;
  program: string;
  studentName: string;
  studentId: string;
  supervisor: string;
  location?: string;
  year: string;
  logoUrl: string | null;
  /** Raw AI-drafted cover page text, shown as a supplementary block so any
   * custom wording the student asked for in chat is never hidden. */
  extraNotes?: string;
};

export default function ProposalCoverPagePreview({
  title,
  schoolName,
  program,
  studentName,
  studentId,
  supervisor,
  location = "NDOLA, ZAMBIA",
  year,
  logoUrl,
  extraNotes,
}: CoverPagePreviewProps) {
  const [showNotes, setShowNotes] = useState(false);
  const hasExtraNotes = Boolean(extraNotes && extraNotes.trim().length > 0);

  return (
    <div className="space-y-3">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-10">
        <div className="flex flex-col items-center text-center">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt="School logo" className="mb-4 h-24 max-w-45 object-contain" />
          ) : (
            <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-xl border border-dashed border-slate-300 text-slate-400">
              <ImageOff size={22} />
            </div>
          )}
          {!logoUrl ? (
            <div className="mb-4 text-xs text-slate-500">
              No school logo uploaded yet.{" "}
              <Link href="/admin/proposals/assets" className="font-medium text-sky-700 hover:underline">
                Upload one
              </Link>{" "}
              to have it appear here automatically.
            </div>
          ) : null}

          <div className="text-xl font-bold uppercase tracking-wide text-slate-900 sm:text-2xl">
            {schoolName}
          </div>
          <div className="mt-1 text-sm italic text-slate-600 sm:text-base">{program}</div>

          <div className="mt-10 max-w-md text-lg font-bold text-slate-900 sm:text-xl">{title}</div>

          <div className="mt-8 text-base italic text-slate-700">By</div>
          <div className="mt-2 text-base font-bold uppercase text-slate-900">
            {studentName || "Student name not set"}
          </div>
          {studentId ? (
            <div className="mt-1 text-sm text-slate-700">Student Number: {studentId}</div>
          ) : (
            <div className="mt-1 text-xs text-slate-500">
              Add your student ID in{" "}
              <Link href="/profile" className="font-medium text-sky-700 hover:underline">
                your profile
              </Link>{" "}
              to include it here automatically.
            </div>
          )}

          {supervisor ? (
            <div className="mt-8 text-sm text-slate-800">
              <div className="font-semibold">Supervisor:</div>
              <div>{supervisor}</div>
            </div>
          ) : null}

          <div className="mt-10 text-sm font-bold text-slate-900">{location}</div>
          <div className="mt-1 text-sm text-slate-700">&copy;{year}</div>
        </div>
      </div>

      {hasExtraNotes ? (
        <div className="rounded-xl border border-slate-200 bg-slate-50">
          <button
            type="button"
            onClick={() => setShowNotes((value) => !value)}
            className="flex w-full items-center justify-between gap-2 px-4 py-2.5 text-left text-xs font-medium text-slate-600"
          >
            <span>AI draft notes for this cover page (from chat)</span>
            {showNotes ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
          {showNotes ? (
            <div className="whitespace-pre-wrap border-t border-slate-200 px-4 py-3 text-sm text-slate-600">
              {extraNotes}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
