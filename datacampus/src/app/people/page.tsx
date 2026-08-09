"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Search as SearchIcon, MessageCircle, Users, UserX, Crown, Loader2 } from "lucide-react";
import { supabase } from "@/utils/supabaseClient";
import VerifiedBadge from "@/components/VerifiedBadge";
import { isStaffRole } from "@/utils/staff";

interface Person {
  id: string;
  display_name: string | null;
  role: string | null;
  is_verified: boolean | null;
  created_at: string;
  is_pinned: boolean | null;
}

const PAGE_SIZE = 20;

// Staff always float to the top, ranked owner > admin > moderator.
const STAFF_RANK: Record<string, number> = {
  owner: 3,
  admin: 2,
  moderator: 1,
};

function roleLabel(role: string | null) {
  switch (role) {
    case "owner":
      return "Owner";
    case "admin":
      return "Admin";
    case "moderator":
      return "Moderator";
    default:
      return null;
  }
}

const AVATAR_GRADIENTS = [
  "from-indigo-500 to-purple-500",
  "from-emerald-500 to-teal-500",
  "from-amber-500 to-orange-500",
  "from-pink-500 to-rose-500",
  "from-sky-500 to-blue-500",
  "from-violet-500 to-fuchsia-500",
];

function gradientFor(id: string) {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return AVATAR_GRADIENTS[hash % AVATAR_GRADIENTS.length];
}

function isPinnedPerson(p: Person) {
  return Boolean(p.is_pinned) || isStaffRole(p.role);
}

function RowSkeleton() {
  return (
    <div className="flex items-center gap-3 px-3 py-3">
      <div className="h-11 w-11 rounded-full bg-gray-100 dark:bg-gray-800 animate-pulse shrink-0" />
      <div className="flex-1 min-w-0 space-y-2">
        <div className="h-3.5 w-1/3 rounded bg-gray-100 dark:bg-gray-800 animate-pulse" />
        <div className="h-2.5 w-1/5 rounded bg-gray-100 dark:bg-gray-800 animate-pulse" />
      </div>
    </div>
  );
}

function PersonRow({
  p,
  currentUserId,
  reputation,
  pinned,
  onNavigate,
}: {
  p: Person;
  currentUserId: string | null;
  reputation: number | null | undefined;
  pinned: boolean;
  onNavigate: (id: string) => void;
}) {
  const name = p.display_name || "Unnamed user";
  const initial = (p.display_name || "U").trim().charAt(0).toUpperCase() || "U";
  const staff = isStaffRole(p.role);
  const label = roleLabel(p.role);
  const isSelf = p.id === currentUserId;

  return (
    <button
      type="button"
      onClick={() => onNavigate(p.id)}
      className={`w-full flex items-center gap-3 px-3 py-3 text-left transition-colors ${
        pinned
          ? "bg-amber-50/70 hover:bg-amber-100/70 dark:bg-amber-900/10 dark:hover:bg-amber-900/20"
          : "hover:bg-gray-50 dark:hover:bg-gray-900/60"
      }`}
    >
      <div
        className={`h-11 w-11 rounded-full bg-gradient-to-br ${gradientFor(
          p.id
        )} flex items-center justify-center text-white font-semibold text-base shrink-0 ${
          pinned ? "ring-2 ring-amber-400/70 ring-offset-1 ring-offset-amber-50 dark:ring-offset-gray-900" : ""
        }`}
      >
        {initial}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1 min-w-0">
          {pinned && <Crown className="text-amber-500 shrink-0" size={13} />}
          <span className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
            {name}
            {isSelf ? " (You)" : ""}
          </span>
          <VerifiedBadge role={p.role} isVerified={p.is_verified} size="sm" />
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {staff && label ? (
            <span className="text-amber-600 dark:text-amber-400 font-medium text-xs">{label}</span>
          ) : (
            <span className="text-gray-400 dark:text-gray-500 text-xs">Member</span>
          )}
          {typeof reputation === "number" && (
            <span className="text-amber-600 dark:text-amber-400 text-xs font-medium inline-flex items-center gap-0.5">
              💰 {reputation.toLocaleString()}
            </span>
          )}
        </div>
      </div>
      <span
        role="button"
        tabIndex={-1}
        onClick={(e) => {
          e.stopPropagation();
          onNavigate(p.id);
        }}
        className="p-2 rounded-full text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-colors shrink-0"
        aria-label={`Message ${name}`}
      >
        <MessageCircle size={18} />
      </span>
    </button>
  );
}

