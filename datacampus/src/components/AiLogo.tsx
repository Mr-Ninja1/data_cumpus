"use client";

import React, { useId } from "react";

type Props = {
  size?: number;
  className?: string;
};

/** Compact AI mark used in header + mobile Work tab. */
export default function AiLogo({ size = 24, className = "" }: Props) {
  const uid = useId().replace(/:/g, "");
  const gradId = `dcAiGrad-${uid}`;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden
    >
      <rect width="32" height="32" rx="9" fill={`url(#${gradId})`} />
      <path
        d="M16 7.5l1.15 3.55L20.7 12.2l-3.55 1.15L16 16.9l-1.15-3.55L11.3 12.2l3.55-1.15L16 7.5z"
        fill="white"
      />
      <path
        d="M22.5 17.2l.7 2.15 2.15.7-2.15.7-.7 2.15-.7-2.15-2.15-.7 2.15-.7.7-2.15z"
        fill="white"
        fillOpacity="0.9"
      />
      <path
        d="M9.2 18.4l.55 1.7 1.7.55-1.7.55-.55 1.7-.55-1.7-1.7-.55 1.7-.55.55-1.7z"
        fill="white"
        fillOpacity="0.75"
      />
      <defs>
        <linearGradient id={gradId} x1="4" y1="2" x2="28" y2="30" gradientUnits="userSpaceOnUse">
          <stop stopColor="#7C3AED" />
          <stop offset="0.55" stopColor="#4F46E5" />
          <stop offset="1" stopColor="#06B6D4" />
        </linearGradient>
      </defs>
    </svg>
  );
}
