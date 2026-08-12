"use client";

import React from "react";
import { Home, Search, User, MessageCircle, Users } from "lucide-react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useNotifications } from "@/hooks/useNotifications";
import { useMessages } from "@/hooks/useMessages";
import AiLogo from "@/components/AiLogo";

export default function MobileTabBar() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { unreadCount: notificationUnread } = useNotifications();
  const { unreadCount: messageUnread } = useMessages();

  const isHome = pathname === "/";
  const isSearch = pathname.startsWith("/search");
  const isWorkspace = pathname.startsWith("/workspace");
  const isPeople = pathname.startsWith("/people");
  const isChat =
    pathname.startsWith("/inbox") || pathname.startsWith("/notifications");
  const isProfile = pathname.startsWith("/profile") || pathname.startsWith("/u/");
  const chatBadge = notificationUnread + messageUnread;
  const inActiveChat = Boolean(
    searchParams.get("peer") &&
      (pathname.startsWith("/people") || pathname.startsWith("/inbox"))
  );

  // Admin gets its own dedicated Control Center shell — no public tab bar there
  if (pathname.startsWith("/admin") || inActiveChat) {
    return null;
  }

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 md:hidden border-t border-gray-200/90 bg-white/95 backdrop-blur-md dark:border-gray-800 dark:bg-gray-950/95 pb-[env(safe-area-inset-bottom)]">
      <div className="flex h-[56px] items-end justify-around px-1">
        <button
          type="button"
          onClick={() => router.push("/")}
          className={`flex h-full flex-1 flex-col items-center justify-center gap-0.5 ${
            isHome ? "text-gray-900 dark:text-white" : "text-gray-500 dark:text-gray-400"
          }`}
          aria-label="Home"
          aria-current={isHome ? "page" : undefined}
        >
          <Home size={22} strokeWidth={isHome ? 2.5 : 1.75} fill={isHome ? "currentColor" : "none"} />
          <span className="text-[10px] font-medium">Home</span>
        </button>

        <button
          type="button"
          onClick={() => router.push("/search")}
          className={`flex h-full flex-1 flex-col items-center justify-center gap-0.5 ${
            isSearch ? "text-gray-900 dark:text-white" : "text-gray-500 dark:text-gray-400"
          }`}
          aria-label="Search"
          aria-current={isSearch ? "page" : undefined}
        >
          <Search size={22} strokeWidth={isSearch ? 2.5 : 1.75} />
          <span className="text-[10px] font-medium">Search</span>
        </button>

        <button
          type="button"
          onClick={() => router.push("/workspace")}
          className={`flex h-full flex-1 -mt-0.5 flex-col items-center justify-center gap-0.5 ${
            isWorkspace ? "text-indigo-600 dark:text-indigo-400" : "text-gray-500 dark:text-gray-400"
          }`}
          aria-label="Work"
          aria-current={isWorkspace ? "page" : undefined}
        >
          <span
            className={`flex h-9 w-9 items-center justify-center rounded-xl transition-transform ${
              isWorkspace ? "scale-105 ring-2 ring-indigo-500/40" : ""
            }`}
          >
            <AiLogo size={32} />
          </span>
          <span className="text-[10px] font-semibold">Work</span>
        </button>

        <button
          type="button"
          onClick={() => router.push("/people")}
          className={`relative flex h-full flex-1 flex-col items-center justify-center gap-0.5 ${
            isPeople ? "text-gray-900 dark:text-white" : "text-gray-500 dark:text-gray-400"
          }`}
          aria-label="People"
          aria-current={isPeople ? "page" : undefined}
        >
          <span className="relative inline-flex">
            <Users size={22} strokeWidth={isPeople ? 2.5 : 1.75} />
            {messageUnread > 0 && (
              <span className="absolute -right-2 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#25D366] px-1 text-[10px] font-bold text-white">
                {messageUnread > 9 ? "9+" : messageUnread}
              </span>
            )}
          </span>
          <span className="text-[10px] font-medium">People</span>
        </button>

        <button
          type="button"
          onClick={() => router.push("/inbox?tab=messages")}
          className={`relative flex h-full flex-1 flex-col items-center justify-center gap-0.5 ${
            isChat ? "text-gray-900 dark:text-white" : "text-gray-500 dark:text-gray-400"
          }`}
          aria-label="Messages"
          aria-current={isChat ? "page" : undefined}
        >
          <span className="relative inline-flex">
            <MessageCircle
              size={22}
              strokeWidth={isChat ? 2.5 : 1.75}
              fill={isChat ? "currentColor" : "none"}
            />
            {chatBadge > 0 && (
              <span className="absolute -right-2 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white">
                {chatBadge > 9 ? "9+" : chatBadge}
              </span>
            )}
          </span>
          <span className="text-[10px] font-medium">Chat</span>
        </button>

        <button
          type="button"
          onClick={() => router.push("/profile")}
          className={`flex h-full flex-1 flex-col items-center justify-center gap-0.5 ${
            isProfile ? "text-gray-900 dark:text-white" : "text-gray-500 dark:text-gray-400"
          }`}
          aria-label="You"
          aria-current={isProfile ? "page" : undefined}
        >
          <User size={22} strokeWidth={isProfile ? 2.5 : 1.75} fill={isProfile ? "currentColor" : "none"} />
          <span className="text-[10px] font-medium">You</span>
        </button>
      </div>
    </nav>
  );
}
