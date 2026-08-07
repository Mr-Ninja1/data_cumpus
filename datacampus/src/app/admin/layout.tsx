"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  MessageSquare,
  Shield,
  Megaphone,
  ScrollText,
  Loader2,
} from "lucide-react";
import { supabase } from "@/utils/supabaseClient";
import { useProfile } from "@/hooks/useProfile";
import Auth from "@/components/Auth";
import LoadingSkeleton from "@/components/LoadingSkeleton";

const NAV = [
  { href: "/admin", label: "Overview", icon: LayoutDashboard, exact: true },
  { href: "/admin/users", label: "Users", icon: Users },
  { href: "/admin/inbox", label: "Inbox", icon: MessageSquare },
  { href: "/admin/moderation", label: "Moderation", icon: Shield },
  { href: "/admin/broadcasts", label: "Broadcasts", icon: Megaphone },
  { href: "/admin/audit", label: "Audit", icon: ScrollText },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { isStaff, loading: profileLoading, role } = useProfile();
  const [session, setSession] = useState<any>(null);
  const [authLoading, setAuthLoading] = useState(true);

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

  if (authLoading || profileLoading) {
    return (
      <div className="px-3 pt-4">
        <LoadingSkeleton />
      </div>
    );
  }

  if (!session) {
    return (
      <div className="max-w-md mx-auto py-8 px-3">
        <h1 className="text-2xl font-bold mb-4 text-center">Staff sign in</h1>
        <Auth />
      </div>
    );
  }

  if (!isStaff) {
    return (
      <div className="max-w-lg mx-auto py-16 text-center px-3">
        <Shield className="w-12 h-12 mx-auto mb-4 text-gray-400" />
        <h1 className="text-xl font-bold mb-2">Control panel — staff only</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
          Your role is <strong>{role}</strong>. An owner/admin must set{" "}
          <code className="text-xs bg-gray-100 dark:bg-gray-800 px-1 rounded">profiles.role</code>.
        </p>
        <button
          type="button"
          onClick={() => router.push("/")}
          className="text-sm text-indigo-600 hover:underline"
        >
          Back home
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-3 pt-4 md:px-0 md:pt-0 pb-8">
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Control panel</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Signed in as <strong>{role}</strong>
        </p>
      </div>

      <div className="flex gap-2 mb-6 overflow-x-auto scrollbar-hide pb-1">
        {NAV.map((item) => {
          const active = item.exact
            ? pathname === item.href
            : pathname === item.href || pathname.startsWith(item.href + "/");
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-medium whitespace-nowrap ${
                active
                  ? "bg-indigo-600 text-white"
                  : "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300"
              }`}
            >
              <Icon className="w-4 h-4" />
              {item.label}
            </Link>
          );
        })}
      </div>

      {children}
    </div>
  );
}
