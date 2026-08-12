"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { FileText } from "lucide-react";
import { formatCount } from "@/utils/formatCount";
import VerifiedBadge from "@/components/VerifiedBadge";

interface Props {
  id: string;
  title: string;
  program: string;
  type: string;
  file_url?: string;
  uploaderName?: string | null;
  uploaderVerified?: boolean;
  viewCount?: number | null;
  uploadedAt?: string | null;
}

function relativeDate(dateString?: string | null) {
  if (!dateString) return "";
  const date = new Date(dateString);
  const diff = Date.now() - date.getTime();
  const days = Math.floor(diff / 86400000);
  if (days < 1) return "Today";
  if (days === 1) return "1 day ago";
  if (days < 7) return `${days} days ago`;
  if (days < 30) return `${Math.floor(days / 7)} week${days >= 14 ? "s" : ""} ago`;
  if (days < 365) return `${Math.floor(days / 30)} month${days >= 60 ? "s" : ""} ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function RightRecommendCard({
  id,
  title,
  program,
  type,
  uploaderName,
  uploaderVerified = false,
  viewCount = 0,
  uploadedAt,
}: Props) {
  const router = useRouter();
  const channel = uploaderName || program || "DataCampus";
  const views = Math.max(0, Number(viewCount) || 0);

  return (
    <button
      type="button"
      onClick={() => router.push(`/paper/${id}`)}
      className="flex w-full gap-2 rounded-xl p-1.5 text-left transition-colors hover:bg-gray-100 dark:hover:bg-gray-800/80"
    >
      <div className="relative h-[68px] w-[120px] shrink-0 overflow-hidden rounded-lg bg-gradient-to-br from-gray-200 to-gray-300 dark:from-gray-800 dark:to-gray-900 sm:h-[74px] sm:w-[140px]">
        <div className="flex h-full w-full items-center justify-center">
          <FileText className="h-7 w-7 text-gray-400 dark:text-gray-600" />
        </div>
        <span className="absolute bottom-1 right-1 rounded bg-black/80 px-1 py-0.5 text-[10px] font-semibold text-white">
          {type || "PDF"}
        </span>
      </div>

      <div className="min-w-0 flex-1 py-0.5">
        <div className="line-clamp-2 text-[13px] font-medium leading-snug text-gray-900 dark:text-gray-50">
          {title}
        </div>
        <div className="mt-1 flex items-center gap-1 text-[12px] text-gray-500 dark:text-gray-400">
          <span className="truncate">{channel}</span>
          {uploaderVerified && <VerifiedBadge isVerified size="xs" className="shrink-0" />}
        </div>
        <div className="mt-0.5 text-[12px] text-gray-500 dark:text-gray-400">
          {formatCount(views)} views
          {uploadedAt ? ` · ${relativeDate(uploadedAt)}` : ""}
        </div>
      </div>
    </button>
  );
}
