"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import LoadingSkeleton from "@/components/LoadingSkeleton";

/** Notifications live in Inbox → Activity (single surface). */
export default function NotificationsRedirectPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/inbox");
  }, [router]);
  return <LoadingSkeleton />;
}
