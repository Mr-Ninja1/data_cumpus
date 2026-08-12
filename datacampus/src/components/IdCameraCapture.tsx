"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Camera, FlipHorizontal, Loader2, RefreshCw, Check } from "lucide-react";
import { captureAndCropId, guideRectNormalized, ID_ASPECT } from "@/utils/idCardCrop";

type Props = {
  onCaptured: (blob: Blob, previewUrl: string) => void;
  disabled?: boolean;
};

export default function IdCameraCapture({ onCaptured, disabled }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [capturing, setCapturing] = useState(false);
  const [facingMode, setFacingMode] = useState<"environment" | "user">("environment");
  const [guide, setGuide] = useState({ top: "12%", left: "8%", width: "84%", height: "76%" });

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setReady(false);
  }, []);

  const start = useCallback(async () => {
    setError(null);
    stop();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: facingMode },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
      });
      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) return;
      video.srcObject = stream;
      await video.play();
      setReady(true);

      const updateGuide = () => {
        const vw = video.videoWidth || 16;
        const vh = video.videoHeight || 9;
        const g = guideRectNormalized(vw, vh);
        setGuide({
          left: `${(g.x / vw) * 100}%`,
          top: `${(g.y / vh) * 100}%`,
          width: `${(g.w / vw) * 100}%`,
          height: `${(g.h / vh) * 100}%`,
        });
      };
      video.onloadedmetadata = updateGuide;
      updateGuide();
    } catch (e: unknown) {
      const msg =
        e instanceof Error
          ? e.message
          : "Camera access denied. Allow camera or upload an image instead.";
      setError(msg);
      setReady(false);
    }
  }, [facingMode, stop]);

  useEffect(() => {
    void start();
    return () => stop();
  }, [start, stop]);

  const flip = () => {
    setFacingMode((m) => (m === "environment" ? "user" : "environment"));
  };

  const snap = async () => {
    const video = videoRef.current;
    if (!video || !ready || capturing || disabled) return;
    setCapturing(true);
    try {
      const blob = await captureAndCropId(video);
      const url = URL.createObjectURL(blob);
      onCaptured(blob, url);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Capture failed");
    } finally {
      setCapturing(false);
    }
  };

  return (
    <div className="space-y-3">
      <div
        className="relative overflow-hidden rounded-2xl bg-black shadow-inner"
        style={{ aspectRatio: String(ID_ASPECT) }}
      >
        <video
          ref={videoRef}
          playsInline
          muted
          className="absolute inset-0 h-full w-full object-cover"
        />

        {/* Dim outside the ID guide */}
        <div className="pointer-events-none absolute inset-0">
          <div
            className="absolute rounded-xl border-2 border-sky-400/90 shadow-[0_0_0_9999px_rgba(0,0,0,0.55)]"
            style={guide}
          >
            <div className="absolute left-2 top-2 h-5 w-5 border-l-2 border-t-2 border-white/90" />
            <div className="absolute right-2 top-2 h-5 w-5 border-r-2 border-t-2 border-white/90" />
            <div className="absolute bottom-2 left-2 h-5 w-5 border-b-2 border-l-2 border-white/90" />
            <div className="absolute bottom-2 right-2 h-5 w-5 border-b-2 border-r-2 border-white/90" />
            <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-sky-300/30" />
            <p className="absolute inset-x-0 bottom-3 text-center text-[11px] font-medium tracking-wide text-white/90 drop-shadow">
              Align ID inside the frame
            </p>
          </div>
        </div>

        {!ready && !error && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/70 text-sm text-white/80">
            <Loader2 className="mr-2 animate-spin" size={18} />
            Starting camera…
          </div>
        )}
      </div>

      {error && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-200">
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={snap}
          disabled={!ready || capturing || disabled}
          className="inline-flex flex-1 items-center justify-center gap-2 rounded-full bg-sky-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-sky-400 disabled:opacity-50 sm:flex-none"
        >
          {capturing ? <Loader2 size={16} className="animate-spin" /> : <Camera size={16} />}
          {capturing ? "Cropping…" : "Capture & auto-crop"}
        </button>
        <button
          type="button"
          onClick={flip}
          disabled={disabled}
          className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-3.5 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
        >
          <FlipHorizontal size={16} />
          Flip
        </button>
        <button
          type="button"
          onClick={() => void start()}
          disabled={disabled}
          className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-3.5 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
        >
          <RefreshCw size={16} />
          Retry
        </button>
      </div>

      <p className="flex items-start gap-2 text-xs text-gray-500 dark:text-gray-400">
        <Check size={14} className="mt-0.5 shrink-0 text-emerald-500" />
        We detect your card edges and crop out desk, hands, and background before OCR.
      </p>
    </div>
  );
}
