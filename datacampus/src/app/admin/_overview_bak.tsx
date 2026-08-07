"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import {
  FileText,
  Flag,
  MessageSquare,
  Users,
  Megaphone,
  Inbox,
  Loader2,
} from "lucide-react";
import { supabase } from "@/utils/supabaseClient";
import LoadingSkeleton from "@/components/LoadingSkeleton";

type Stats = {
  papers: number;
  pending: number;
  openReports: number;
  comments: number;
  users: number;
  unreadMessages: number;
  activeAnnouncements: number;
};

export default function AdminOverviewPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) {
        setLoading(false);
        return;
      }
      const res = await fetch("/api/admin/stats", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json().catch(() => ({}));
      if (mounted && res.ok) setStats(json.stats);
      if (mounted) setLoading(false);
    })();
    return () => {
      mounted = false;
    };
  }, []);

  if (loading) return <LoadingSkeleton />;

  const cards = [
    {
      label: "Pending uploads",
      value: stats?.pending ?? 0,
      href: "/admin/moderation",
      icon: FileText,
      tone: "text-amber-600",
    },
    {
      label: "Open reports",
      value: stats?.openReports ?? 0,
      href: "/admin/moderation?tab=reports",
      icon: Flag,
      tone: "text-rose-600",
    },
    {
      label: "Users",
      value: stats?.users ?? 0,
      href: "/admin/users",
      icon: Users,
      tone: "text-indigo-600",
    },
    {
      label: "Unread DMs (site)",
      value: stats?.unreadMessages ?? 0,
      href: "/admin/inbox",
      icon: Inbox,
      tone: "text-sky-600",
    },
    {
      label: "Live papers",
      value: stats?.papers ?? 0,
      href: "/",
      icon: FileText,
      tone: "text-emerald-600",
    },
    {
      label: "Active banners",
      value: stats?.activeAnnouncements ?? 0,
      href: "/admin/broadcasts",
      icon: Megaphone,
      tone: "text-purple-600",
    },
  ];

  return (
    <div>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-5">
        Deeper platform control — users, messaging, moderation, and broadcasts.
      </p>
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        {cards.map((c) => {
          const Icon = c.icon;
          return (
            <Link
              key={c.label}
              href={c.href}
              className="p-4 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 hover:border-indigo-300 dark:hover:border-indigo-700 transition-colors"
            >
              <div className="flex items-center gap-2 mb-2">
                <Icon className={`w-4 h-4 ${c.tone}`} />
                <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                  {c.label}
                </span>
              </div>
              <p className="text-3xl font-bold text-gray-900 dark:text-gray-100 tabular-nums">
                {c.value}
              </p>
            </Link>
          );
        })}
      </div>

      <div className="mt-8 grid sm:grid-cols-2 gap-3">
        <Link
          href="/admin/inbox"
          className="p-4 rounded-xl bg-indigo-600 text-white font-medium inline-flex items-center gap-2"
        >
          <MessageSquare className="w-4 h-4" /> Open staff inbox
        </Link>
        <Link
          href="/admin/users"
          className="p-4 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 font-medium inline-flex items-center gap-2"
        >
          <Users className="w-4 h-4" /> Manage roles & permissions
        </Link>
      </div>
    </div>
  );
}
