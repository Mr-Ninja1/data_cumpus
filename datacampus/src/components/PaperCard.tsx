import React from "react";
import { FileText } from "lucide-react";

import { useRouter } from "next/navigation";

interface PaperCardProps {
  id: string;
  title: string;
  program: string;
  type: string;
  thumbnailUrl?: string;
}

export default function PaperCard({ id, title, program, type, thumbnailUrl }: PaperCardProps) {
  const router = useRouter();
  const handleClick = () => router.push(`/paper/${id}`);
  return (
    <div onClick={handleClick} className="bg-white dark:bg-gray-900 rounded-lg shadow hover:scale-[1.03] transition-transform duration-200 cursor-pointer overflow-hidden group">
      <div className="aspect-video bg-gray-200 dark:bg-gray-800 flex items-center justify-center relative">
        {thumbnailUrl ? (
          <img src={thumbnailUrl} alt={title} className="object-cover w-full h-full" />
        ) : (
          <FileText className="text-gray-400 w-12 h-12" />
        )}
        <span className="absolute top-2 right-2 bg-black/60 text-white text-xs px-2 py-0.5 rounded">PDF</span>
      </div>
      <div className="p-3">
        <div className="font-semibold text-base line-clamp-2 mb-1">{title}</div>
        <div className="text-xs text-gray-500 dark:text-gray-400 flex justify-between">
          <span>{program}</span>
          <span>{type}</span>
        </div>
      </div>
    </div>
  );
}
