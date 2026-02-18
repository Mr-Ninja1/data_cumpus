import React from "react";
import { useRouter } from "next/navigation";
import { FileText } from "lucide-react";

interface Props {
  id: string;
  title: string;
  program: string;
  type: string;
  file_url?: string;
}

export default function RightRecommendCard({ id, title, program, type, file_url }: Props) {
  const router = useRouter();

  return (
    <div onClick={() => router.push(`/paper/${id}`)} className="flex gap-3 items-start cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 p-3 rounded">
      <div className="relative w-36 h-24 md:w-40 md:h-28 bg-gray-200 dark:bg-gray-800 rounded overflow-hidden flex-shrink-0 flex items-center justify-center">
        <FileText className="text-gray-400 w-10 h-10" />
        <div className="absolute top-2 right-2 bg-black/70 text-white text-xs px-2 py-0.5 rounded">PDF</div>
      </div>

      <div className="flex-1">
        <div className="text-sm md:text-base font-semibold leading-tight line-clamp-2">{title}</div>
        <div className="text-xs md:text-sm text-gray-500 dark:text-gray-400 mt-2 flex items-center justify-between">
          <span>{program}</span>
          <span>{type}</span>
        </div>
      </div>
    </div>
  );
}
