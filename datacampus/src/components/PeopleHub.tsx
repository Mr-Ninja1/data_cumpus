"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  Check,
  Compass,
  Crown,
  ExternalLink,
  Loader2,
  MessageCircle,
  MessageSquare,
  Search,
  Send,
  Shield,
  UserRound,
  Users,
  X,
} from "lucide-react";
import { supabase } from "@/utils/supabaseClient";
import { useMessages } from "@/hooks/useMessages";
import { useChatSocial } from "@/hooks/useChatSocial";
import FollowButton from "@/components/FollowButton";
import VerifiedBadge from "@/components/VerifiedBadge";
import Auth from "@/components/Auth";
import { isStaffRole } from "@/utils/staff";
import { showToast } from "@/utils/toast";
import { useImmersiveChatLayout } from "@/hooks/useImmersiveChatLayout";

/* ─── types & helpers ─── */

interface Person {
  id: string;
  display_name: string | null;
  role: string | null;
  is_verified: boolean | null;
  created_at: string;
  is_pinned: boolean | null;
  program: string | null;
  student_id: string | null;
}

type ListTab = "chats" | "browse";
type MobilePane = "list" | "detail";

const PAGE_SIZE = 20;

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

function initials(name: string) {
  return (
    name
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0])
      .join("")
      .toUpperCase() || "?"
  );
}

function relativeTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function isPinnedPerson(p: Person) {
  return Boolean(p.is_pinned) || isStaffRole(p.role);
}

function personName(p: Person) {
  return p.display_name || "Unnamed user";
}

/* ─── main hub ─── */

