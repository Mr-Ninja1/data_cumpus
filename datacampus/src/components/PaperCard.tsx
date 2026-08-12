"use client";
import React from "react";
import { FileText, MoreVertical, Download } from "lucide-react";
import { useRouter } from "next/navigation";
import { downloadPaper } from "@/utils/downloadPaper";
import { showToast } from "@/utils/toast";
import { formatCount } from "@/utils/formatCount";
import VerifiedBadge from "@/components/VerifiedBadge";

interface PaperCardProps {
  id: string;
  title: string;
  program: string;
  type: string;
  school?: string;
  thumbnailUrl?: string;
  uploadedAt?: string;
  uploaderName?: string | null;
  uploadedBy?: string | null;
  uploaderRole?: string | null;
  uploaderVerified?: boolean | null;
  viewCount?: number | null;
  likeCount?: number | null;
  variant?: "grid" | "shorts" | "feed";
}

const typeColors: Record<string, { bg: string; text: string }> = {
  Exam: {
    bg: "bg-blue-50 dark:bg-blue-900/30",
    text: "text-blue-700 dark:text-blue-200",
  },
  Test: {
    bg: "bg-amber-50 dark:bg-amber-900/30",
    text: "text-amber-700 dark:text-amber-200",
  },
  Material: {
    bg: "bg-emerald-50 dark:bg-emerald-900/30",
    text: "text-emerald-700 dark:text-emerald-200",
  },
};

function initials(name?: string | null) {
  if (!name) return "DC";
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

function relativeDate(dateString?: string) {
  if (!dateString) return "";
  const date = new Date(dateString);
  const diff = Date.now() - date.getTime();
  const days = Math.floor(diff / 86400000);
  if (days < 1) return "Today";
  if (days === 1) return "1 day ago";
  if (days < 7) return `${days} days ago`;
  if (days < 30) return `${Math.floor(days / 7)} week${days >= 14 ? "s" : ""} ago`;
  if (days < 365) return `${Math.floor(days / 30)} month${days >= 60 ? "s" : ""} ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function PaperCard({
  id,
  title,
  program,
  type,
  thumbnailUrl,
  uploadedAt,
  uploaderName,
  uploadedBy,
  uploaderRole,
  uploaderVerified = false,
  viewCount = 0,
  variant = "grid",
}: PaperCardProps) {
  const router = useRouter();
  const colors = typeColors[type] || typeColors.Material;
  const channel = uploaderName || program || "DataCampus";
  const views = Math.max(0, Number(viewCount) || 0);

  const handleClick = () => router.push(`/paper/${id}`);

  const handleDownload = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await downloadPaper(id, title);
      showToast("success", "Download started");
    } catch (err: any) {
      showToast("error", err?.message || "Download failed");
    }
  };

  const openChannel = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (uploadedBy) router.push(`/u/${uploadedBy}`);
  };

  const metaLine = (
    <>
      <button
        type="button"
        onClick={openChannel}
        className="inline-flex max-w-full items-center gap-1 hover:text-gray-800 dark:hover:text-gray-200"
      >
        <span className="truncate">{channel}</span>
        <VerifiedBadge
          role={uploaderRole}
          isVerified={uploaderVerified}
          size="xs"
          className="shrink-0"
        />
      </button>
      <span className="mx-1">·</span>
      <span className="shrink-0">{formatCount(views)} views</span>
      {uploadedAt ? (
        <>
          <span className="mx-1">·</span>
          <span className="shrink-0">{relativeDate(uploadedAt)}</span>
        </>
      ) : null}
    </>
  );

  if (variant === "shorts") {
    return (
      <div
        onClick={handleClick}
        className="relative cursor-pointer overflow-hidden rounded-xl bg-gray-900 transition-transform active:scale-[0.99]"
      >
        <div className="aspect-[9/16] w-full bg-gradient-to-br from-gray-700 to-gray-900">
          {thumbnailUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={thumbnailUrl} alt={title} className="h-full w-full object-cover" loading="lazy" />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <FileText className="h-10 w-10 text-white/50" />
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent" />
        </div>
        <div className="absolute bottom-2.5 left-2.5 right-2.5 space-y-1">
          <span className={`inline-flex rounded px-2 py-0.5 text-[10px] font-semibold ${colors.bg} ${colors.text}`}>
            {type}
          </span>
          <div className="line-clamp-2 text-[13px] font-semibold leading-snug text-white">{title}</div>
          <div className="text-[11px] text-white/75">{formatCount(views)} views</div>
        </div>
      </div>
    );
  }

  // YouTube feed + grid: thumbnail → avatar + title → channel ✓ · views · date
  return (
    <article
      onClick={handleClick}
      className={`cursor-pointer transition-colors ${
        variant === "feed"
          ? "bg-white active:bg-gray-50 dark:bg-gray-950 dark:active:bg-gray-900/80"
          : "group"
      }`}
    >
      <div
        className={`relative aspect-video w-full overflow-hidden bg-gradient-to-br from-gray-200 to-gray-300 dark:from-gray-800 dark:to-gray-900 ${
          variant === "feed" ? "" : "rounded-xl"
        }`}
      >
        {thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={thumbnailUrl} alt={title} className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <FileText className="h-12 w-12 text-gray-400 dark:text-gray-600 sm:h-14 sm:w-14" />
          </div>
        )}
        <span className="absolute bottom-2 right-2 rounded bg-black/80 px-1.5 py-0.5 text-[11px] font-semibold text-white">
          PDF
        </span>
        <span
          className={`absolute left-2 top-2 rounded px-1.5 py-0.5 text-[10px] font-semibold ${colors.bg} ${colors.text}`}
        >
          {type}
        </span>
      </div>

      <div className={`flex gap-3 ${variant === "feed" ? "px-3 pb-4 pt-3" : "pt-3"}`}>
        <button
          type="button"
          onClick={openChannel}
          className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-red-500 to-rose-600 text-xs font-bold text-white"
          aria-label="Channel"
        >
          {initials(channel)}
        </button>

        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-1">
            <h3 className="line-clamp-2 flex-1 text-[15px] font-medium leading-snug text-gray-900 dark:text-gray-50">
              {title}
            </h3>
            <details className="relative shrink-0" onClick={(e) => e.stopPropagation()}>
              <summary className="cursor-pointer list-none rounded-full p-1 hover:bg-gray-100 dark:hover:bg-gray-800 [&::-webkit-details-marker]:hidden">
                <MoreVertical size={18} className="text-gray-600 dark:text-gray-400" />
              </summary>
              <div className="absolute right-0 top-8 z-20 w-40 rounded-xl border border-gray-200 bg-white py-1 shadow-lg dark:border-gray-800 dark:bg-gray-900">
                <button
                  type="button"
                  onClick={handleDownload}
                  className="flex w-full items-center gap-2 px-3 py-2.5 text-sm hover:bg-gray-50 dark:hover:bg-gray-800"
                >
                  <Download size={16} />
                  Download
                </button>
              </div>
            </details>
          </div>
          <p className="mt-1 flex flex-wrap items-center text-[12px] leading-snug text-gray-500 dark:text-gray-400">
            {metaLine}
          </p>
        </div>
      </div>
    </article>
  );
}
