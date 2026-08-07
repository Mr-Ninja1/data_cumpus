"use client";
import React from "react";
import { FileText, Download, MoreVertical, Bookmark, ThumbsUp } from "lucide-react";
import { useRouter } from "next/navigation";
import { downloadPaper } from "@/utils/downloadPaper";
import { showToast } from "@/utils/toast";
import { useLibrary } from "@/hooks/useLibrary";

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
  variant?: "grid" | "shorts" | "feed";
}

const typeColors: Record<string, { bg: string; text: string; border: string }> = {
  Exam: {
    bg: "bg-blue-50 dark:bg-blue-900/20",
    text: "text-blue-700 dark:text-blue-200",
    border: "border-blue-200/90 dark:border-blue-800/60",
  },
  Test: {
    bg: "bg-amber-50 dark:bg-amber-900/20",
    text: "text-amber-700 dark:text-amber-200",
    border: "border-amber-200/90 dark:border-amber-800/60",
  },
  Material: {
    bg: "bg-emerald-50 dark:bg-emerald-900/20",
    text: "text-emerald-700 dark:text-emerald-200",
    border: "border-emerald-200/90 dark:border-emerald-800/60",
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
  school,
  thumbnailUrl,
  uploadedAt,
  uploaderName,
  uploadedBy,
  variant = "grid",
}: PaperCardProps) {
  const router = useRouter();
  const { isSaved, isLiked, toggleSave, toggleLike } = useLibrary();
  const colors = typeColors[type] || typeColors.Material;
  const saved = isSaved(id);
  const liked = isLiked(id);
  const channel = uploaderName || program || "DataCampus";
  const interestMeta = { program, school, type };

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

  if (variant === "shorts") {
    return (
      <div
        onClick={handleClick}
        className="relative rounded-xl overflow-hidden bg-gray-900 cursor-pointer active:scale-[0.99] transition-transform"
      >
        <div className="aspect-[9/16] w-full bg-gradient-to-br from-gray-700 to-gray-900">
          {thumbnailUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={thumbnailUrl} alt={title} className="object-cover w-full h-full" loading="lazy" />
          ) : (
            <div className="h-full w-full flex items-center justify-center">
              <FileText className="text-white/50 w-10 h-10" />
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent" />
        </div>
        <div className="absolute left-2.5 right-2.5 bottom-2.5 space-y-1">
          <span className={`inline-flex px-2 py-0.5 text-[10px] font-semibold rounded ${colors.bg} ${colors.text}`}>
            {type}
          </span>
          <div className="text-[13px] font-semibold leading-snug text-white line-clamp-2">{title}</div>
        </div>
      </div>
    );
  }

  // YouTube-style mobile feed card (also used as default on mobile via home page)
  if (variant === "feed") {
    return (
      <article
        onClick={handleClick}
        className="bg-white dark:bg-gray-950 cursor-pointer active:bg-gray-50 dark:active:bg-gray-900/80 transition-colors"
      >
        <div className="relative aspect-video w-full bg-gradient-to-br from-gray-200 to-gray-300 dark:from-gray-800 dark:to-gray-900">
          {thumbnailUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={thumbnailUrl} alt={title} className="object-cover w-full h-full" loading="lazy" />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center">
              <FileText className="text-gray-400 dark:text-gray-600 w-14 h-14" />
            </div>
          )}
          <span className="absolute bottom-2 right-2 bg-black/80 text-white text-[11px] font-semibold px-1.5 py-0.5 rounded">
            PDF
          </span>
          <span className={`absolute top-2 left-2 text-[10px] font-semibold px-1.5 py-0.5 rounded ${colors.bg} ${colors.text}`}>
            {type}
          </span>
        </div>

        <div className="flex gap-3 px-3 pt-3 pb-4">
          <button
            type="button"
            onClick={openChannel}
            className="flex-shrink-0 h-9 w-9 rounded-full bg-gradient-to-br from-red-500 to-rose-600 text-white text-xs font-bold flex items-center justify-center"
            aria-label="Channel"
          >
            {initials(channel)}
          </button>

          <div className="min-w-0 flex-1">
            <h3 className="text-[15px] font-medium leading-snug text-gray-900 dark:text-gray-50 line-clamp-2">
              {title}
            </h3>
            <p className="mt-1 text-[12px] text-gray-500 dark:text-gray-400 leading-snug line-clamp-1">
              <button type="button" onClick={openChannel} className="hover:text-gray-700 dark:hover:text-gray-300">
                {channel}
              </button>
              {" · "}
              {program}
              {uploadedAt ? ` · ${relativeDate(uploadedAt)}` : ""}
            </p>
          </div>

          <div className="flex-shrink-0 relative">
            <details className="relative" onClick={(e) => e.stopPropagation()}>
              <summary className="list-none p-1.5 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 cursor-pointer [&::-webkit-details-marker]:hidden">
                <MoreVertical size={18} className="text-gray-600 dark:text-gray-400" />
              </summary>
              <div className="absolute right-0 top-8 z-20 w-40 rounded-xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 shadow-lg py-1">
                <button
                  type="button"
                  onClick={() => toggleSave(id, interestMeta)}
                  className="w-full flex items-center gap-2 px-3 py-2.5 text-sm hover:bg-gray-50 dark:hover:bg-gray-800"
                >
                  <Bookmark size={16} className={saved ? "fill-current" : ""} />
                  {saved ? "Saved" : "Save"}
                </button>
                <button
                  type="button"
                  onClick={() => toggleLike(id, interestMeta)}
                  className="w-full flex items-center gap-2 px-3 py-2.5 text-sm hover:bg-gray-50 dark:hover:bg-gray-800"
                >
                  <ThumbsUp size={16} className={liked ? "fill-current" : ""} />
                  {liked ? "Liked" : "Like"}
                </button>
                <button
                  type="button"
                  onClick={handleDownload}
                  className="w-full flex items-center gap-2 px-3 py-2.5 text-sm hover:bg-gray-50 dark:hover:bg-gray-800"
                >
                  <Download size={16} />
                  Download
                </button>
              </div>
            </details>
          </div>
        </div>
      </article>
    );
  }

  // Desktop / tablet grid card
  return (
    <div
      onClick={handleClick}
      className="bg-white dark:bg-gray-950 rounded-2xl border border-gray-200 dark:border-gray-800 transition-shadow duration-200 cursor-pointer overflow-hidden group hover:shadow-md active:scale-[0.995]"
    >
      <div className="aspect-video bg-gradient-to-br from-stone-100 to-stone-200 dark:from-gray-800 dark:to-gray-900 flex items-center justify-center relative overflow-hidden">
        {thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={thumbnailUrl}
            alt={title}
            className="object-cover w-full h-full transition-transform duration-300"
            loading="lazy"
          />
        ) : (
          <div className="relative">
            <FileText className="text-gray-400 dark:text-gray-600 w-16 h-16 transition-transform duration-300" />
          </div>
        )}
        <span className="absolute top-3 right-3 bg-white/80 dark:bg-gray-900/60 backdrop-blur border border-gray-200 dark:border-gray-800 text-gray-800 dark:text-gray-100 text-[11px] font-semibold px-2 py-1 rounded-lg">
          PDF
        </span>
        <details className="absolute top-3 left-3" onClick={(e) => e.stopPropagation()}>
          <summary className="list-none p-1.5 rounded-full bg-white/80 dark:bg-gray-900/60 backdrop-blur border border-gray-200 dark:border-gray-800 hover:bg-white dark:hover:bg-gray-800 cursor-pointer [&::-webkit-details-marker]:hidden">
            <MoreVertical size={18} className="text-gray-600 dark:text-gray-300" />
          </summary>
          <div className="absolute left-0 top-8 z-20 w-44 rounded-xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 shadow-lg py-1">
            <button
              type="button"
              onClick={() => toggleSave(id, interestMeta)}
              className="w-full flex items-center gap-2 px-3 py-2.5 text-sm hover:bg-gray-50 dark:hover:bg-gray-800"
            >
              <Bookmark size={16} />
              {saved ? "Saved" : "Save"}
            </button>
            <button
              type="button"
              onClick={() => toggleLike(id, interestMeta)}
              className="w-full flex items-center gap-2 px-3 py-2.5 text-sm hover:bg-gray-50 dark:hover:bg-gray-800"
            >
              <ThumbsUp size={16} />
              {liked ? "Liked" : "Like"}
            </button>
            <button
              type="button"
              onClick={handleDownload}
              className="w-full flex items-center gap-2 px-3 py-2.5 text-sm hover:bg-gray-50 dark:hover:bg-gray-800"
            >
              <Download size={16} />
              Download
            </button>
          </div>
        </details>
      </div>

      <div className="p-3 sm:p-4">
        <div className="flex items-start gap-3">
          <button
            type="button"
            onClick={openChannel}
            className="mt-0.5 flex-shrink-0 h-9 w-9 rounded-full bg-gradient-to-br from-violet-600 to-cyan-500 text-white text-xs font-bold flex items-center justify-center"
            aria-label="Open uploader profile"
          >
            {initials(channel)}
          </button>
          <div className="min-w-0 flex-1">
            <div className="mb-2 flex items-center gap-2">
              <span className={`inline-block px-2.5 py-0.5 text-[11px] font-semibold rounded-full border ${colors.bg} ${colors.text} ${colors.border}`}>
                {type}
              </span>
              {school && (
                <span className="text-[11px] text-gray-500 dark:text-gray-400 truncate">
                  {school}
                </span>
              )}
            </div>
            <h3 className="font-semibold text-[15px] sm:text-base line-clamp-2 mb-1.5 text-gray-900 dark:text-gray-100 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
              {title}
            </h3>
            <div className="text-sm text-gray-600 dark:text-gray-300 truncate">
              {channel}
            </div>
            <div className="mt-1 flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
              <span className="truncate">{program}</span>
              {uploadedAt && (
                <>
                  <span>·</span>
                  <span className="flex-shrink-0">{relativeDate(uploadedAt)}</span>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
