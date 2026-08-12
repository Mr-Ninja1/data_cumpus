"use client";

import { useEffect, useState } from "react";
import { getMediaBlob } from "@/utils/localMessageStore";

/** Renders an image from IndexedDB media_blobs by local_id. */
export default function ChatImageBubble({
  localId,
  alt = "Photo",
  className = "",
}: {
  localId: string;
  alt?: string;
  className?: string;
}) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let revoked: string | null = null;
    let cancelled = false;
    void (async () => {
      const row = await getMediaBlob(localId);
      if (cancelled || !row) return;
      const objectUrl = URL.createObjectURL(row.blob);
      revoked = objectUrl;
      setUrl(objectUrl);
    })();
    return () => {
      cancelled = true;
      if (revoked) URL.revokeObjectURL(revoked);
    };
  }, [localId]);

  if (!url) {
    return (
      <div
        className={`flex min-h-[120px] min-w-[160px] items-center justify-center rounded-xl bg-black/5 text-xs text-gray-400 ${className}`}
      >
        Loading photo…
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt={alt}
      className={`max-h-72 max-w-full rounded-xl object-cover ${className}`}
    />
  );
}
