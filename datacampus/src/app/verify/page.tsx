"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  BadgeCheck,
  Camera,
  CheckCircle2,
  Loader2,
  ShieldCheck,
  UploadCloud,
  Sparkles,
} from "lucide-react";
import { supabase } from "@/utils/supabaseClient";
import { useProfile } from "@/hooks/useProfile";
import Auth from "@/components/Auth";
import IdCameraCapture from "@/components/IdCameraCapture";
import VerifiedBadge from "@/components/VerifiedBadge";
import { cropStillToId } from "@/utils/idCardCrop";
import { compressImage } from "@/utils/compressImage";
import { showToast } from "@/utils/toast";
import { clearVerifyPromptDismiss } from "@/utils/verificationGate";

type Mode = "camera" | "upload";
type Step = "capture" | "review" | "done";

type Extracted = {
  fullName: string | null;
  studentId: string | null;
  program: string | null;
  confidence: number;
  source?: string;
  rawText?: string;
};

type Submission = {
  id: string;
  status: string;
  confidence: number | null;
  created_at: string;
  full_name?: string | null;
  student_id?: string | null;
};

export default function VerifyPage() {
  const router = useRouter();
  const {
    userId,
    isVerified,
    verificationStatus,
    displayName,
    fullName,
    studentId,
    refresh,
    loading: profileLoading,
  } = useProfile();

  const [authed, setAuthed] = useState<boolean | null>(null);
  const [mode, setMode] = useState<Mode>("camera");
  const [step, setStep] = useState<Step>("capture");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [busy, setBusy] = useState(false);
  const [ocrBusy, setOcrBusy] = useState(false);
  const [extracted, setExtracted] = useState<Extracted | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [requests, setRequests] = useState<Submission[]>([]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!mounted) return;
      setAuthed(Boolean(data.session));
    })();
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setAuthed(Boolean(session));
    });
    return () => {
      mounted = false;
      sub?.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!authed) return;
    void loadRequests();
  }, [authed]);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const loadRequests = async () => {
    const session = await supabase.auth.getSession();
    const token = session.data.session?.access_token;
    if (!token) return;
    const res = await fetch("/api/verify", { headers: { Authorization: `Bearer ${token}` } });
    const json = await res.json();
    const list = json.submissions || json.requests || [];
    setRequests(list);
  };

  const resetCapture = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setBlob(null);
    setExtracted(null);
    setMessage(null);
    setStep("capture");
  };

  const runOcr = async (imageBlob: Blob) => {
    setOcrBusy(true);
    setMessage(null);
    try {
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;
      if (!token) throw new Error("Please sign in first.");

      const compressed = await compressImage(imageBlob, `id-${Date.now()}.jpg`);
      const form = new FormData();
      form.append("image", compressed, compressed.name);

      const res = await fetch("/api/verify/ocr", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "OCR failed");

      setExtracted({
        fullName: json.fullName ?? null,
        studentId: json.studentId ?? null,
        program: json.program ?? null,
        confidence: typeof json.confidence === "number" ? json.confidence : 0.5,
        source: json.source,
        rawText: json.rawText,
      });
      setStep("review");
    } catch (e: unknown) {
      setMessage(e instanceof Error ? e.message : "Could not read ID");
    } finally {
      setOcrBusy(false);
    }
  };

  const onCaptured = async (b: Blob, url: string) => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setBlob(b);
    setPreviewUrl(url);
    await runOcr(b);
  };

  const onUploadFile = async (file: File | null) => {
    if (!file) return;
    setBusy(true);
    try {
      const cropped = await cropStillToId(file);
      const url = URL.createObjectURL(cropped);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setBlob(cropped);
      setPreviewUrl(url);
      await runOcr(cropped);
    } catch (e: unknown) {
      setMessage(e instanceof Error ? e.message : "Could not process image");
    } finally {
      setBusy(false);
    }
  };

  const submitVerification = async () => {
    if (!blob || !extracted) return;
    setBusy(true);
    setMessage(null);

    const session = await supabase.auth.getSession();
    const token = session.data.session?.access_token;
    const uid = session.data.session?.user?.id;
    if (!token || !uid) {
      setMessage("Please sign in first.");
      setBusy(false);
      return;
    }

    // cd.md §8C — compress on-device (WebP ≤300KB) before Storage
    const uploadFile = await compressImage(blob, `id-${Date.now()}.jpg`);
    const ext = uploadFile.type === "image/webp" ? "webp" : "jpg";
    const filePath = `verify/${uid}/${Date.now()}-id.${ext}`;
    const { error: uploadError } = await supabase.storage
      .from("papers")
      .upload(filePath, uploadFile, { contentType: uploadFile.type, upsert: false });

    if (uploadError) {
      setMessage(uploadError.message);
      setBusy(false);
      return;
    }

    const res = await fetch("/api/verify", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        documentType: "zictc_id",
        filePath,
        confidence: extracted.confidence,
        extractedName: extracted.fullName,
        extractedStudentId: extracted.studentId,
        extractedProgram: extracted.program,
        ocrPayload: {
          source: extracted.source,
          confidence: extracted.confidence,
          fullName: extracted.fullName,
          studentId: extracted.studentId,
          program: extracted.program,
        },
      }),
    });

    const json = await res.json();
    setBusy(false);
    if (!res.ok) {
      setMessage(json.error || "Verification failed.");
      return;
    }

    clearVerifyPromptDismiss();
    await refresh();
    await loadRequests();

    if (json.note) {
      setMessage("Student ID may already be in use — flagged for staff review.");
      setStep("done");
      showToast("info", "Sent for review");
      return;
    }

    const status = json.submission?.status;
    if (status === "approved") {
      showToast("success", "You're verified — blue tick unlocked");
      setStep("done");
    } else {
      showToast("info", "Submitted for review");
      setMessage("Your ID was submitted. We'll unlock your badge once review finishes.");
      setStep("done");
    }
  };

  if (authed === null || profileLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-gray-500">
        <Loader2 className="animate-spin" size={22} />
      </div>
    );
  }

  if (!authed) {
    return (
      <div className="mx-auto max-w-md px-3 py-10">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Verify student status</h1>
          <p className="mt-2 text-sm text-gray-500">Sign in first, then scan your ZICTC ID.</p>
        </div>
        <Auth />
      </div>
    );
  }

  if (isVerified || step === "done" && verificationStatus === "verified") {
    return (
      <div className="mx-auto max-w-lg px-3 py-10">
        <div className="overflow-hidden rounded-3xl border border-sky-200 bg-gradient-to-br from-sky-50 via-white to-indigo-50 p-8 text-center dark:border-sky-900/40 dark:from-sky-950/40 dark:via-gray-900 dark:to-indigo-950/30">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-sky-500/15">
            <VerifiedBadge isVerified size="md" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-50">You&apos;re verified</h1>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
            {(fullName || displayName) ?? "Student"}
            {studentId ? ` · ID ${studentId}` : ""}
          </p>
          <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">
            Likes, comments, follows, messages, and uploads are unlocked. Your blue tick shows on your profile and channel.
          </p>
          <button
            type="button"
            onClick={() => router.push(userId ? `/u/${userId}` : "/profile")}
            className="mt-6 rounded-full bg-sky-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-sky-400"
          >
            View profile
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 px-3 py-6 md:px-0 md:py-8">
      <div className="relative overflow-hidden rounded-3xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-900 sm:p-8">
        <div className="pointer-events-none absolute -right-10 -top-10 h-36 w-36 rounded-full bg-sky-400/15 blur-2xl" />
        <div className="relative flex min-w-0 items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-sky-500/15 text-sky-600 dark:text-sky-400">
            <ShieldCheck size={22} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="mb-1 inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-sky-600 dark:text-sky-400">
              <Sparkles size={12} />
              Student verification
            </p>
            <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-gray-50 sm:text-3xl">
              Verify your student status
            </h1>
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-gray-600 dark:text-gray-400">
              Scan your ZICTC ID with the camera — we auto-crop the card and read your name &amp; student number.
              Until you&apos;re verified you can browse freely, but social actions stay locked.
            </p>
            {verificationStatus === "pending" || verificationStatus === "needs_review" ? (
              <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
                A previous submission is {verificationStatus.replace("_", " ")}. You can submit again if needed.
              </p>
            ) : null}
          </div>
        </div>
      </div>

      <div className="rounded-3xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900 sm:p-6">
        <div className="mb-5 flex gap-2 rounded-full bg-gray-100 p-1 dark:bg-gray-800">
          <button
            type="button"
            onClick={() => {
              setMode("camera");
              resetCapture();
            }}
            className={`flex flex-1 items-center justify-center gap-2 rounded-full px-3 py-2 text-sm font-medium transition ${
              mode === "camera"
                ? "bg-white text-gray-900 shadow-sm dark:bg-gray-700 dark:text-white"
                : "text-gray-500 dark:text-gray-400"
            }`}
          >
            <Camera size={16} />
            Camera
          </button>
          <button
            type="button"
            onClick={() => {
              setMode("upload");
              resetCapture();
            }}
            className={`flex flex-1 items-center justify-center gap-2 rounded-full px-3 py-2 text-sm font-medium transition ${
              mode === "upload"
                ? "bg-white text-gray-900 shadow-sm dark:bg-gray-700 dark:text-white"
                : "text-gray-500 dark:text-gray-400"
            }`}
          >
            <UploadCloud size={16} />
            Upload
          </button>
        </div>

        {step === "capture" && mode === "camera" && (
          <IdCameraCapture onCaptured={onCaptured} disabled={ocrBusy || busy} />
        )}

        {step === "capture" && mode === "upload" && (
          <label className="flex cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-gray-300 bg-gray-50 p-10 text-center transition hover:border-sky-400 hover:bg-sky-50/50 dark:border-gray-700 dark:bg-gray-950/50 dark:hover:border-sky-600">
            {busy || ocrBusy ? (
              <Loader2 className="animate-spin text-sky-500" size={28} />
            ) : (
              <UploadCloud size={28} className="text-gray-400" />
            )}
            <span className="text-sm font-medium text-gray-700 dark:text-gray-200">
              Drop or choose an ID photo
            </span>
            <span className="text-xs text-gray-500">We&apos;ll crop to the card automatically</span>
            <input
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              disabled={busy || ocrBusy}
              onChange={(e) => void onUploadFile(e.target.files?.[0] || null)}
            />
          </label>
        )}

        {(step === "review" || step === "done") && previewUrl && (
          <div className="space-y-5">
            <div className="overflow-hidden rounded-2xl border border-gray-200 dark:border-gray-700">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={previewUrl} alt="Cropped student ID" className="max-h-64 w-full object-contain bg-gray-950" />
            </div>

            {ocrBusy && (
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <Loader2 className="animate-spin" size={16} />
                Reading your ID…
              </div>
            )}

            {extracted && step === "review" && (
              <div className="space-y-3 rounded-2xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-950/60">
                <div className="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-gray-100">
                  <BadgeCheck size={16} className="text-sky-500" />
                  Extracted details
                  <span className="ml-auto text-xs font-normal text-gray-500">
                    Confidence {Math.round(extracted.confidence * 100)}%
                  </span>
                </div>
                <dl className="grid gap-3 sm:grid-cols-2">
                  {(
                    [
                      ["Full name", extracted.fullName],
                      ["Student ID", extracted.studentId],
                      ["Programme", extracted.program],
                    ] as const
                  ).map(([label, value]) => (
                    <div key={label}>
                      <dt className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                        {label}
                      </dt>
                      <dd className="mt-0.5 text-sm font-medium text-gray-900 dark:text-gray-100">
                        {value || <span className="text-amber-600 dark:text-amber-400">Not detected — staff review</span>}
                      </dd>
                    </div>
                  ))}
                </dl>
                {extracted.source === "stub" && (
                  <p className="text-xs text-amber-700 dark:text-amber-300">
                    {extracted.rawText?.includes("failed")
                      ? "Live OCR temporarily failed — your submission will go to review."
                      : "Live OCR isn&apos;t configured on this server — your submission will go to review."}
                  </p>
                )}
              </div>
            )}

            {step === "review" && (
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={resetCapture}
                  className="rounded-full border border-gray-200 px-4 py-2.5 text-sm font-medium dark:border-gray-700"
                >
                  Retake
                </button>
                <button
                  type="button"
                  onClick={() => void submitVerification()}
                  disabled={busy}
                  className="inline-flex flex-1 items-center justify-center gap-2 rounded-full bg-sky-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-sky-400 disabled:opacity-50 sm:flex-none"
                >
                  {busy ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
                  Confirm &amp; submit
                </button>
              </div>
            )}

            {step === "done" && (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-200">
                {message || "Verification submitted."}
                <div className="mt-3">
                  <button
                    type="button"
                    onClick={() => router.push("/profile")}
                    className="rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500"
                  >
                    Back to profile
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {message && step !== "done" && (
          <p className="mt-4 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-300">
            {message}
          </p>
        )}
      </div>

      <div className="rounded-3xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900 sm:p-6">
        <h2 className="font-semibold text-gray-900 dark:text-gray-100">Recent requests</h2>
        <div className="mt-4 space-y-3">
          {requests.length === 0 ? (
            <p className="text-sm text-gray-500">No verification requests yet.</p>
          ) : (
            requests.map((request) => (
              <div
                key={request.id}
                className="rounded-xl border border-gray-200 p-3 text-sm dark:border-gray-700"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium capitalize text-gray-900 dark:text-gray-100">
                    {request.status}
                  </span>
                  <span className="text-gray-500">
                    {request.created_at ? new Date(request.created_at).toLocaleDateString() : "—"}
                  </span>
                </div>
                <div className="mt-1 text-gray-600 dark:text-gray-400">
                  {request.full_name || "—"}
                  {request.student_id ? ` · ${request.student_id}` : ""}
                  {request.confidence != null
                    ? ` · ${Math.round(Number(request.confidence) * 100)}%`
                    : ""}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