export default function PeopleHub() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const focusPeer = searchParams.get("peer");
  useImmersiveChatLayout();

  const {
    userId,
    conversations,
    unreadCount: dmUnread,
    loading: msgLoading,
    threadWith,
    refresh: refreshMsgs,
  } = useMessages();

  const {
    incoming,
    outgoing,
    admin,
    adminLabel,
    loading: socialLoading,
    sendRequest,
    respond,
    canMessagePeer,
    refresh: refreshSocial,
  } = useChatSocial();

  const [sessionReady, setSessionReady] = useState(false);
  const [signedIn, setSignedIn] = useState(false);

  const [listTab, setListTab] = useState<ListTab>("browse");
  const [mobilePane, setMobilePane] = useState<MobilePane>("list");

  const [people, setPeople] = useState<Person[]>([]);
  const [browseLoading, setBrowseLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [query, setQuery] = useState("");

  const [activePeerId, setActivePeerId] = useState<string | null>(null);
  const [actionPerson, setActionPerson] = useState<Person | null>(null);
  const [requestsOpen, setRequestsOpen] = useState(false);

  const [requestNote, setRequestNote] = useState("");
  const [requestSending, setRequestSending] = useState(false);

  const [reputations, setReputations] = useState<Record<string, number | null>>({});
  const [profileCache, setProfileCache] = useState<Record<string, Person>>({});

  const loadBrowsePage = async (offset: number) => {
    const { data, error } = await supabase
      .from("profiles")
      .select("id, display_name, role, is_verified, created_at, is_pinned, program, student_id")
      .order("created_at", { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) return { rows: [] as Person[], gotFullPage: false };
    const rows = (data || []) as Person[];
    return { rows, gotFullPage: rows.length === PAGE_SIZE };
  };

  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!mounted) return;
      setSignedIn(Boolean(data.session));
      setSessionReady(true);
    })();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const { rows, gotFullPage } = await loadBrowsePage(0);
      if (!mounted) return;
      setPeople(rows);
      setHasMore(gotFullPage);
      setBrowseLoading(false);
    })();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!focusPeer) return;
    router.replace(`/inbox?tab=messages&peer=${encodeURIComponent(focusPeer)}`);
  }, [focusPeer, router]);

  const peopleById = useMemo(() => {
    const map = new Map<string, Person>();
    for (const p of people) map.set(p.id, p);
    return map;
  }, [people]);

  const activePerson = useMemo(() => {
    if (!activePeerId) return null;
    const cached = profileCache[activePeerId];
    if (cached) return cached;
    const fromBrowse = peopleById.get(activePeerId);
    if (fromBrowse) return fromBrowse;
    const conv = conversations.find((c) => c.peerId === activePeerId);
    if (conv) {
      return {
        id: conv.peerId,
        display_name: conv.peerName,
        role: null,
        is_verified: null,
        created_at: "",
        is_pinned: null,
        program: null,
        student_id: null,
      } satisfies Person;
    }
    if (admin?.id === activePeerId) {
      return {
        id: admin.id,
        display_name: admin.name,
        role: admin.role,
        is_verified: true,
        created_at: "",
        is_pinned: true,
        program: null,
        student_id: admin.studentId,
      } satisfies Person;
    }
    return null;
  }, [activePeerId, admin, conversations, peopleById, profileCache]);

  useEffect(() => {
    if (!activePeerId || peopleById.has(activePeerId) || profileCache[activePeerId]) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id, display_name, role, is_verified, created_at, is_pinned, program, student_id")
        .eq("id", activePeerId)
        .maybeSingle();
      if (cancelled || !data) return;
      setProfileCache((prev) => ({ ...prev, [activePeerId]: data as Person }));
    })();
    return () => {
      cancelled = true;
    };
  }, [activePeerId, peopleById, profileCache]);

  const filteredBrowse = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return people;
    return people.filter((p) =>
      [p.display_name || "", p.program || "", p.student_id || ""].some((v) =>
        v.toLowerCase().includes(q)
      )
    );
  }, [people, query]);

  const pinnedBrowse = useMemo(() => filteredBrowse.filter(isPinnedPerson), [filteredBrowse]);
  const restBrowse = useMemo(() => filteredBrowse.filter((p) => !isPinnedPerson(p)), [filteredBrowse]);

  const chatListItems = useMemo(() => {
    const items = conversations.map((c) => ({
      id: c.peerId,
      name: c.peerName,
      subtitle: c.lastBody,
      time: c.lastAt,
      unread: c.unread,
      isAdmin: c.peerId === admin?.id || c.kind === "support" || c.kind === "staff",
    }));
    if (admin?.id && !items.some((i) => i.id === admin.id)) {
      items.unshift({
        id: admin.id,
        name: admin.name || adminLabel,
        subtitle: "Official campus support",
        time: "",
        unread: 0,
        isAdmin: true,
      });
    }
    return items;
  }, [admin, adminLabel, conversations]);

  const filteredChats = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return chatListItems;
    return chatListItems.filter((c) => c.name.toLowerCase().includes(q));
  }, [chatListItems, query]);

  useEffect(() => {
    const ids = new Set<string>();
    if (activePerson) ids.add(activePerson.id);
    for (const p of people.slice(0, 40)) ids.add(p.id);
    const missing = [...ids].filter((id) => !(id in reputations));
    if (missing.length === 0) return;
    let cancelled = false;
    (async () => {
      const results = await Promise.all(
        missing.map(async (id) => {
          try {
            const res = await fetch(`/api/social/profile-stats?userId=${id}`);
            if (!res.ok) return [id, null] as const;
            const json = await res.json().catch(() => ({}));
            return [id, typeof json.reputation === "number" ? json.reputation : null] as const;
          } catch {
            return [id, null] as const;
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
  }, [activePerson, people, reputations]);

  const openChat = useCallback(
    async (peerId: string) => {
      // Full DM UI (reply / delete / receipts) lives in MessagesExperience on inbox.
      router.push(`/inbox?tab=messages&peer=${encodeURIComponent(peerId)}`);
    },
    [router]
  );

  const closeDetail = () => {
    setMobilePane("list");
    setActivePeerId(null);
    router.replace("/people", { scroll: false });
  };

  const handleBrowseSelect = (person: Person) => {
    if (person.id === userId) return;
    setActivePeerId(person.id);
    setMobilePane("detail");
    setActionPerson(person);
    setRequestNote(`Hi ${person.display_name || ""}, I'd love to connect on DataCampus.`.trim());
  };

  const handleChatSelect = (peerId: string) => {
    void openChat(peerId);
  };

  const handleSendRequest = async (person: Person) => {
    if (!requestNote.trim()) {
      showToast("info", "Write a short intro first");
      return;
    }
    setRequestSending(true);
    const result = await sendRequest(person.id, requestNote.trim(), "dm");
    setRequestSending(false);
    if (!result) return;
    setActionPerson(null);
    void openChat(person.id);
    if ("alreadyAccepted" in result && result.alreadyAccepted) {
      await refreshMsgs();
    }
  };

  const handleLoadMore = async () => {
    setLoadingMore(true);
    try {
      const { rows, gotFullPage } = await loadBrowsePage(people.length);
      setPeople((prev) => {
        const seen = new Set(prev.map((p) => p.id));
        return [...prev, ...rows.filter((r) => !seen.has(r.id))];
      });
      setHasMore(gotFullPage);
    } finally {
      setLoadingMore(false);
    }
  };

  if (!sessionReady) {
    return (
      <div className="flex h-[min(78vh,720px)] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
      </div>
    );
  }

  if (!signedIn) {
    return (
      <div className="mx-auto max-w-md py-8">
        <div className="mb-6 text-center">
          <Users className="mx-auto mb-3 h-10 w-10 text-indigo-500" />
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">People</h1>
          <p className="mt-2 text-sm text-gray-500">Sign in to browse students and start chats.</p>
        </div>
        <Auth />
      </div>
    );
  }

  const listLoading = listTab === "chats" ? msgLoading || socialLoading : browseLoading;
  const inConversation = Boolean(activePeerId);

  return (
    <div className="mx-auto w-full">
      <div
        className={`mb-3 flex items-center justify-between gap-3 md:mb-4 ${
          inConversation ? "hidden xl:flex" : "flex"
        }`}
      >
        <div>
          <h1 className="text-xl font-bold tracking-tight text-gray-900 dark:text-gray-50 md:text-2xl">
            People
          </h1>
          <p className="text-xs text-gray-500 dark:text-gray-400 md:text-sm">
            Browse students · open a profile · start a chat when you&apos;re ready
          </p>
        </div>
        <button
          type="button"
          onClick={() => setRequestsOpen(true)}
          className="relative inline-flex items-center gap-1.5 rounded-full bg-gray-100 px-3.5 py-2 text-sm font-medium text-gray-800 dark:bg-gray-900 dark:text-gray-100"
        >
          Requests
          {incoming.length > 0 && (
            <span className="rounded-full bg-indigo-600 px-1.5 text-[10px] font-bold text-white">
              {incoming.length}
            </span>
          )}
        </button>
      </div>

      <div
        className={`flex min-h-[420px] overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-[0_24px_80px_-40px_rgba(79,70,229,0.35)] dark:border-gray-800 dark:bg-gray-950 sm:rounded-[1.75rem] xl:max-h-[820px] ${
          inConversation
            ? "h-[calc(100dvh-3.5rem)] xl:h-[calc(100dvh-6.5rem)]"
            : "h-[calc(100dvh-5.25rem)] xl:h-[calc(100dvh-6.5rem)]"
        }`}
      >
        {/* ── Left: contact list ── */}
        <aside
          className={`flex shrink-0 flex-col border-r border-gray-100 bg-[#f7f8fc] dark:border-gray-800 dark:bg-gray-950/80 ${
            inConversation
              ? "hidden w-full xl:flex xl:w-[min(320px,30%)] xl:max-w-[340px]"
              : "flex w-full xl:w-[min(320px,30%)] xl:max-w-[340px]"
          }`}
        >
          <div className="border-b border-gray-100 p-3 dark:border-gray-800">
            <div className="mb-3 grid grid-cols-2 gap-1 rounded-2xl bg-white p-1 shadow-sm dark:bg-gray-900">
              <button
                type="button"
                onClick={() => setListTab("browse")}
                className={`inline-flex items-center justify-center gap-1.5 rounded-xl py-2 text-sm font-semibold transition ${
                  listTab === "browse"
                    ? "bg-indigo-600 text-white shadow-sm"
                    : "text-gray-600 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-800"
                }`}
              >
                <Compass size={15} />
                Browse
              </button>
              <button
                type="button"
                onClick={() => setListTab("chats")}
                className={`relative inline-flex items-center justify-center gap-1.5 rounded-xl py-2 text-sm font-semibold transition ${
                  listTab === "chats"
                    ? "bg-indigo-600 text-white shadow-sm"
                    : "text-gray-600 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-800"
                }`}
              >
                <MessageSquare size={15} />
                Chats
                {dmUnread > 0 && (
                  <span
                    className={`rounded-full px-1.5 text-[10px] font-bold ${
                      listTab === "chats" ? "bg-white/20 text-white" : "bg-red-600 text-white"
                    }`}
                  >
                    {dmUnread > 9 ? "9+" : dmUnread}
                  </span>
                )}
              </button>
            </div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={listTab === "chats" ? "Search chats…" : "Search students…"}
                className="w-full rounded-2xl border-0 bg-white py-2.5 pl-10 pr-3 text-sm outline-none ring-1 ring-gray-200 focus:ring-indigo-400 dark:bg-gray-900 dark:ring-gray-700"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {listLoading ? (
              <ListSkeleton />
            ) : listTab === "chats" ? (
              filteredChats.length === 0 ? (
                <EmptyList
                  icon={<MessageSquare className="h-9 w-9" />}
                  title="No chats yet"
                  hint="Switch to Browse and tap a student to start messaging."
                  action={() => setListTab("browse")}
                  actionLabel="Browse students"
                />
              ) : (
                <ul>
                  {filteredChats.map((c) => (
                    <ChatRow
                      key={c.id}
                      peerId={c.id}
                      active={activePeerId === c.id}
                      name={c.name}
                      subtitle={c.subtitle}
                      time={c.time}
                      unread={c.unread}
                      isAdmin={c.isAdmin}
                      onClick={() => handleChatSelect(c.id)}
                    />
                  ))}
                </ul>
              )
            ) : filteredBrowse.length === 0 ? (
              <EmptyList
                icon={<UserRound className="h-9 w-9" />}
                title="No students found"
                hint="Try another name, program, or student ID."
                action={() => setQuery("")}
                actionLabel="Clear search"
              />
            ) : (
              <div className="pb-3">
                {pinnedBrowse.length > 0 && (
                  <BrowseSection title="Pinned" pinned>
                    {pinnedBrowse.map((p) => (
                      <BrowseRow
                        key={p.id}
                        person={p}
                        selected={activePeerId === p.id}
                        isSelf={p.id === userId}
                        onClick={() => handleBrowseSelect(p)}
                      />
                    ))}
                  </BrowseSection>
                )}
                {restBrowse.length > 0 && (
                  <BrowseSection title={pinnedBrowse.length ? "Students" : undefined}>
                    {restBrowse.map((p) => (
                      <BrowseRow
                        key={p.id}
                        person={p}
                        selected={activePeerId === p.id}
                        isSelf={p.id === userId}
                        onClick={() => handleBrowseSelect(p)}
                      />
                    ))}
                  </BrowseSection>
                )}
                {!query && hasMore && (
                  <div className="px-3 pt-2">
                    <button
                      type="button"
                      disabled={loadingMore}
                      onClick={() => void handleLoadMore()}
                      className="w-full rounded-xl border border-gray-200 bg-white py-2.5 text-sm font-medium text-gray-700 disabled:opacity-60 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300"
                    >
                      {loadingMore ? "Loading…" : "Load more"}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </aside>

        {/* ── Right: chat / profile ── */}
        <section
          className={`min-w-0 flex-1 flex-col bg-[#ece5dd]/30 dark:bg-gray-950 ${
            inConversation ? "flex" : "hidden xl:flex"
          }`}
        >
          {!activePerson ? (
            <WelcomePane onBrowse={() => setListTab("browse")} />
          ) : (
            <>
              <header className="flex items-center gap-1.5 border-b border-gray-200/80 bg-white/95 px-2 py-2 backdrop-blur sm:gap-2 sm:px-3 sm:py-2.5 dark:border-gray-800 dark:bg-gray-950/95">
                <button
                  type="button"
                  onClick={closeDetail}
                  className="rounded-full p-2 xl:hidden active:bg-gray-100 dark:active:bg-gray-800"
                  aria-label="Back to list"
                >
                  <ArrowLeft size={20} />
                </button>
                <button
                  type="button"
                  onClick={() => setDetailTab("profile")}
                  className="flex min-w-0 flex-1 items-center gap-2 text-left sm:gap-3"
                >
                  <AvatarBubble
                    id={activePerson.id}
                    name={personName(activePerson)}
                    isAdmin={activePerson.id === admin?.id}
                  />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-gray-900 dark:text-gray-50">
                      {personName(activePerson)}
                    </p>
                    <p className="truncate text-[11px] text-gray-500">
                      {activePerson.id === admin?.id
                        ? "Campus support"
                        : activePerson.program || activePerson.student_id
                          ? [activePerson.program, activePerson.student_id ? `ID ${activePerson.student_id}` : null]
                              .filter(Boolean)
                              .join(" · ")
                          : "Tap for profile"}
                    </p>
                  </div>
                </button>
                <div className="flex shrink-0 items-center gap-0.5 rounded-full bg-gray-100 p-0.5 dark:bg-gray-900 sm:gap-1 sm:p-1">
                  <button
                    type="button"
                    onClick={() => void openChat(activePerson.id)}
                    className="rounded-full bg-white px-2.5 py-1.5 text-[11px] font-semibold text-indigo-600 shadow-sm transition sm:px-3 sm:text-xs dark:bg-gray-800 dark:text-indigo-300"
                  >
                    Open chat
                  </button>
                </div>
              </header>

              <ProfilePane
                  person={activePerson}
                  reputation={reputations[activePerson.id]}
                  isSelf={activePerson.id === userId}
                  onOpenFull={() => router.push(`/u/${activePerson.id}`)}
                  onMessage={() => void openChat(activePerson.id)}
                />
            </>
          )}
        </section>
      </div>

      {actionPerson && (
        <ProfileCardSheet
          person={actionPerson}
          reputation={reputations[actionPerson.id]}
          canChat={canMessagePeer(actionPerson.id, {
            hasThread: threadWith(actionPerson.id).length > 0,
          })}
          requestNote={requestNote}
          onRequestNoteChange={setRequestNote}
          requestSending={requestSending}
          onClose={() => setActionPerson(null)}
          onStartChat={() => {
            setActionPerson(null);
            setListTab("chats");
            void openChat(actionPerson.id);
          }}
          onSendRequest={() => void handleSendRequest(actionPerson)}
          onViewFull={() => {
            setActionPerson(null);
            router.push(`/u/${actionPerson.id}`);
          }}
        />
      )}

      {requestsOpen && (
        <RequestsSheet
          incoming={incoming}
          outgoing={outgoing}
          onClose={() => setRequestsOpen(false)}
          onRespond={respond}
          onAccepted={async (peerId, name, studentId) => {
            await refreshMsgs();
            void openChat(peerId);
            setRequestsOpen(false);
          }}
        />
      )}
    </div>
  );
}

/* ─── sub-components ─── */

function AvatarBubble({
  id,
  name,
  isAdmin,
  size = "md",
}: {
  id: string;
  name: string;
  isAdmin?: boolean;
  size?: "sm" | "md";
}) {
  const dim = size === "sm" ? "h-10 w-10 text-xs" : "h-11 w-11 text-sm";
  return (
    <span
      className={`flex shrink-0 items-center justify-center rounded-full font-bold text-white ${dim} ${
        isAdmin
          ? "bg-gradient-to-br from-violet-600 to-indigo-500"
          : `bg-gradient-to-br ${gradientFor(id)}`
      }`}
    >
      {isAdmin ? <Shield size={size === "sm" ? 16 : 18} /> : initials(name)}
    </span>
  );
}

function ChatRow({
  peerId,
  active,
  name,
  subtitle,
  time,
  unread,
  isAdmin,
  onClick,
}: {
  peerId: string;
  active: boolean;
  name: string;
  subtitle: string;
  time: string;
  unread: number;
  isAdmin?: boolean;
  onClick: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className={`flex w-full items-center gap-3 px-3 py-3 text-left transition ${
          active ? "bg-indigo-50 dark:bg-indigo-950/40" : "hover:bg-white/80 dark:hover:bg-gray-900/60"
        }`}
      >
        <AvatarBubble id={peerId} name={name} isAdmin={isAdmin} />
        <span className="min-w-0 flex-1">
          <span className="flex items-center justify-between gap-2">
            <span
              className={`truncate text-sm ${
                unread > 0
                  ? "font-bold text-gray-900 dark:text-gray-50"
                  : "font-semibold text-gray-900 dark:text-gray-50"
              }`}
            >
              {name}
            </span>
            {time && (
              <span className={`shrink-0 text-[11px] ${unread > 0 ? "font-semibold text-indigo-600" : "text-gray-400"}`}>
                {relativeTime(time)}
              </span>
            )}
          </span>
          <span className="mt-0.5 flex items-center justify-between gap-2">
            <span
              className={`truncate text-[13px] ${
                unread > 0 ? "font-medium text-gray-800 dark:text-gray-200" : "text-gray-500"
              }`}
            >
              {subtitle}
            </span>
            {unread > 0 && (
              <span className="shrink-0 rounded-full bg-[#25D366] px-1.5 py-0.5 text-[10px] font-bold text-white">
                {unread > 99 ? "99+" : unread}
              </span>
            )}
          </span>
        </span>
      </button>
    </li>
  );
}

function BrowseRow({
  person,
  selected,
  isSelf,
  onClick,
}: {
  person: Person;
  selected: boolean;
  isSelf: boolean;
  onClick: () => void;
}) {
  const name = personName(person);
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={isSelf}
      className={`flex w-full items-center gap-3 px-3 py-3 text-left transition disabled:opacity-50 ${
        selected ? "bg-indigo-50 dark:bg-indigo-950/30" : "hover:bg-white/70 dark:hover:bg-gray-900/50"
      }`}
    >
      <AvatarBubble id={person.id} name={name} isAdmin={isStaffRole(person.role)} size="sm" />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1">
          {isPinnedPerson(person) && <Crown className="shrink-0 text-amber-500" size={12} />}
          <span className="truncate text-sm font-medium text-gray-900 dark:text-gray-100">
            {name}
            {isSelf ? " (You)" : ""}
          </span>
          <VerifiedBadge role={person.role} isVerified={person.is_verified} size="xs" />
        </span>
        <span className="block truncate text-xs text-gray-500">
          {[person.program, person.student_id ? `ID ${person.student_id}` : null].filter(Boolean).join(" · ") ||
            "Student"}
        </span>
      </span>
      {!isSelf && <MessageCircle className="h-4 w-4 shrink-0 text-indigo-500" />}
    </button>
  );
}

function BrowseSection({
  title,
  pinned,
  children,
}: {
  title?: string;
  pinned?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-2">
      {title && (
        <p
          className={`px-4 py-2 text-[11px] font-semibold uppercase tracking-wide ${
            pinned ? "text-amber-600 dark:text-amber-400" : "text-gray-400"
          }`}
        >
          {title}
        </p>
      )}
      <div>{children}</div>
    </div>
  );
}

function WelcomePane({ onBrowse }: { onBrowse: () => void }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center bg-[radial-gradient(circle_at_top,rgba(99,102,241,0.08),transparent_55%)] px-6 text-center dark:bg-gray-950">
      <div className="mb-5 flex h-20 w-20 items-center justify-center rounded-[1.75rem] bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-lg shadow-indigo-500/25">
        <MessageCircle size={34} />
      </div>
      <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-50">Your campus people</h2>
      <p className="mt-2 max-w-sm text-sm text-gray-500 dark:text-gray-400">
        Browse students on the left. Tap anyone to open their profile card, then message them when you&apos;re ready.
        Switch to Chats anytime for live DMs.
      </p>
      <button
        type="button"
        onClick={onBrowse}
        className="mt-5 inline-flex items-center gap-2 rounded-full bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-indigo-500/20"
      >
        <Compass size={16} />
        Browse students
      </button>
    </div>
  );
}

function ProfilePane({
  person,
  reputation,
  isSelf,
  onOpenFull,
  onMessage,
}: {
  person: Person;
  reputation?: number | null;
  isSelf: boolean;
  onOpenFull: () => void;
  onMessage: () => void;
}) {
  const name = personName(person);
  return (
    <div className="flex-1 overflow-y-auto bg-gradient-to-b from-white to-violet-50/40 p-4 dark:from-gray-950 dark:to-violet-950/10 sm:p-6">
      <div className="mx-auto max-w-md">
        <div className="overflow-hidden rounded-[1.75rem] border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
          <div className="bg-gradient-to-r from-[#2b0a63] via-[#4f2cc9] to-[#6d28d9] px-5 pb-12 pt-5" />
          <div className="relative px-5 pb-5">
            <div className="-mt-10 flex items-end gap-4">
              <div
                className={`flex h-20 w-20 items-center justify-center rounded-[1.25rem] bg-gradient-to-br ${gradientFor(person.id)} text-2xl font-bold text-white ring-4 ring-white dark:ring-gray-900`}
              >
                {initials(name)}
              </div>
              <div className="min-w-0 pb-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <h3 className="truncate text-lg font-bold text-gray-900 dark:text-gray-100">{name}</h3>
                  <VerifiedBadge role={person.role} isVerified={person.is_verified} size="sm" />
                </div>
                <p className="text-sm text-gray-500">{person.program || "Student on DataCampus"}</p>
              </div>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-2">
              <StatChip label="Program" value={person.program || "—"} />
              <StatChip label="Student ID" value={person.student_id || "—"} />
              <StatChip
                label="Reputation"
                value={typeof reputation === "number" ? reputation.toLocaleString() : "—"}
              />
              <StatChip label="Role" value={isStaffRole(person.role) ? person.role || "Staff" : "Student"} />
            </div>

            <div className="mt-5 grid gap-2 sm:grid-cols-2">
              {!isSelf && <FollowButton userId={person.id} className="w-full" />}
              <button
                type="button"
                onClick={onMessage}
                className="inline-flex items-center justify-center gap-2 rounded-full bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white"
              >
                <MessageCircle className="h-4 w-4" />
                Message
              </button>
              <button
                type="button"
                onClick={onOpenFull}
                className={`inline-flex items-center justify-center gap-2 rounded-full border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-gray-900 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100 ${
                  isSelf ? "sm:col-span-2" : "sm:col-span-2"
                }`}
              >
                <ExternalLink className="h-4 w-4" />
                Open full profile
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-gray-50 px-3 py-2.5 dark:bg-gray-950">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">{label}</p>
      <p className="mt-0.5 truncate text-sm font-medium text-gray-900 dark:text-gray-100">{value}</p>
    </div>
  );
}

function ProfileCardSheet({
  person,
  reputation,
  canChat,
  requestNote,
  onRequestNoteChange,
  requestSending,
  onClose,
  onStartChat,
  onSendRequest,
  onViewFull,
}: {
  person: Person;
  reputation?: number | null;
  canChat: boolean;
  requestNote: string;
  onRequestNoteChange: (v: string) => void;
  requestSending: boolean;
  onClose: () => void;
  onStartChat: () => void;
  onSendRequest: () => void;
  onViewFull: () => void;
}) {
  const name = personName(person);
  const [mode, setMode] = useState<"card" | "request">("card");

  return (
    <div className="fixed inset-0 z-[90] flex flex-col justify-end md:items-center md:justify-center md:p-4">
      <button type="button" className="absolute inset-0 bg-black/50" aria-label="Close" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md overflow-hidden rounded-t-3xl bg-white shadow-2xl dark:bg-gray-950 md:rounded-3xl">
        <div className="relative overflow-hidden bg-gradient-to-br from-[#2b0a63] via-[#4f2cc9] to-[#6d28d9] px-5 pb-14 pt-5 text-white">
          <div className="pointer-events-none absolute -right-8 top-0 h-32 w-32 rounded-full bg-white/10 blur-2xl" />
          <div className="relative flex items-start justify-between">
            <p className="text-xs font-medium uppercase tracking-wide text-white/70">Profile card</p>
            <button type="button" onClick={onClose} className="rounded-full p-2 hover:bg-white/10">
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="relative px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
          <div className="-mt-10 mb-4 flex items-end gap-3">
            <div
              className={`flex h-20 w-20 items-center justify-center rounded-[1.35rem] bg-gradient-to-br ${gradientFor(person.id)} text-2xl font-bold text-white ring-4 ring-white shadow-lg dark:ring-gray-950`}
            >
              {initials(name)}
            </div>
            <div className="min-w-0 pb-1">
              <div className="flex flex-wrap items-center gap-1.5">
                <h3 className="truncate text-lg font-bold text-gray-900 dark:text-gray-50">{name}</h3>
                <VerifiedBadge role={person.role} isVerified={person.is_verified} size="sm" />
              </div>
              <p className="text-sm text-gray-500">
                {person.program || "Student on DataCampus"}
                {person.student_id ? ` · ID ${person.student_id}` : ""}
              </p>
            </div>
          </div>

          <div className="mb-4 grid grid-cols-2 gap-2">
            <StatChip label="Reputation" value={typeof reputation === "number" ? reputation.toLocaleString() : "—"} />
            <StatChip label="Role" value={isStaffRole(person.role) ? person.role || "Staff" : "Student"} />
          </div>

          {mode === "card" ? (
            <div className="space-y-2.5">
              <FollowButton userId={person.id} className="w-full" />
              {canChat ? (
                <button
                  type="button"
                  onClick={onStartChat}
                  className="flex w-full items-center justify-center gap-2 rounded-2xl bg-indigo-600 py-3.5 text-sm font-semibold text-white shadow-md shadow-indigo-500/20"
                >
                  <MessageCircle className="h-4 w-4" />
                  Message
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setMode("request")}
                  className="flex w-full items-center justify-center gap-2 rounded-2xl bg-indigo-600 py-3.5 text-sm font-semibold text-white shadow-md shadow-indigo-500/20"
                >
                  <MessageCircle className="h-4 w-4" />
                  Start a chat
                </button>
              )}
              <button
                type="button"
                onClick={onViewFull}
                className="flex w-full items-center justify-center gap-2 rounded-2xl border border-gray-200 py-3 text-sm font-semibold text-gray-900 dark:border-gray-700 dark:text-gray-100"
              >
                <ExternalLink className="h-4 w-4" />
                Open full profile
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-gray-500">Send a short intro — they&apos;ll get a chat request.</p>
              <textarea
                value={requestNote}
                onChange={(e) => onRequestNoteChange(e.target.value)}
                rows={3}
                maxLength={500}
                autoFocus
                className="w-full resize-none rounded-2xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-900"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setMode("card")}
                  className="flex-1 rounded-full py-2.5 text-sm font-medium ring-1 ring-gray-200 dark:ring-gray-700"
                >
                  Back
                </button>
                <button
                  type="button"
                  disabled={requestSending || !requestNote.trim()}
                  onClick={onSendRequest}
                  className="flex flex-1 items-center justify-center gap-2 rounded-full bg-indigo-600 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
                >
                  {requestSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  Send & open
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function RequestsSheet({
  incoming,
  outgoing,
  onClose,
  onRespond,
  onAccepted,
}: {
  incoming: {
    id: string;
    peerId: string;
    peerName: string;
    peerStudentId: string | null;
    peerVerified: boolean;
    message: string | null;
  }[];
  outgoing: { id: string; peerName: string; status: string }[];
  onClose: () => void;
  onRespond: (id: string, action: "accept" | "decline" | "cancel") => Promise<boolean>;
  onAccepted: (peerId: string, name: string, studentId: string | null) => void;
}) {
  return (
    <div className="fixed inset-0 z-[90] flex flex-col justify-end md:items-center md:justify-center md:p-4">
      <button type="button" className="absolute inset-0 bg-black/45" aria-label="Close" onClick={onClose} />
      <div className="relative z-10 max-h-[88vh] w-full overflow-y-auto rounded-t-3xl bg-white p-4 dark:bg-gray-950 md:max-w-md md:rounded-3xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold">Chat requests</h3>
          <button type="button" onClick={onClose} className="rounded-full p-2">
            <X size={20} />
          </button>
        </div>
        {incoming.length === 0 && outgoing.filter((o) => o.status === "pending").length === 0 ? (
          <p className="py-8 text-center text-sm text-gray-500">No pending requests</p>
        ) : (
          <div className="space-y-4">
            {incoming.map((r) => (
              <div key={r.id} className="rounded-2xl border border-gray-100 bg-gray-50 p-3 dark:border-gray-800 dark:bg-gray-900">
                <p className="text-sm font-semibold">{r.peerName}</p>
                {r.message && <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">{r.message}</p>}
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    onClick={async () => {
                      const ok = await onRespond(r.id, "accept");
                      if (ok) onAccepted(r.peerId, r.peerName, r.peerStudentId);
                    }}
                    className="flex flex-1 items-center justify-center gap-1 rounded-full bg-indigo-600 py-2 text-sm font-semibold text-white"
                  >
                    <Check size={16} /> Accept
                  </button>
                  <button
                    type="button"
                    onClick={() => void onRespond(r.id, "decline")}
                    className="flex-1 rounded-full bg-white py-2 text-sm font-medium ring-1 ring-gray-200 dark:bg-gray-950 dark:ring-gray-700"
                  >
                    Decline
                  </button>
                </div>
              </div>
            ))}
            {outgoing
              .filter((o) => o.status === "pending")
              .map((r) => (
                <div key={r.id} className="flex items-center justify-between rounded-2xl border px-3 py-3 dark:border-gray-800">
                  <div>
                    <p className="text-sm font-semibold">{r.peerName}</p>
                    <p className="text-xs text-amber-600">Pending</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void onRespond(r.id, "cancel")}
                    className="text-xs font-medium text-gray-500"
                  >
                    Cancel
                  </button>
                </div>
              ))}
          </div>
        )}
      </div>
    </div>
  );
}

function EmptyList({
  icon,
  title,
  hint,
  action,
  actionLabel,
}: {
  icon: React.ReactNode;
  title: string;
  hint: string;
  action: () => void;
  actionLabel: string;
}) {
  return (
    <div className="flex flex-col items-center px-6 py-16 text-center text-gray-500">
      <div className="mb-3 opacity-30">{icon}</div>
      <p className="font-medium text-gray-800 dark:text-gray-200">{title}</p>
      <p className="mt-1 text-sm">{hint}</p>
      <button
        type="button"
        onClick={action}
        className="mt-4 rounded-full bg-indigo-600 px-4 py-2 text-sm font-semibold text-white"
      >
        {actionLabel}
      </button>
    </div>
  );
}

function ListSkeleton() {
  return (
    <div className="space-y-1 p-2">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-2 py-3">
          <div className="h-11 w-11 animate-pulse rounded-full bg-gray-200 dark:bg-gray-800" />
          <div className="flex-1 space-y-2">
            <div className="h-3 w-1/3 animate-pulse rounded bg-gray-200 dark:bg-gray-800" />
            <div className="h-2.5 w-1/2 animate-pulse rounded bg-gray-200 dark:bg-gray-800" />
          </div>
        </div>
      ))}
    </div>
  );
}
