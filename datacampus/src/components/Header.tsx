"use client";
import React, { useEffect, useState, useRef } from "react";
import { Search, Upload, User, Menu, Shield, Bell, Plus, Wallet as WalletIcon } from "lucide-react";
import { supabase } from "@/utils/supabaseClient";
import { useRouter, usePathname } from "next/navigation";
import { useProfile } from "@/hooks/useProfile";
import { useNotifications } from "@/hooks/useNotifications";

export default function Header() {
  const router = useRouter();
  const pathname = usePathname();
  const { isStaff } = useProfile();
  const { unreadCount } = useNotifications();
  const [user, setUser] = useState<any>(null);
  const [open, setOpen] = useState(false);
  const [walletBalance, setWalletBalance] = useState<number | null>(null);
  const [desktopQuery, setDesktopQuery] = useState("");
  const ref = useRef<HTMLDivElement | null>(null);

  const goSearch = (q: string) => {
    const trimmed = q.trim();
    router.push(trimmed ? `/search?q=${encodeURIComponent(trimmed)}` : "/search");
  };

  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!mounted) return;
      setUser(data.session?.user ?? null);
      // fetch wallet balance for header
      try {
        const token = data.session?.access_token;
        if (token) {
          const res = await fetch('/api/wallet/balance', { headers: { Authorization: `Bearer ${token}` } });
          const json = await res.json();
          setWalletBalance(json.wallet?.balance_credits ?? null);
        }
      } catch (e) {
        // ignore
      }
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => {
      mounted = false;
      sub?.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("click", onDoc);
    return () => document.removeEventListener("click", onDoc);
  }, []);

  const handleProfileClick = async () => {
    if (!user) {
      await supabase.auth.signInWithOAuth({ provider: "google" });
      return;
    }
    // On mobile, You profile lives in the tab bar — go there directly
    if (typeof window !== "undefined" && window.matchMedia("(max-width: 767px)").matches) {
      router.push("/profile");
      return;
    }
    setOpen((s) => !s);
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setOpen(false);
  };

  // Hide chrome header on paper viewer mobile (has its own top bar)
  if (pathname?.startsWith("/paper/")) {
    return (
      <header className="hidden md:flex items-center justify-between px-6 py-3 border-b bg-white dark:bg-gray-900 sticky top-0 z-30">
        <div onClick={() => router.push("/")} className="flex items-center gap-2 cursor-pointer">
          <span className="font-extrabold text-2xl bg-gradient-to-r from-red-600 to-rose-600 bg-clip-text text-transparent">
            DataCampus
          </span>
        </div>
        <form
          className="relative flex-1 max-w-2xl mx-8"
          onSubmit={(e) => {
            e.preventDefault();
            goSearch(desktopQuery);
          }}
        >
          <input
            type="search"
            value={desktopQuery}
            onChange={(e) => setDesktopQuery(e.target.value)}
            placeholder="Search"
            className="w-full pl-12 pr-4 py-2.5 rounded-full border border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 focus:outline-none focus:ring-1 focus:ring-gray-400 text-sm"
          />
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
        </form>
        <div ref={ref} className="relative">
          <button onClick={handleProfileClick} className="p-1">
            {user?.user_metadata?.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={user.user_metadata.avatar_url} alt="" className="h-8 w-8 rounded-full object-cover" />
            ) : (
              <div className="h-8 w-8 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center">
                <User size={16} />
              </div>
            )}
          </button>
        </div>
      </header>
    );
  }

  return (
    <header className="sticky top-0 z-30 bg-white dark:bg-gray-950 border-b border-gray-200/80 dark:border-gray-800">
      {/* YouTube-like mobile top bar */}
      <div className="flex md:hidden items-center justify-between h-12 px-2">
        <button
          type="button"
          onClick={() => window.dispatchEvent(new CustomEvent("toggle-mobile-sidebar"))}
          className="p-2 rounded-full active:bg-gray-100 dark:active:bg-gray-800"
          aria-label="Menu"
        >
          <Menu size={22} strokeWidth={1.75} />
        </button>

        <button
          type="button"
          onClick={() => router.push("/")}
          className="flex items-center gap-1.5 min-w-0"
        >
          <span className="inline-flex h-6 w-6 items-center justify-center rounded bg-red-600 text-white text-[11px] font-black">
            DC
          </span>
          <span className="font-semibold text-[18px] tracking-tight text-gray-900 dark:text-white truncate">
            DataCampus
          </span>
        </button>

        <div className="flex items-center">
          <button
            type="button"
            onClick={() => router.push("/notifications")}
            className="relative p-2 rounded-full active:bg-gray-100 dark:active:bg-gray-800"
            aria-label="Notifications"
          >
            <Bell size={22} strokeWidth={1.75} />
            {unreadCount > 0 && (
              <span className="absolute top-1 right-1 min-w-[16px] h-4 px-1 rounded-full bg-red-600 text-white text-[10px] font-bold flex items-center justify-center">
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => router.push("/search")}
            className="p-2 rounded-full active:bg-gray-100 dark:active:bg-gray-800"
            aria-label="Search"
          >
            <Search size={22} strokeWidth={1.75} />
          </button>
          <button
            type="button"
            onClick={handleProfileClick}
            className="p-1.5 rounded-full"
            aria-label={user ? "You" : "Sign in"}
          >
            {user?.user_metadata?.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={user.user_metadata.avatar_url}
                alt=""
                className="h-7 w-7 rounded-full object-cover"
              />
            ) : (
              <div className="h-7 w-7 rounded-full bg-sky-600 text-white flex items-center justify-center text-[11px] font-bold">
                {user ? (user.email?.[0] || "U").toUpperCase() : <User size={14} />}
              </div>
            )}
          </button>
        </div>
      </div>

      {/* Desktop header */}
      <div className="hidden md:flex items-center justify-between gap-6 px-4 lg:px-6 py-2.5">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={() => window.dispatchEvent(new CustomEvent("toggle-sidebar"))}
            title="Toggle sidebar"
            className="p-2.5 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            <Menu size={22} />
          </button>
          <div onClick={() => router.push("/")} className="flex items-center gap-2 cursor-pointer min-w-0">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-violet-600 to-cyan-500 text-white text-xs font-black shadow-sm">
              DC
            </span>
            <span className="font-semibold text-xl tracking-tight text-gray-900 dark:text-white">
              DataCampus
            </span>
          </div>
        </div>

        <div className="flex flex-1 justify-center max-w-3xl mx-2 lg:mx-6">
          <div className="relative w-full flex items-center gap-3">
            <form
              className="relative w-full"
              onSubmit={(e) => {
                e.preventDefault();
                goSearch(desktopQuery);
              }}
            >
              <input
                type="search"
                value={desktopQuery}
                onChange={(e) => setDesktopQuery(e.target.value)}
                placeholder="Search"
                className="w-full pl-5 pr-14 py-2.5 rounded-full border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 focus:outline-none focus:ring-1 focus:ring-sky-500 text-sm shadow-sm"
              />
              <button
                type="submit"
                className="absolute right-0 top-0 bottom-0 px-4 rounded-r-full border-l border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800"
                aria-label="Search"
              >
                <Search size={18} className="text-gray-600 dark:text-gray-300" />
              </button>
            </form>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => router.push("/upload")}
            title="Create"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-sm font-semibold text-gray-900 dark:text-gray-100 transition-colors"
          >
            <Plus size={18} />
            <span>Create</span>
          </button>
          <button
            onClick={() => router.push('/wallet')}
            title="Wallet"
            className="inline-flex items-center gap-2 px-3 py-2 rounded-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-800 text-sm font-semibold text-gray-900 dark:text-gray-100"
          >
            <WalletIcon size={16} />
            <span>{walletBalance !== null ? walletBalance : '—'}</span>
          </button>
          <button
            onClick={() => router.push("/notifications")}
            title="Notifications"
            className="relative p-2.5 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            <Bell size={22} />
            {unreadCount > 0 && (
              <span className="absolute top-1 right-1 min-w-[16px] h-4 px-1 rounded-full bg-red-600 text-white text-[10px] font-bold flex items-center justify-center">
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </button>
          <div ref={ref} className="relative">
            <button
              onClick={handleProfileClick}
              title={user ? "Profile" : "Sign in"}
              className="flex items-center p-1 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800"
            >
              {user?.user_metadata?.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={user.user_metadata.avatar_url} alt="avatar" className="h-8 w-8 rounded-full object-cover" />
              ) : (
                <div className="h-8 w-8 rounded-full bg-sky-600 text-white flex items-center justify-center text-sm font-semibold">
                  <User size={16} />
                </div>
              )}
            </button>
            {open && user && (
              <div className="absolute right-0 mt-2 w-56 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl shadow-lg py-2 z-50">
                <div className="px-3 py-2 text-sm text-gray-700 dark:text-gray-200 border-b border-gray-200 dark:border-gray-800 truncate">
                  {user.email}
                </div>
                <button onClick={() => router.push("/notifications")} className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-800 flex items-center gap-2">
                  <Bell size={14} /> Inbox
                  {unreadCount > 0 && (
                    <span className="ml-auto text-xs bg-red-600 text-white px-1.5 py-0.5 rounded-full">{unreadCount}</span>
                  )}
                </button>
                <button onClick={() => router.push("/profile")} className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-800">
                  Profile
                </button>
                {isStaff && (
                  <button
                    onClick={() => router.push("/admin")}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-800 flex items-center gap-2"
                  >
                    <Shield size={14} /> Review queue
                  </button>
                )}
                <button onClick={signOut} className="w-full text-left px-3 py-2 text-sm text-red-600 hover:bg-gray-100 dark:hover:bg-gray-800">
                  Sign out
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
