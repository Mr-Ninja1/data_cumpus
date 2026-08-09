"use client";

import React from "react";
import { Home, Search, Plus, User, Users, Wallet, FilePlus2 } from "lucide-react";
import { useRouter, usePathname } from "next/navigation";

export default function MobileTabBar() {
  const router = useRouter();
  const pathname = usePathname();

  const isHome = pathname === "/";
  const isSearch = pathname.startsWith("/search");
  const isUpload = pathname.startsWith("/upload");
  const isPeople = pathname.startsWith("/people");
  const isWallet = pathname.startsWith("/wallet");
  const isProposals = pathname.startsWith("/workspace/proposals");
  const isProfile = pathname.startsWith("/profile") || pathname.startsWith("/u/");

  // Admin gets its own dedicated Control Center shell — no public tab bar there
  if (pathname.startsWith("/admin")) {
    return null;
  }

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 md:hidden bg-white dark:bg-gray-950 border-t border-gray-200 dark:border-gray-800 pb-[env(safe-area-inset-bottom)]">
      <div className="flex items-end justify-around h-[56px] px-1">
        <button
          type="button"
          onClick={() => router.push("/")}
          className={`flex flex-col items-center justify-center flex-1 h-full gap-0.5 ${
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
          className={`flex flex-col items-center justify-center flex-1 h-full gap-0.5 ${
            isSearch ? "text-gray-900 dark:text-white" : "text-gray-500 dark:text-gray-400"
          }`}
          aria-label="Search"
          aria-current={isSearch ? "page" : undefined}
        >
          <Search size={22} strokeWidth={isSearch ? 2.5 : 1.75} />
          <span className="text-[10px] font-medium">Search</span>
        </button>

        {/* YouTube-style center create */}
        <button
          type="button"
          onClick={() => router.push("/upload")}
          className="flex flex-col items-center justify-center flex-1 h-full -mt-1"
          aria-label="Upload"
          aria-current={isUpload ? "page" : undefined}
        >
          <div
            className={`h-10 w-10 rounded-full border-2 flex items-center justify-center ${
              isUpload
                ? "border-gray-900 dark:border-white bg-gray-900 dark:bg-white text-white dark:text-gray-900"
                : "border-gray-400 dark:border-gray-500 text-gray-700 dark:text-gray-300"
            }`}
          >
            <Plus size={26} strokeWidth={2} />
          </div>
        </button>

        <button
          type="button"
          onClick={() => router.push("/people")}
          className={`flex flex-col items-center justify-center flex-1 h-full gap-0.5 ${
            isPeople ? "text-gray-900 dark:text-white" : "text-gray-500 dark:text-gray-400"
          }`}
          aria-label="People"
          aria-current={isPeople ? "page" : undefined}
        >
          <Users size={22} strokeWidth={isPeople ? 2.5 : 1.75} />
          <span className="text-[10px] font-medium">People</span>
        </button>

        <button
          type="button"
          onClick={() => router.push("/wallet")}
          className={`flex flex-col items-center justify-center flex-1 h-full gap-0.5 ${
            isWallet ? "text-gray-900 dark:text-white" : "text-gray-500 dark:text-gray-400"
          }`}
          aria-label="Wallet"
          aria-current={isWallet ? "page" : undefined}
        >
          <Wallet size={22} strokeWidth={isWallet ? 2.5 : 1.75} />
          <span className="text-[10px] font-medium">Wallet</span>
        </button>

        <button
          type="button"
          onClick={() => router.push("/workspace/proposals")}
          className={`flex flex-col items-center justify-center flex-1 h-full gap-0.5 ${
            isProposals ? "text-gray-900 dark:text-white" : "text-gray-500 dark:text-gray-400"
          }`}
          aria-label="Proposals"
          aria-current={isProposals ? "page" : undefined}
        >
          <FilePlus2 size={22} strokeWidth={isProposals ? 2.5 : 1.75} />
          <span className="text-[10px] font-medium">Proposals</span>
        </button>

        <button
          type="button"
          onClick={() => router.push("/profile")}
          className={`flex flex-col items-center justify-center flex-1 h-full gap-0.5 ${
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
