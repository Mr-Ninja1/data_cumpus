import React from "react";
import { FileText } from "lucide-react";
import { useRouter } from "next/navigation";

interface CompactPaperCardProps {
  id: string;
  title: string;
  program: string;
  type: string;
  file_url?: string;
  large?: boolean;
}

export default function CompactPaperCard({ id, title, program, type, file_url, large = false }: CompactPaperCardProps) {
  const router = useRouter();
  return (
    <div onClick={() => router.push(`/paper/${id}`)} className="flex gap-3 items-start cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 p-3 rounded">
      <div className={`bg-gray-200 dark:bg-gray-800 rounded flex items-center justify-center overflow-hidden ${large ? 'w-40 h-24' : 'w-28 h-16'}`}>
        {file_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={file_url} alt={title} className="w-full h-full object-cover" />
        ) : (
          <FileText className="text-gray-400 w-8 h-8" />
        )}
      </div>
      <div className="flex-1">
        <div className="text-sm md:text-base font-semibold line-clamp-2">{title}</div>
        <div className="text-xs md:text-sm text-gray-500 dark:text-gray-400 mt-1 flex justify-between">
          <span>{program}</span>
          <span>{type}</span>
        </div>
      </div>
    </div>
  );
}
