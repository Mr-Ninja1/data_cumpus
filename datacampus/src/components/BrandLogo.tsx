"use client";

import React from "react";
import AiLogo from "@/components/AiLogo";

type Props = {
  size?: "sm" | "md" | "lg";
  className?: string;
  showWordmark?: boolean;
};

const sizes = {
  sm: { mark: 24, text: "text-[18px]" },
  md: { mark: 32, text: "text-xl" },
  lg: { mark: 40, text: "text-2xl" },
};

/** DataCampus AI brand mark + optional wordmark. */
export default function BrandLogo({ size = "md", className = "", showWordmark = true }: Props) {
  const s = sizes[size];
  return (
    <span className={`inline-flex min-w-0 items-center gap-1.5 ${className}`}>
      <AiLogo size={s.mark} />
      {showWordmark && (
        <span
          className={`truncate font-semibold tracking-tight text-gray-900 dark:text-white ${s.text}`}
        >
          DataCampus
        </span>
      )}
    </span>
  );
}
