"use client";
import React, { useState, useEffect } from "react";
import { usePreferences } from "@/hooks/usePreferences";
import { Home, X, GraduationCap, BookOpen, Upload, User, LogIn, LogOut, ChevronRight, ShieldCheck, Wallet, FilePlus2, Shield, Users } from "lucide-react";
import { Inbox, Search } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "@/utils/supabaseClient";
import { bumpInterest } from "@/utils/interests";
import { useProfile } from "@/hooks/useProfile";
import { useMessages } from "@/hooks/useMessages";
import { useNotifications } from "@/hooks/useNotifications";
import { useChatSocial } from "@/hooks/useChatSocial";

const categories = [
  {
    label: "All Programs",
    children: [
      "BSE",
      "Cyber Security",
      "BIT",
      "BICTE",
      "Electrical & Electronics",
      "Telecommunications",
      "Instrumentation",
      "Accountancy",
      "BBA",
      "Marketing",
      "Purchasing & Supply",
    ],
  },
];

const allPrograms = [
  "BSE",
  "Cyber Security",
  "BIT",
  "BICTE",
  "Electrical & Electronics",
  "Telecommunications",
  "Instrumentation",
  "Accountancy",
  "BBA",
  "Marketing",
  "Purchasing & Supply",
];

const programsMap: Record<string, string[]> = {
  "School of Engineering & Technology": ["Electrical & Electronics", "Telecommunications", "Instrumentation"],
  "School of Business": ["Accountancy", "BBA", "Marketing", "Purchasing & Supply"],
  "School of Information & Communication Technology": ["BSE", "Cyber Security", "BIT", "BICTE"],
};

const schoolsWithIcons = [
  { name: "School of Engineering & Technology", icon: GraduationCap },
  { name: "School of Business", icon: BookOpen },
  { name: "School of Information & Communication Technology", icon: BookOpen },
];

