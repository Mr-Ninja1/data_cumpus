"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  MessageSquare,
  ShieldAlert,
  Megaphone,
  ScrollText,
  FileStack,
  FileCode,
  Menu,
  X,
  LogOut,
  ArrowLeft,
  Crown,
  Sparkles,
  ChevronRight,
} from "lucide-react";
import { supabase } from "@/utils/supabaseClient";
import { useProfile } from "@/hooks/useProfile";
import Auth from "@/components/Auth";

type NavItem = { href: string; label: string; icon: any; exact?: boolean };
type NavGroup = { label: string; items: NavItem[] };

const NAV_GROUPS: NavGroup[] = [
  {
    label: "Overview",
    items: [{ href: "/admin", label: "Dashboard", icon: LayoutDashboard, exact: true }],
  },
  {
    label: "Moderation",
    items: [{ href: "/admin/moderation", label: "Review queue", icon: ShieldAlert }],
  },
  {
    label: "People",
    items: [{ href: "/admin/users", label: "Users & roles", icon: Users }],
  },
  {
    label: "Communications",
    items: [
      { href: "/admin/inbox", label: "Staff inbox", icon: MessageSquare },
      { href: "/admin/broadcasts", label: "Broadcasts", icon: Megaphone },
    ],
  },
  {
    label: "Proposal studio",
    items: [
      { href: "/admin/proposals/templates", label: "Templates", icon: FileStack },
      { href: "/admin/proposals/specs", label: "Specs", icon: FileCode },
    ],
  },
  {
    label: "System",
    items: [{ href: "/admin/audit", label: "Audit log", icon: ScrollText }],
  },
];

const ALL_ITEMS = NAV_GROUPS.flatMap((g) => g.items);

function isItemActive(pathname: string, item: NavItem) {
  return item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(item.href + "/");
}

function currentPageLabel(pathname: string) {
  const match = ALL_ITEMS.find((item) => isItemActive(pathname, item));
  return match?.label || "Control Center";
}

function roleBadge(role: string) {
  switch (role) {
    case "owner":
      return { label: "Owner", icon: Crown, className: "bg-gradient-to-r from-amber-400 to-yellow-500 text-slate-950" };
    case "admin":
      return { label: "Admin", icon: Sparkles, className: "bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white" };
    case "moderator":
      return { label: "Moderator", icon: ShieldAlert, className: "bg-gradient-to-r from-cyan-400 to-sky-500 text-slate-950" };
    default:
      return { label: role || "Staff", icon: ShieldAlert, className: "bg-slate-700 text-slate-100" };
  }
}

