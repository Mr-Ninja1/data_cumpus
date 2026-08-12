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
  ArrowUpRight,
  Wrench,
  Image,
} from "lucide-react";
import { supabase } from "@/utils/supabaseClient";

type Stats = {
  papers: number;
  pending: number;
  openReports: number;
  comments: number;
  users: number;
  unreadMessages: number;
  activeAnnouncements: number;
};

function StatSkeleton() {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
      {[...Array(6)].map((_, i) => (
        <div key={i} className="rounded-2xl border border-white/5 bg-slate-900/50 p-4 h-[104px] animate-pulse" />
      ))}
    </div>
  );
}

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

  const cards = [
    {
      label: "Pending uploads",
      value: stats?.pending ?? 0,
      href: "/admin/moderation",
      icon: FileText,
      accent: "from-amber-400 to-orange-500",
      glow: "shadow-amber-500/20",
      alert: (stats?.pending ?? 0) > 0,
    },
    {
      label: "Open reports",
      value: stats?.openReports ?? 0,
      href: "/admin/moderation?tab=reports",
      icon: Flag,
      accent: "from-rose-500 to-red-600",
      glow: "shadow-rose-500/20",
      alert: (stats?.openReports ?? 0) > 0,
    },
    {
      label: "Users",
      value: stats?.users ?? 0,
      href: "/admin/users",
      icon: Users,
      accent: "from-violet-500 to-fuchsia-500",
      glow: "shadow-violet-500/20",
    },
    {
      label: "Unread DMs",
      value: stats?.unreadMessages ?? 0,
      href: "/admin/inbox",
      icon: Inbox,
      accent: "from-sky-400 to-blue-500",
      glow: "shadow-sky-500/20",
    },
    {
      label: "Live papers",
      value: stats?.papers ?? 0,
      href: "/",
      icon: FileText,
      accent: "from-emerald-400 to-teal-500",
      glow: "shadow-emerald-500/20",
    },
    {
      label: "Active banners",
      value: stats?.activeAnnouncements ?? 0,
      href: "/admin/broadcasts",
      icon: Megaphone,
      accent: "from-purple-500 to-pink-500",
      glow: "shadow-purple-500/20",
    },
  ];

  return (
    <div>
      <p className="text-sm text-slate-400 mb-6 max-w-2xl">
        Live signal from across the platform — moderation load, community health, and staff
        communications, at a glance.
      </p>

      {loading ? (
        <StatSkeleton />
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
          {cards.map((c) => {
            const Icon = c.icon;
            return (
              <Link
                key={c.label}
                href={c.href}
                className={`group relative overflow-hidden rounded-2xl border border-white/5 bg-slate-900/50 p-4 transition-all hover:border-white/10 hover:bg-slate-900/80 hover:shadow-lg ${c.glow}`}
              >
                {c.alert && (
                  <span className="absolute top-3 right-3 flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75 animate-ping" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-rose-400" />
                  </span>
                )}
                <div className={`inline-flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br ${c.accent} text-white mb-3 shadow-md`}>
                  <Icon className="w-4.5 h-4.5" />
                </div>
                <p className="text-3xl font-bold text-white tabular-nums leading-tight">{c.value}</p>
                <div className="flex items-center justify-between mt-1">
                  <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">{c.label}</span>
                  <ArrowUpRight className="w-3.5 h-3.5 text-slate-600 group-hover:text-slate-300 transition-colors" />
                </div>
              </Link>
            );
          })}
        </div>
      )}

      <div className="mt-8 grid sm:grid-cols-2 gap-3">
        <Link
          href="/admin/inbox"
          className="group relative overflow-hidden p-5 rounded-2xl bg-gradient-to-br from-violet-600 to-cyan-600 text-white font-semibold inline-flex items-center gap-3 shadow-lg shadow-violet-900/30 hover:shadow-violet-900/50 transition-shadow"
        >
          <div className="h-10 w-10 rounded-xl bg-white/15 flex items-center justify-center">
            <MessageSquare className="w-5 h-5" />
          </div>
          <div>
            <div className="text-sm">Open staff inbox</div>
            <div className="text-xs opacity-80 font-normal">Direct message students & staff</div>
          </div>
          <ArrowUpRight className="w-4 h-4 ml-auto opacity-70 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
        </Link>
        <Link
          href="/admin/systems"
          className="group p-5 rounded-2xl border border-white/10 bg-slate-900/60 font-semibold inline-flex items-center gap-3 hover:bg-slate-900/90 transition-colors"
        >
          <div className="h-10 w-10 rounded-xl bg-white/5 flex items-center justify-center">
            <Wrench className="w-5 h-5 text-emerald-400" />
          </div>
          <div>
            <div className="text-sm text-white">System build requests</div>
            <div className="text-xs text-slate-500 font-normal">Quotes &amp; FYP / app builds</div>
          </div>
          <ArrowUpRight className="w-4 h-4 ml-auto text-slate-600 group-hover:text-slate-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
        </Link>
        <Link
          href="/admin/proposals/assets"
          className="group p-5 rounded-2xl border border-white/10 bg-slate-900/60 font-semibold inline-flex items-center gap-3 hover:bg-slate-900/90 transition-colors"
        >
          <div className="h-10 w-10 rounded-xl bg-white/5 flex items-center justify-center">
            <Image className="w-5 h-5 text-cyan-300" />
          </div>
          <div>
            <div className="text-sm text-white">School assets & guidance</div>
            <div className="text-xs text-slate-500 font-normal">Logo, defaults, accepted samples, and structure guides</div>
          </div>
          <ArrowUpRight className="w-4 h-4 ml-auto text-slate-600 group-hover:text-slate-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
        </Link>
        <Link
          href="/admin/users"
          className="group p-5 rounded-2xl border border-white/10 bg-slate-900/60 font-semibold inline-flex items-center gap-3 hover:bg-slate-900/90 transition-colors"
        >
          <div className="h-10 w-10 rounded-xl bg-white/5 flex items-center justify-center">
            <Users className="w-5 h-5 text-slate-300" />
          </div>
          <div>
            <div className="text-sm text-white">Manage roles & permissions</div>
            <div className="text-xs text-slate-500 font-normal">Promote, demote, or restrict accounts</div>
          </div>
          <ArrowUpRight className="w-4 h-4 ml-auto text-slate-600 group-hover:text-slate-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
        </Link>
      </div>
    </div>
  );
}