export default function Sidebar() {
  const router = useRouter();
  const pathname = usePathname();
  const isAdminRoute = pathname?.startsWith("/admin");
  const [open, setOpen] = useState<boolean>(false);
  const [mobileOpen, setMobileOpen] = useState<boolean>(false);
  const { preferences, setPreferences } = usePreferences();
  const [user, setUser] = useState<any>(null);
  const { isStaff } = useProfile();
  const { unreadCount: messageUnread } = useMessages();
  const { unreadCount: notificationUnread } = useNotifications();
  const { incoming } = useChatSocial();
  const inboxBadge = messageUnread + notificationUnread + incoming.length;

  // On mount, read persisted sidebar state; do this in effect to avoid
  // hydration mismatch between server and client renders.
  useEffect(() => {
    try {
      const v = window.localStorage.getItem("sidebar-open");
      if (v != null) setOpen(v === "true");
    } catch (err) {
      // ignore
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!mounted) return;
      setUser(data.session?.user ?? null);
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
    function onToggle() {
      setOpen((v) => !v);
    }
    function onSet(e: Event) {
      try {
        const custom = e as CustomEvent<boolean | { open: boolean }>;
        const detail = custom.detail as any;
        let next: boolean | null = null;
        if (typeof detail === "boolean") {
          next = detail;
        } else if (detail && typeof detail.open === "boolean") {
          next = detail.open;
        }
        if (next !== null) {
          setOpen(next);
          try {
            window.localStorage.setItem("sidebar-open", next ? "true" : "false");
          } catch (err) {
            // ignore
          }
        }
      } catch (err) {
        // ignore
      }
    }

    window.addEventListener("toggle-sidebar", onToggle);
    window.addEventListener("set-sidebar", onSet as EventListener);
    return () => {
      window.removeEventListener("toggle-sidebar", onToggle);
      window.removeEventListener("set-sidebar", onSet as EventListener);
    };
  }, []);

  // Handle mobile sidebar toggle
  useEffect(() => {
    function onMobileToggle() {
      setMobileOpen((v) => !v);
    }
    window.addEventListener("toggle-mobile-sidebar", onMobileToggle);
    return () => window.removeEventListener("toggle-mobile-sidebar", onMobileToggle);
  }, []);

  const handleBackdropClick = () => {
    setMobileOpen(false);
  };

  const handleSignIn = async () => {
    await supabase.auth.signInWithOAuth({ provider: "google" });
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    setMobileOpen(false);
  };

  // Admin gets its own dedicated Control Center shell — no public sidebar there
  if (isAdminRoute) {
    return null;
  }

  return (
    <>
      {/* Mobile Backdrop */}
      {mobileOpen && (
        <div
          onClick={handleBackdropClick}
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40 md:hidden animate-in fade-in"
          aria-hidden="true"
        />
      )}

      {/* Desktop Sidebar */}
      <aside
        className={`hidden md:flex h-[calc(100vh-73px)] bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800 transition-all duration-300 ${
          open ? "w-60" : "w-20"
        } sticky top-[73px] z-20 overflow-y-auto`}
      >
        <nav className="mt-3 px-2 w-full">
          <div className="flex flex-col gap-1">
            {[
              ...(isStaff ? [{ href: "/admin", label: "Control Center", icon: Shield, staff: true }] : []),
              { href: "/", label: "Home", icon: Home },
              { href: "/search", label: "Explore", icon: Search },
              { href: "/people", label: "People", icon: Users, badge: messageUnread },
              { href: "/inbox", label: "Inbox", icon: Inbox, badge: inboxBadge },
              { href: "/upload", label: "Upload", icon: Upload },
              { href: "/verify", label: "Verify", icon: ShieldCheck },
              { href: "/wallet", label: "Wallet", icon: Wallet },
              { href: "/workspace", label: "Workspace", icon: FilePlus2 },
              { href: "/profile", label: "Profile", icon: User },
            ].map((item) => {
              const Icon = item.icon;
              const active =
                item.href === "/"
                  ? pathname === "/"
                  : pathname === item.href || pathname.startsWith(item.href + "/");
              const isControlCenter = Boolean((item as { staff?: boolean }).staff);
              const badge = typeof (item as { badge?: number }).badge === "number" ? (item as { badge?: number }).badge! : 0;
              return (
                <button
                  key={item.href}
                  type="button"
                  onClick={() => router.push(item.href)}
                  className={`w-full transition-colors ${
                    isControlCenter
                      ? "bg-gradient-to-r from-amber-400/10 to-yellow-500/10 text-amber-600 dark:text-amber-400 border border-amber-400/30 rounded-xl"
                      : active
                      ? "bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300"
                      : "hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-200"
                  }`}
                  aria-current={active ? "page" : undefined}
                >
                  {open ? (
                    <span className="inline-flex items-center gap-3 px-3 py-2.5 rounded-xl w-full">
                      <span
                        className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                          isControlCenter
                            ? "bg-amber-400/20"
                            : "bg-gray-100 dark:bg-gray-800"
                        }`}
                      >
                        <Icon size={17} />
                      </span>
                      <span className="text-sm font-medium whitespace-nowrap">{item.label}</span>
                      {badge > 0 && (
                        <span className="ml-auto rounded-full bg-red-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
                          {badge > 9 ? "9+" : badge}
                        </span>
                      )}
                    </span>
                  ) : (
                    <span className="relative inline-flex w-full items-center justify-center py-2.5">
                      <Icon size={20} />
                      {badge > 0 && (
                        <span className="absolute right-2 top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[9px] font-bold text-white">
                          {badge > 9 ? "9+" : badge}
                        </span>
                      )}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <div className="mt-4 pt-4 border-t border-gray-200/80 dark:border-gray-800/80">
            {open && (
              <>
                <div className="px-2 text-xs text-gray-500 dark:text-gray-400 uppercase font-semibold mb-2">
                  Programs
                </div>
                <ul className="space-y-1">
                  {(preferences?.school ? (programsMap[preferences.school] || []) : allPrograms).map((prog) => (
                    <li key={prog}>
                      <button
                        type="button"
                        className={`w-full text-left px-2 py-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg cursor-pointer text-sm transition-colors ${
                          preferences?.program === prog
                            ? "bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300 font-medium"
                            : ""
                        }`}
                        onClick={() => {
                          void setPreferences(
                            { school: preferences?.school || "", program: prog },
                            Boolean(user)
                          );
                          bumpInterest("programs", prog, 3);
                          router.push("/");
                        }}
                      >
                        {prog}
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </nav>
      </aside>

      {/* Mobile Drawer Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-72 bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800 transform transition-transform duration-300 ease-in-out md:hidden ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-800">
          <div className="flex items-center gap-2 min-w-0">
            <span className="font-extrabold text-lg bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent truncate">
              DataCampus
            </span>
          </div>
          <button
            onClick={handleBackdropClick}
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            aria-label="Close sidebar"
          >
            <X size={20} />
          </button>
        </div>

        <nav className="mt-3 px-2 overflow-y-auto h-full pb-24">
          {/* Account */}
          <div className="px-2 pb-3 border-b border-gray-200 dark:border-gray-800">
            <button
              type="button"
              onClick={async () => {
                if (!user) {
                  await handleSignIn();
                  return;
                }
                setMobileOpen(false);
                router.push("/profile");
              }}
              className="w-full flex items-center gap-3 px-2 py-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            >
              {user?.user_metadata?.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={user.user_metadata.avatar_url}
                  alt="avatar"
                  className="h-10 w-10 rounded-full object-cover"
                />
              ) : (
                <div className="h-10 w-10 rounded-full bg-gray-200 dark:bg-gray-800 flex items-center justify-center">
                  <User className="w-5 h-5 text-gray-600 dark:text-gray-300" />
                </div>
              )}
              <div className="min-w-0 flex-1 text-left">
                <div className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">
                  {user ? (user.user_metadata?.full_name || user.email || "Account") : "Sign in"}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
                  {user ? "View your profile" : "Sync preferences across devices"}
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" />
            </button>

            {isStaff && (
              <button
                type="button"
                onClick={() => {
                  setMobileOpen(false);
                  router.push("/admin");
                }}
                className="w-full mt-2 inline-flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-gradient-to-r from-amber-400 to-yellow-500 text-slate-950 text-sm font-bold shadow-md shadow-amber-500/30 transition-shadow"
              >
                <Shield className="w-4 h-4" />
                Control Center
              </button>
            )}

            <div className="mt-2 flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setMobileOpen(false);
                  router.push("/upload");
                }}
                className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-gray-900 px-3 py-2.5 text-sm font-semibold text-white hover:bg-gray-800 dark:bg-white dark:text-gray-900"
              >
                <Upload className="h-4 w-4" />
                Upload paper
              </button>
              {user ? (
                <button
                  type="button"
                  onClick={handleSignOut}
                  className="inline-flex items-center justify-center rounded-xl bg-gray-100 px-3 py-2.5 text-gray-800 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
                  aria-label="Sign out"
                >
                  <LogOut className="h-4 w-4" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleSignIn}
                  className="inline-flex items-center justify-center rounded-xl bg-gray-100 px-3 py-2.5 text-gray-800 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
                  aria-label="Sign in"
                >
                  <LogIn className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>

          {/* Extras not in the tab bar */}
          <div className="pt-3">
            <div className="mb-2 px-4 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
              More
            </div>
            <div className="space-y-1">
              <button
                type="button"
                className="flex w-full items-center gap-3 rounded-xl px-4 py-3 transition-colors hover:bg-gray-100 dark:hover:bg-gray-800"
                onClick={() => {
                  setMobileOpen(false);
                  router.push("/inbox");
                }}
              >
                <Inbox size={18} />
                <span className="text-sm font-medium">Inbox</span>
              </button>
              <button
                type="button"
                className="flex w-full items-center gap-3 rounded-xl px-4 py-3 transition-colors hover:bg-gray-100 dark:hover:bg-gray-800"
                onClick={() => {
                  setMobileOpen(false);
                  router.push("/workspace");
                }}
              >
                <FilePlus2 size={18} />
                <span className="text-sm font-medium">Workspace</span>
              </button>
              <button
                type="button"
                className="flex w-full items-center gap-3 rounded-xl px-4 py-3 transition-colors hover:bg-gray-100 dark:hover:bg-gray-800"
                onClick={() => {
                  setMobileOpen(false);
                  router.push("/wallet");
                }}
              >
                <Wallet size={18} />
                <span className="text-sm font-medium">Wallet</span>
              </button>
            </div>
          </div>

          {/* Schools Section */}
          <div className="mb-6">
            <div className="px-4 text-xs text-gray-500 dark:text-gray-400 uppercase font-semibold mb-3">Schools</div>
            <ul className="space-y-1">
              {schoolsWithIcons.map((school) => {
                const Icon = school.icon;
                const isActive = preferences?.school === school.name;
                return (
                  <li key={school.name}>
                    <button
                      className="w-full flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                      onClick={() => {
                        // Soft preference: boost this school in ranking, don't lock the feed
                        void setPreferences(
                          { school: school.name, program: preferences?.program || "" },
                          Boolean(user)
                        );
                        setMobileOpen(false);
                        router.push("/");
                      }}
                    >
                      <div
                        className={`p-2 rounded-lg ${
                          isActive
                            ? "bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400"
                            : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400"
                        }`}
                      >
                        <Icon size={18} />
                      </div>
                      <span className="text-sm font-medium">{school.name}</span>
                      {isActive && (
                        <div className="ml-auto w-2 h-2 bg-indigo-600 dark:bg-indigo-400 rounded-full" />
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>

          {/* Programs Section */}
          <div className="mb-4">
            <div className="px-4 text-xs text-gray-500 dark:text-gray-400 uppercase font-semibold mb-3">
              {preferences?.school || "All Programs"}
            </div>
            <ul className="space-y-1">
              {(preferences?.school ? (programsMap[preferences.school] || []) : allPrograms).map((prog) => {
                const isActive = preferences?.program === prog;
                return (
                  <li key={prog}>
                    <button
                      className="w-full flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                      onClick={() => {
                        void setPreferences(
                          { school: preferences?.school || "", program: prog },
                          Boolean(user)
                        );
                        bumpInterest("programs", prog, 3);
                        setMobileOpen(false);
                        router.push("/");
                      }}
                    >
                      <div
                        className={`w-2 h-2 rounded-full ${
                          isActive
                            ? "bg-indigo-600 dark:bg-indigo-400"
                            : "bg-gray-300 dark:bg-gray-600"
                        }`}
                      />
                      <span className="text-sm">{prog}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        </nav>
      </aside>
    </>
  );
}