function NavList({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  return (
    <nav className="space-y-6">
      {NAV_GROUPS.map((group) => (
        <div key={group.label}>
          <div className="px-3 mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            {group.label}
          </div>
          <div className="space-y-0.5">
            {group.items.map((item) => {
              const Icon = item.icon;
              const active = isItemActive(pathname, item);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onNavigate}
                  className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    active
                      ? "bg-white/10 text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)]"
                      : "text-slate-400 hover:text-slate-100 hover:bg-white/5"
                  }`}
                >
                  <Icon className={`w-4 h-4 shrink-0 ${active ? "text-cyan-300" : "text-slate-500"}`} />
                  <span className="truncate">{item.label}</span>
                  {active && <ChevronRight className="w-3.5 h-3.5 ml-auto text-slate-500" />}
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || "/admin";
  const router = useRouter();
  const { isStaff, loading: profileLoading, role, displayName, userId } = useProfile();
  const [session, setSession] = useState<any>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [pendingCount, setPendingCount] = useState<number | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!mounted) return;
      setSession(data.session);
      setAuthLoading(false);
    })();
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => {
      mounted = false;
      sub?.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!isStaff) return;
    let mounted = true;
    (async () => {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) return;
      try {
        const res = await fetch("/api/admin/stats", { headers: { Authorization: `Bearer ${token}` } });
        const json = await res.json().catch(() => ({}));
        if (mounted && res.ok) setPendingCount(json.stats?.pending ?? 0);
      } catch {
        // ignore — badge is best-effort
      }
    })();
    return () => {
      mounted = false;
    };
  }, [isStaff, pathname]);

  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  const signOut = async () => {
    await supabase.auth.signOut();
    router.push("/");
  };

  const badge = useMemo(() => roleBadge(role), [role]);
  const pageLabel = currentPageLabel(pathname);

  if (authLoading || profileLoading) {
    return (
      <div className="min-h-screen w-full bg-slate-950 flex items-center justify-center">
        <div className="flex items-center gap-3 text-slate-400">
          <div className="h-8 w-8 rounded-full border-2 border-slate-700 border-t-cyan-400 animate-spin" />
          <span className="text-sm font-medium">Loading control center…</span>
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="min-h-screen w-full bg-slate-950 flex items-center justify-center px-4">
        <div className="w-full max-w-md">
          <div className="text-center mb-6">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-xs font-semibold uppercase tracking-wider text-cyan-300 mb-4">
              <ShieldAlert className="w-3.5 h-3.5" /> Restricted area
            </div>
            <h1 className="text-2xl font-bold text-white mb-1">Staff sign in</h1>
            <p className="text-sm text-slate-400">Authenticate to access the DataCampus Control Center.</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-1">
            <Auth />
          </div>
        </div>
      </div>
    );
  }

  if (!isStaff) {
    return (
      <div className="min-h-screen w-full bg-slate-950 flex items-center justify-center px-4">
        <div className="max-w-lg text-center">
          <ShieldAlert className="w-12 h-12 mx-auto mb-4 text-slate-600" />
          <h1 className="text-xl font-bold text-white mb-2">Control Center — staff only</h1>
          <p className="text-sm text-slate-400 mb-4">
            Your role is <strong className="text-slate-200">{role}</strong>. An owner/admin must set{" "}
            <code className="text-xs bg-white/10 px-1.5 py-0.5 rounded text-slate-300">profiles.role</code>.
          </p>
          <button
            type="button"
            onClick={() => router.push("/")}
            className="text-sm text-cyan-400 hover:text-cyan-300 hover:underline"
          >
            Back to DataCampus
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full bg-slate-950 text-slate-100 [--dc-glow:theme(colors.cyan.500)]">
      {/* Ambient control-room backdrop */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-40 -left-40 h-96 w-96 rounded-full bg-violet-600/10 blur-3xl" />
        <div className="absolute top-1/3 -right-40 h-[28rem] w-[28rem] rounded-full bg-cyan-500/10 blur-3xl" />
        <div className="absolute inset-0 opacity-[0.03] [background-image:linear-gradient(rgba(255,255,255,1)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,1)_1px,transparent_1px)] [background-size:32px_32px]" />
      </div>

      {/* Mobile drawer backdrop */}
      {drawerOpen && (
        <button
          type="button"
          aria-label="Close menu"
          onClick={() => setDrawerOpen(false)}
          className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm lg:hidden"
        />
      )}

      <div className="relative flex">
        {/* Desktop sidebar */}
        <aside className="hidden lg:flex lg:flex-col lg:w-64 lg:shrink-0 lg:h-screen lg:sticky lg:top-0 border-r border-white/5 bg-slate-900/60 backdrop-blur-xl">
          <div className="px-4 pt-5 pb-4 border-b border-white/5">
            <div className="flex items-center gap-2.5">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-cyan-400 text-white text-xs font-black shadow-lg shadow-violet-900/30">
                DC
              </span>
              <div className="min-w-0">
                <div className="text-sm font-bold text-white leading-tight truncate">Control Center</div>
                <div className="text-[11px] text-slate-500 leading-tight">DataCampus staff</div>
              </div>
            </div>
            <div className={`mt-3 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wide ${badge.className}`}>
              <badge.icon className="w-3 h-3" />
              {badge.label}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-2.5 py-4">
            <NavList pathname={pathname} />
          </div>

          <div className="p-2.5 border-t border-white/5 space-y-1">
            <button
              type="button"
              onClick={() => router.push("/")}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium text-slate-400 hover:text-slate-100 hover:bg-white/5 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Exit to site
            </button>
            <button
              type="button"
              onClick={signOut}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 transition-colors"
            >
              <LogOut className="w-4 h-4" />
              Sign out
            </button>
          </div>
        </aside>

        {/* Mobile drawer */}
        <aside
          className={`fixed inset-y-0 left-0 z-50 w-72 bg-slate-900 border-r border-white/10 flex flex-col transform transition-transform duration-300 ease-in-out lg:hidden ${
            drawerOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <div className="flex items-center justify-between px-4 py-4 border-b border-white/5">
            <div className="flex items-center gap-2.5">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-cyan-400 text-white text-xs font-black">
                DC
              </span>
              <span className="text-sm font-bold text-white">Control Center</span>
            </div>
            <button
              type="button"
              onClick={() => setDrawerOpen(false)}
              className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/5"
              aria-label="Close menu"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-2.5 py-4">
            <NavList pathname={pathname} onNavigate={() => setDrawerOpen(false)} />
          </div>
          <div className="p-2.5 border-t border-white/5 space-y-1">
            <button
              type="button"
              onClick={() => router.push("/")}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium text-slate-400 hover:text-slate-100 hover:bg-white/5"
            >
              <ArrowLeft className="w-4 h-4" />
              Exit to site
            </button>
            <button
              type="button"
              onClick={signOut}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium text-rose-400 hover:bg-rose-500/10"
            >
              <LogOut className="w-4 h-4" />
              Sign out
            </button>
          </div>
        </aside>

        {/* Main column */}
        <div className="relative flex-1 min-w-0">
          {/* Top bar */}
          <header className="sticky top-0 z-30 border-b border-white/5 bg-slate-950/80 backdrop-blur-xl">
            <div className="flex items-center gap-3 px-4 lg:px-8 h-16">
              <button
                type="button"
                onClick={() => setDrawerOpen(true)}
                className="lg:hidden p-2 -ml-2 rounded-lg text-slate-300 hover:bg-white/5"
                aria-label="Open menu"
              >
                <Menu className="w-5 h-5" />
              </button>

              <div className="min-w-0">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Control Center</div>
                <h1 className="text-base font-bold text-white truncate">{pageLabel}</h1>
              </div>

              <div className="ml-auto flex items-center gap-2 lg:gap-3">
                {pendingCount !== null && pendingCount > 0 && (
                  <Link
                    href="/admin/moderation"
                    className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs font-semibold"
                  >
                    <span className="relative flex h-1.5 w-1.5">
                      <span className="absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75 animate-ping" />
                      <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-rose-400" />
                    </span>
                    {pendingCount} pending
                  </Link>
                )}
                <div className={`hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wide ${badge.className}`}>
                  <badge.icon className="w-3 h-3" />
                  {badge.label}
                </div>
                <div className="flex items-center gap-2 pl-2 lg:pl-3 border-l border-white/10">
                  <div className="h-8 w-8 rounded-full bg-gradient-to-br from-slate-700 to-slate-800 border border-white/10 flex items-center justify-center text-xs font-bold text-slate-200">
                    {(displayName || "S")[0]?.toUpperCase()}
                  </div>
                  <span className="hidden md:block text-sm font-medium text-slate-300 truncate max-w-[10rem]">
                    {displayName || "Staff"}
                  </span>
                </div>
              </div>
            </div>
          </header>

          <main className="px-4 lg:px-8 py-6 pb-16">{children}</main>
        </div>
      </div>
    </div>
  );
}