export default function PeoplePage() {
  const router = useRouter();
  const [people, setPeople] = useState<Person[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [query, setQuery] = useState("");
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [reputations, setReputations] = useState<Record<string, number | null>>({});

  const loadPage = async (offset: number) => {
    const { data, error } = await supabase
      .from("profiles")
      .select("id, display_name, role, is_verified, created_at, is_pinned")
      .order("created_at", { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1);

    if (error) {
      console.error("Failed to load people:", error.message);
      return { rows: [] as Person[], gotFullPage: false };
    }
    const rows = (data || []) as Person[];
    return { rows, gotFullPage: rows.length === PAGE_SIZE };
  };

  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data: session } = await supabase.auth.getSession();
      if (mounted) setCurrentUserId(session.session?.user?.id ?? null);

      const { rows, gotFullPage } = await loadPage(0);
      if (!mounted) return;
      setPeople(rows);
      setHasMore(gotFullPage);
      setLoading(false);
    })();
    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleLoadMore = async () => {
    setLoadingMore(true);
    try {
      const { rows, gotFullPage } = await loadPage(people.length);
      setPeople((prev) => {
        const seen = new Set(prev.map((p) => p.id));
        return [...prev, ...rows.filter((r) => !seen.has(r.id))];
      });
      setHasMore(gotFullPage);
    } finally {
      setLoadingMore(false);
    }
  };

  // Fetch reputation for any visible person we don't have yet, without
  // blocking the initial render — names show immediately, rep fills in async.
  useEffect(() => {
    const missing = people.filter((p) => !(p.id in reputations));
    if (missing.length === 0) return;
    let cancelled = false;
    (async () => {
      const results = await Promise.all(
        missing.map(async (p) => {
          try {
            const res = await fetch(`/api/social/profile-stats?userId=${p.id}`);
            if (!res.ok) return [p.id, null] as const;
            const json = await res.json().catch(() => ({}));
            return [p.id, typeof json.reputation === "number" ? json.reputation : null] as const;
          } catch {
            return [p.id, null] as const;
          }
        })
      );
      if (cancelled) return;
      setReputations((prev) => {
        const next = { ...prev };
        for (const [id, rep] of results) next[id] = rep;
        return next;
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [people, reputations]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return people;
    return people.filter((p) => (p.display_name || "").toLowerCase().includes(q));
  }, [people, query]);

  const pinnedPeople = useMemo(() => filtered.filter(isPinnedPerson), [filtered]);
  const everyoneElse = useMemo(() => filtered.filter((p) => !isPinnedPerson(p)), [filtered]);

  const handleNavigate = (id: string) => router.push(`/u/${id}`);

  return (
    <div className="font-sans px-3 pt-4 md:px-0 md:pt-0">
      <div className="max-w-2xl mx-auto w-full">
        <div className="mb-6">
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-gray-100 mb-1 flex items-center gap-2">
            <Users className="text-indigo-600 dark:text-indigo-400" size={26} />
            People
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Everyone on DataCampus — tap anyone to view their profile or start a chat.
          </p>
        </div>

        <div className="relative mb-6 w-full">
          <SearchIcon className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search people by name..."
            className="w-full pl-11 pr-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-base"
          />
        </div>

        {loading ? (
          <div className="w-full bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 divide-y divide-gray-100 dark:divide-gray-800 overflow-hidden">
            {Array.from({ length: 7 }).map((_, i) => (
              <RowSkeleton key={i} />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
            <div className="relative mb-6">
              <div className="absolute inset-0 bg-amber-500/10 blur-3xl rounded-full" />
              <div className="relative bg-gradient-to-br from-amber-100 to-orange-100 dark:from-amber-900/30 dark:to-orange-900/30 p-8 rounded-2xl">
                <UserX className="text-amber-600 dark:text-amber-400 w-16 h-16" />
              </div>
            </div>
            <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">
              No one matches your search
            </h3>
            <button
              onClick={() => setQuery("")}
              className="px-6 py-3 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-xl font-medium hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
            >
              Clear search
            </button>
          </div>
        ) : (
          <div className="w-full space-y-6">
            {pinnedPeople.length > 0 && (
              <div className="w-full">
                <h2 className="text-xs font-semibold uppercase tracking-wide text-amber-600 dark:text-amber-400 mb-2 flex items-center gap-1.5 px-1">
                  <Crown size={14} />
                  Pinned
                </h2>
                <div className="w-full bg-amber-50/40 dark:bg-amber-900/5 rounded-2xl border border-amber-200/70 dark:border-amber-800/40 divide-y divide-amber-100 dark:divide-amber-900/30 overflow-hidden">
                  {pinnedPeople.map((p) => (
                    <PersonRow
                      key={p.id}
                      p={p}
                      currentUserId={currentUserId}
                      reputation={reputations[p.id]}
                      pinned
                      onNavigate={handleNavigate}
                    />
                  ))}
                </div>
              </div>
            )}

            {everyoneElse.length > 0 && (
              <div className="w-full">
                {pinnedPeople.length > 0 && (
                  <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500 mb-2 px-1">
                    Everyone else
                  </h2>
                )}
                <div className="w-full bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 divide-y divide-gray-100 dark:divide-gray-800 overflow-hidden">
                  {everyoneElse.map((p) => (
                    <PersonRow
                      key={p.id}
                      p={p}
                      currentUserId={currentUserId}
                      reputation={reputations[p.id]}
                      pinned={false}
                      onNavigate={handleNavigate}
                    />
                  ))}
                </div>
              </div>
            )}

            {!query && hasMore && (
              <div className="w-full flex justify-center pt-1">
                <button
                  type="button"
                  onClick={() => void handleLoadMore()}
                  disabled={loadingMore}
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors disabled:opacity-60"
                >
                  {loadingMore ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  {loadingMore ? "Loading..." : "Load more"}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
