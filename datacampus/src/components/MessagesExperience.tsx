"use client";

import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  AlertCircle,
  ArrowLeft,
  Check,
  Clock,
  Copy,
  Eye,
  Headphones,
  ImagePlus,
  Loader2,
  MessageSquarePlus,
  MoreVertical,
  Reply,
  Search,
  Send,
  Shield,
  Smile,
  Trash2,
  UserRound,
  Users,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import {
  canDeleteForEveryone,
  deliverySightOf,
  mediaFrom,
  reactionsFrom,
  useMessages,
  type DeliverySight,
  type MessageRow,
  type ReplyToRef,
} from "@/hooks/useMessages";
import { useChatSocial, type ContactHit } from "@/hooks/useChatSocial";
import { useImmersiveChatLayout } from "@/hooks/useImmersiveChatLayout";
import VerifiedBadge from "@/components/VerifiedBadge";
import ChatImageBubble from "@/components/ChatImageBubble";
import { showToast } from "@/utils/toast";
import { supabase } from "@/utils/supabaseClient";
import { conversationKey } from "@/utils/roles";

const COMPOSER_EMOJI = [
  "😀", "😂", "😍", "🥰", "😎", "🤔", "😢", "😮", "🙏", "👍",
  "👎", "❤️", "🔥", "✨", "🎉", "💯", "👀", "🙌", "💪", "🤝",
  "🎓", "📚", "✅", "⭐", "😅", "🤣", "😘", "😭", "😤", "💤",
];

const QUICK_REACT = ["❤️", "😂", "👍", "😮", "😢", "🙏"];

const TYPE_CHARS = "abcdefghijklmnopqrstuvwxyz·•✦";

function isDeleted(m: MessageRow) {
  return Boolean(m.metadata?.deleted_for_everyone);
}

function replyFrom(m: MessageRow): ReplyToRef | null {
  const raw = m.metadata?.reply_to;
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== "string") return null;
  return {
    id: r.id,
    preview: typeof r.preview === "string" ? r.preview : "",
    sender_id: typeof r.sender_id === "string" ? r.sender_id : null,
  };
}

function dayLabel(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const yest = new Date();
  yest.setDate(today.getDate() - 1);
  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
  if (sameDay(d, today)) return "Today";
  if (sameDay(d, yest)) return "Yesterday";
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

function sameCalendarDay(a: string, b: string) {
  const d1 = new Date(a);
  const d2 = new Date(b);
  return (
    d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate()
  );
}

function replyPreviewText(m: MessageRow) {
  if (isDeleted(m)) return "This message was deleted";
  const media = mediaFrom(m.metadata);
  if (media && !(m.body || "").trim()) return "📷 Photo";
  return (m.body || "").slice(0, 120) || "Message";
}

/** One grey eye = sent · two grey = delivered · two blue = seen · clock = pending */
function SightEyes({ status }: { status: DeliverySight }) {
  if (status === "pending") {
    return (
      <span className="inline-flex" title="Sending">
        <Clock className="h-3.5 w-3.5 text-gray-400/80 dark:text-white/35" strokeWidth={2} />
      </span>
    );
  }
  if (status === "failed") {
    return (
      <span className="inline-flex" title="Not sent — tap to retry">
        <AlertCircle className="h-3.5 w-3.5 text-red-500" strokeWidth={2.2} />
      </span>
    );
  }
  if (status === "seen") {
    return (
      <span className="inline-flex items-center -space-x-1" title="Seen">
        <Eye className="h-3.5 w-3.5 text-sky-500" strokeWidth={2.4} />
        <Eye className="h-3.5 w-3.5 text-sky-500" strokeWidth={2.4} />
      </span>
    );
  }
  if (status === "delivered") {
    return (
      <span className="inline-flex items-center -space-x-1" title="Delivered">
        <Eye className="h-3.5 w-3.5 text-gray-400 dark:text-white/45" strokeWidth={2.2} />
        <Eye className="h-3.5 w-3.5 text-gray-400 dark:text-white/45" strokeWidth={2.2} />
      </span>
    );
  }
  return (
    <span className="inline-flex" title="Sent">
      <Eye className="h-3.5 w-3.5 text-gray-400/80 dark:text-white/35" strokeWidth={2} />
    </span>
  );
}

function TypingSpark({ name }: { name: string }) {
  const [chars, setChars] = useState("···");
  useEffect(() => {
    const id = window.setInterval(() => {
      let next = "";
      for (let i = 0; i < 3; i++) {
        next += TYPE_CHARS[Math.floor(Math.random() * TYPE_CHARS.length)];
      }
      setChars(next);
    }, 140);
    return () => window.clearInterval(id);
  }, []);
  return (
    <div className="mt-1 flex justify-start">
      <div className="inline-flex items-center gap-2 rounded-2xl rounded-bl-md bg-white px-3.5 py-2 shadow-sm ring-1 ring-black/5 dark:bg-gray-900 dark:ring-gray-800">
        <span className="font-mono text-[13px] tracking-[0.2em] text-indigo-500 tabular-nums">
          {chars}
        </span>
        <span className="text-[11px] text-gray-400">{name.split(" ")[0]} is typing</span>
      </div>
    </div>
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

function conversationSnippet(c: { lastBody: string; pending: boolean; failed: boolean; mine: boolean }) {
  if (c.failed && c.mine) return "Not sent · tap to retry";
  if (c.pending && c.mine) return "Sending…";
  return c.lastBody;
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

const AVATARS = [
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
  return AVATARS[hash % AVATARS.length];
}

type Props = {
  sessionToken?: string | null;
  focusPeerId?: string | null;
  focusRequests?: boolean;
  onOpenSupport?: () => void;
  onConversationChange?: (open: boolean) => void;
};

export default function MessagesExperience({
  focusPeerId = null,
  focusRequests = false,
  onOpenSupport,
  onConversationChange,
}: Props) {
  const router = useRouter();
  useImmersiveChatLayout();
  const {
    userId,
    conversations,
    unreadCount,
    loading: msgLoading,
    send,
    retryFailed,
    markConversationRead,
    threadWith,
    clearThread,
    deleteForEveryone,
    deleteForMe,
    toggleReaction,
    refresh: refreshMsgs,
  } = useMessages();

  const {
    incoming,
    outgoing,
    admin,
    adminLabel,
    loading: socialLoading,
    searchContacts,
    sendRequest,
    respond,
    respondDetailed,
    canMessagePeer,
    refresh: refreshSocial,
  } = useChatSocial();

  const [activePeer, setActivePeer] = useState<string | null>(focusPeerId);
  const [activePeerMeta, setActivePeerMeta] = useState<{
    name: string;
    isAdmin?: boolean;
    studentId?: string | null;
  } | null>(null);
  const [draft, setDraft] = useState("");
  const [composerOpen, setComposerOpen] = useState(false);
  const [requestsOpen, setRequestsOpen] = useState(focusRequests);
  const [query, setQuery] = useState("");
  const [listFilter, setListFilter] = useState("");
  const [hits, setHits] = useState<ContactHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [requestNote, setRequestNote] = useState("Hi — can we chat on DataCampus?");
  const [selectedContact, setSelectedContact] = useState<ContactHit | null>(null);
  const [sendingRequest, setSendingRequest] = useState(false);
  const [replyTo, setReplyTo] = useState<ReplyToRef | null>(null);
  const [actionMsgId, setActionMsgId] = useState<string | null>(null);
  const [reactMsgId, setReactMsgId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [imageDraft, setImageDraft] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [peerTyping, setPeerTyping] = useState(false);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const typingChannel = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const typingIdle = useRef<ReturnType<typeof setTimeout> | null>(null);
  const msgRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  const clearLongPress = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }, []);

  const startLongPress = useCallback(
    (messageId: string) => {
      clearLongPress();
      longPressTimer.current = setTimeout(() => {
        setActionMsgId(messageId);
        if (typeof navigator !== "undefined" && "vibrate" in navigator) {
          navigator.vibrate(12);
        }
      }, 480);
    },
    [clearLongPress]
  );

  const scrollToMessage = useCallback((id: string) => {
    const el = msgRefs.current.get(id);
    if (!el) {
      showToast("info", "Original message isn't on this device");
      return;
    }
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    setHighlightId(id);
    window.setTimeout(() => setHighlightId((cur) => (cur === id ? null : cur)), 1600);
  }, []);

  const broadcastTyping = useCallback(() => {
    if (!typingChannel.current || !userId) return;
    void typingChannel.current.send({
      type: "broadcast",
      event: "typing",
      payload: { userId, at: Date.now() },
    });
  }, [userId]);

  const onDraftChange = (value: string) => {
    setDraft(value);
    if (!value.trim()) return;
    broadcastTyping();
    if (typingIdle.current) clearTimeout(typingIdle.current);
    typingIdle.current = setTimeout(() => {
      // stop spam — peer auto-clears after idle
    }, 1200);
  };

  const thread = useMemo(
    () => (activePeer ? threadWith(activePeer) : []),
    [activePeer, threadWith]
  );

  const openPeer = useCallback(
    async (
      peerId: string,
      meta?: { name: string; isAdmin?: boolean; studentId?: string | null }
    ) => {
      setActivePeer(peerId);
      setActivePeerMeta(meta || { name: "Chat" });
      setComposerOpen(false);
      setRequestsOpen(false);
      setDraft("");
      setReplyTo(null);
      setActionMsgId(null);
      setReactMsgId(null);
      setEmojiOpen(false);
      setImageDraft(null);
      void markConversationRead(peerId);
      router.replace(`/inbox?tab=messages&peer=${peerId}`, { scroll: false });
      onConversationChange?.(true);
    },
    [markConversationRead, onConversationChange, router]
  );

  useEffect(() => {
    if (focusPeerId) void openPeer(focusPeerId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusPeerId]);

  useEffect(() => {
    if (focusRequests) setRequestsOpen(true);
  }, [focusRequests]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [thread.length, activePeer, peerTyping]);

  // Keep eyes blue: mark incoming as seen while this chat is open.
  useEffect(() => {
    if (!activePeer || !userId) return;
    const hasUnread = thread.some(
      (m) => m.recipient_id === userId && m.sender_id === activePeer && !m.read
    );
    if (!hasUnread) return;
    const t = window.setTimeout(() => {
      void markConversationRead(activePeer);
    }, 350);
    return () => window.clearTimeout(t);
  }, [thread, activePeer, userId, markConversationRead]);

  // Ephemeral typing presence (broadcast only — nothing stored)
  useEffect(() => {
    if (!userId || !activePeer) {
      setPeerTyping(false);
      return;
    }
    const key = conversationKey(userId, activePeer);
    const channel = supabase.channel(`typing:${key}`, {
      config: { broadcast: { self: false } },
    });
    let clearPeer: ReturnType<typeof setTimeout> | null = null;
    channel
      .on("broadcast", { event: "typing" }, (payload) => {
        const from = (payload.payload as { userId?: string })?.userId;
        if (!from || from === userId) return;
        setPeerTyping(true);
        if (clearPeer) clearTimeout(clearPeer);
        clearPeer = setTimeout(() => setPeerTyping(false), 2200);
      })
      .subscribe();
    typingChannel.current = channel;
    return () => {
      if (clearPeer) clearTimeout(clearPeer);
      typingChannel.current = null;
      void supabase.removeChannel(channel);
      setPeerTyping(false);
    };
  }, [userId, activePeer]);

  useEffect(() => {
    if (!composerOpen) return;
    const q = query.trim();
    if (q.length < 2) {
      setHits([]);
      return;
    }
    let cancelled = false;
    const t = setTimeout(() => {
      void (async () => {
        setSearching(true);
        const found = await searchContacts(q);
        if (!cancelled) setHits(found);
        setSearching(false);
      })();
    }, 280);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query, composerOpen, searchContacts]);

  const openAdmin = async () => {
    if (admin?.id) {
      await openPeer(admin.id, {
        name: admin.name || adminLabel,
        isAdmin: true,
        studentId: admin.studentId,
      });
      return;
    }
    onOpenSupport?.();
  };

  const startReply = (m: MessageRow) => {
    if (isDeleted(m)) return;
    setReplyTo({
      id: m.id,
      preview: replyPreviewText(m),
      sender_id: m.sender_id,
    });
    setActionMsgId(null);
    setReactMsgId(null);
    window.setTimeout(() => inputRef.current?.focus(), 50);
  };

  useEffect(() => {
    if (!imageDraft) {
      setImagePreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(imageDraft);
    setImagePreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [imageDraft]);

  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
  }, [draft, replyTo, imagePreviewUrl, activePeer]);

  const sendReply = () => {
    if (!activePeer) return;
    if (!draft.trim() && !imageDraft) return;
    const isAdmin = Boolean(activePeerMeta?.isAdmin) || activePeer === admin?.id;
    const hasThread = thread.length > 0;
    if (!canMessagePeer(activePeer, { isAdmin, hasThread })) {
      showToast("info", "Send a chat request first — they need to accept");
      setComposerOpen(true);
      return;
    }
    const kind = isAdmin ? "support" : "dm";
    const body = draft;
    const image = imageDraft;
    const reply = replyTo;
    // Instant clear — send continues in background via outbox
    setDraft("");
    setReplyTo(null);
    setImageDraft(null);
    setEmojiOpen(false);
    void send({ recipientId: activePeer, body, kind, replyTo: reply, image, skipPreflight: true });
    void refreshSocial();
  };

  const submitRequest = async () => {
    if (!selectedContact) return;
    const contact = selectedContact;
    setSendingRequest(true);
    const result = await sendRequest(contact.id, requestNote, "dm");
    setSendingRequest(false);
    if (!result) return;
    setSelectedContact(null);
    setComposerOpen(false);
    setQuery("");
    setHits([]);
    if ("alreadyAccepted" in result && result.alreadyAccepted) {
      await openPeer(contact.id, {
        name: contact.name,
        studentId: contact.studentId,
        isAdmin: contact.isStaff,
      });
      await refreshMsgs();
    }
  };

  const filteredConversations = useMemo(() => {
    const q = listFilter.trim().toLowerCase();
    if (!q) return conversations;
    return conversations.filter((c) => c.peerName.toLowerCase().includes(q));
  }, [conversations, listFilter]);

  const loading = msgLoading || socialLoading;
  const title = activePeerMeta?.name || "Chat";
  const isAdminThread = Boolean(activePeerMeta?.isAdmin) || activePeer === admin?.id;

  const conversationList = (
    <div className="flex h-full flex-col">
      <div className="border-b border-gray-100 p-3 dark:border-gray-800">
        <div className="mb-3 flex items-center gap-2">
          <button
            type="button"
            onClick={() => setRequestsOpen(true)}
            className="relative inline-flex items-center gap-1.5 rounded-full bg-gray-100 px-3 py-2 text-sm font-medium text-gray-800 dark:bg-gray-900 dark:text-gray-100"
          >
            Requests
            {incoming.length > 0 && (
              <span className="rounded-full bg-red-600 px-1.5 text-[10px] font-bold text-white">
                {incoming.length > 9 ? "9+" : incoming.length}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => router.push("/people")}
            className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 px-3 py-2 text-sm font-medium text-gray-800 dark:bg-gray-900 dark:text-gray-100"
          >
            <Users size={14} />
            People
          </button>
          <button
            type="button"
            onClick={() => {
              setComposerOpen(true);
              setSelectedContact(null);
              setQuery("");
              setHits([]);
            }}
            className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-indigo-600 px-3.5 py-2 text-sm font-semibold text-white shadow-sm shadow-indigo-500/20"
          >
            <MessageSquarePlus size={16} />
            New
          </button>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            value={listFilter}
            onChange={(e) => setListFilter(e.target.value)}
            placeholder="Search conversations…"
            className="w-full rounded-2xl border-0 bg-gray-100 py-2.5 pl-10 pr-3 text-sm outline-none focus:ring-2 focus:ring-indigo-400 dark:bg-gray-900"
          />
        </div>
        {unreadCount > 0 && (
          <p className="mt-2 text-xs font-medium text-indigo-600 dark:text-indigo-400">
            {unreadCount} unread message{unreadCount === 1 ? "" : "s"}
          </p>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        <button
          type="button"
          onClick={() => void openAdmin()}
          className="flex w-full items-center gap-3 border-b border-indigo-50 bg-gradient-to-r from-violet-50 via-indigo-50 to-cyan-50 px-3 py-3.5 text-left dark:border-indigo-950/40 dark:from-violet-950/40 dark:via-indigo-950/30 dark:to-cyan-950/20"
        >
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-violet-600 to-indigo-500 text-white shadow-md shadow-indigo-500/30">
            <Headphones size={20} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-1.5 text-sm font-semibold text-gray-900 dark:text-gray-50">
              {adminLabel}
              <span className="rounded-md bg-indigo-600/10 px-1.5 py-0.5 text-[10px] font-bold uppercase text-indigo-700 dark:text-indigo-300">
                Official
              </span>
            </span>
            <span className="mt-0.5 block truncate text-xs text-gray-600 dark:text-gray-400">
              {admin?.name ? `${admin.name} · campus help` : "DataCampus support"}
            </span>
          </span>
          <Shield className="h-4 w-4 shrink-0 text-indigo-500" />
        </button>

        {loading ? (
          <div className="space-y-1 p-2">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="flex items-center gap-3 px-2 py-3">
                <div className="h-12 w-12 animate-pulse rounded-full bg-gray-200 dark:bg-gray-800" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 w-1/3 animate-pulse rounded bg-gray-200 dark:bg-gray-800" />
                  <div className="h-2.5 w-1/2 animate-pulse rounded bg-gray-200 dark:bg-gray-800" />
                </div>
              </div>
            ))}
          </div>
        ) : filteredConversations.length === 0 ? (
          <div className="px-4 py-14 text-center">
            <UserRound className="mx-auto mb-3 h-10 w-10 text-gray-300" />
            <p className="font-medium text-gray-800 dark:text-gray-200">No chats yet</p>
            <p className="mt-1 text-sm text-gray-500">Find classmates in People, or start a new chat.</p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              <button
                type="button"
                onClick={() => router.push("/people")}
                className="inline-flex items-center gap-2 rounded-full bg-indigo-600 px-4 py-2 text-sm font-semibold text-white"
              >
                <Users size={16} /> Browse people
              </button>
              <button
                type="button"
                onClick={() => setComposerOpen(true)}
                className="inline-flex items-center gap-2 rounded-full bg-gray-100 px-4 py-2 text-sm font-semibold text-gray-800 dark:bg-gray-900 dark:text-gray-100"
              >
                <Search size={16} /> Search
              </button>
            </div>
          </div>
        ) : (
          <ul>
            {filteredConversations.map((c) => {
              const isAdminRow = c.peerId === admin?.id || c.kind === "support" || c.kind === "staff";
              const active = activePeer === c.peerId;
              return (
                <li key={c.key}>
                  <button
                    type="button"
                    onClick={() =>
                      void openPeer(c.peerId, {
                        name: c.peerName,
                        isAdmin: isAdminRow,
                      })
                    }
                    className={`flex w-full items-center gap-3 px-3 py-3 text-left transition ${
                      active
                        ? "bg-indigo-50 dark:bg-indigo-950/40"
                        : "hover:bg-gray-50 dark:hover:bg-gray-900/70"
                    }`}
                  >
                    <span
                      className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white ${
                        isAdminRow
                          ? "bg-gradient-to-br from-violet-600 to-indigo-500"
                          : `bg-gradient-to-br ${gradientFor(c.peerId)}`
                      }`}
                    >
                      {isAdminRow ? <Shield size={18} /> : initials(c.peerName)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between gap-2">
                        <span
                          className={`truncate text-sm ${
                            c.unread > 0 ? "font-bold text-gray-900 dark:text-white" : "font-semibold text-gray-900 dark:text-gray-50"
                          }`}
                        >
                          {c.peerName}
                        </span>
                        <span
                          className={`shrink-0 text-[11px] ${
                            c.unread > 0 ? "font-semibold text-[#25D366]" : "text-gray-400"
                          }`}
                        >
                          {relativeTime(c.lastAt)}
                        </span>
                      </span>
                      <span className="mt-0.5 flex items-center justify-between gap-2">
                        <span
                          className={`truncate text-[13px] ${
                            c.failed && c.mine
                              ? "font-medium text-red-600 dark:text-red-300"
                              : c.pending && c.mine
                                ? "font-medium text-amber-600 dark:text-amber-300"
                                : c.unread > 0
                                  ? "font-medium text-gray-800 dark:text-gray-200"
                                  : "text-gray-500 dark:text-gray-400"
                          }`}
                        >
                          {conversationSnippet(c)}
                        </span>
                        {c.failed && c.mine ? (
                          <AlertCircle className="h-3.5 w-3.5 shrink-0 text-red-500" />
                        ) : c.pending && c.mine ? (
                          <Clock className="h-3.5 w-3.5 shrink-0 text-amber-500" />
                        ) : c.unread > 0 ? (
                          <span className="shrink-0 rounded-full bg-[#25D366] px-1.5 py-0.5 text-[10px] font-bold text-white">
                            {c.unread > 99 ? "99+" : c.unread}
                          </span>
                        ) : null}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );

  const chatPane = activePeer ? (
    <div className="flex h-full min-h-0 flex-col bg-[#ece5dd]/35 dark:bg-gray-950">
      <div className="flex items-center gap-2 border-b border-gray-200/80 bg-[#f0f2f5] px-3 py-2.5 dark:border-gray-800 dark:bg-gray-900">
        <button
          type="button"
          onClick={() => {
            setActivePeer(null);
            setActivePeerMeta(null);
            setReplyTo(null);
            setActionMsgId(null);
            router.replace("/inbox?tab=messages", { scroll: false });
            onConversationChange?.(false);
          }}
          className="rounded-full p-2 xl:hidden active:bg-gray-200 dark:active:bg-gray-800"
          aria-label="Back"
        >
          <ArrowLeft size={20} />
        </button>
        <div
          className={`flex h-10 w-10 items-center justify-center rounded-full text-sm font-bold text-white ${
            isAdminThread
              ? "bg-gradient-to-br from-violet-600 to-indigo-500"
              : `bg-gradient-to-br ${gradientFor(activePeer)}`
          }`}
        >
          {isAdminThread ? <Shield size={18} /> : initials(title)}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-gray-900 dark:text-gray-50">{title}</p>
          <p className="truncate text-[11px] text-gray-500">
            {isAdminThread
              ? "Official campus contact"
              : activePeerMeta?.studentId
                ? `ID ${activePeerMeta.studentId}`
                : "online · direct message"}
          </p>
        </div>
        {!isAdminThread && thread.length > 0 && (
          <button
            type="button"
            onClick={async () => {
              if (activePeer) await clearThread(activePeer);
              setActivePeer(null);
              setActivePeerMeta(null);
              setReplyTo(null);
              router.replace("/inbox?tab=messages", { scroll: false });
              onConversationChange?.(false);
            }}
            className="rounded-full p-2 text-gray-500 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/30"
            aria-label="Clear chat"
          >
            <Trash2 size={16} />
          </button>
        )}
      </div>

      <div
        className="flex-1 space-y-1.5 overflow-y-auto px-3 py-4"
        style={{
          backgroundImage:
            "radial-gradient(circle at 1px 1px, rgba(0,0,0,0.045) 1px, transparent 0)",
          backgroundSize: "18px 18px",
        }}
        onClick={() => {
          setActionMsgId(null);
          setReactMsgId(null);
        }}
      >
        {thread.length === 0 ? (
          <div className="flex h-full min-h-[40vh] flex-col items-center justify-center px-6 text-center text-sm text-gray-500">
            <MessageSquarePlus className="mb-2 h-8 w-8 opacity-40" />
            <p className="font-medium text-gray-700 dark:text-gray-200">Start the conversation</p>
            <p className="mt-1 max-w-xs text-xs text-gray-500">Messages open instantly and sync in the background. Delivered DMs are kept local to keep chat light.</p>
          </div>
        ) : (
          thread.map((m, idx) => {
            const mine = m.sender_id === userId;
            const deleted = isDeleted(m);
            const quoted = replyFrom(m);
            const prev = thread[idx - 1];
            const showGap = !prev || prev.sender_id !== m.sender_id;
            const showDay = !prev || !sameCalendarDay(prev.created_at, m.created_at);
            const menuOpen = actionMsgId === m.id && !deleted;
            const reactOpen = reactMsgId === m.id && !deleted;
            const canDelete = mine && canDeleteForEveryone(m);
            const sight = mine && !deleted ? deliverySightOf(m) : null;
            const highlighted = highlightId === m.id;
            const media = mediaFrom(m.metadata);
            const reactions = reactionsFrom(m.metadata);
            const reactionEntries = Object.entries(reactions).filter(([, users]) => users.length > 0);
            const failed = Boolean(m.metadata?.failed);

            return (
              <React.Fragment key={m.id}>
                {showDay && (
                  <div className="my-3 flex justify-center">
                    <span className="rounded-full bg-white/90 px-3 py-1 text-[11px] font-medium text-gray-500 shadow-sm ring-1 ring-black/5 dark:bg-gray-900 dark:text-gray-400 dark:ring-gray-800">
                      {dayLabel(m.created_at)}
                    </span>
                  </div>
                )}
                <div
                  ref={(el) => {
                    if (el) msgRefs.current.set(m.id, el);
                    else msgRefs.current.delete(m.id);
                  }}
                  className={`group relative flex max-w-full ${
                    mine ? "justify-end" : "justify-start"
                  } ${showGap && !showDay ? "mt-2" : "mt-0.5"}`}
                >
                  <div
                    className={`relative max-w-[82%] rounded-2xl px-2.5 pt-1.5 pb-1.5 text-left text-[15px] leading-snug shadow-sm transition-[box-shadow,transform] select-none ${
                      deleted
                        ? "bg-gray-100 italic text-gray-500 ring-1 ring-black/5 dark:bg-gray-900 dark:text-gray-400 dark:ring-gray-800"
                        : mine
                          ? "rounded-br-md bg-[#d9fdd3] text-gray-900 dark:bg-emerald-700 dark:text-white"
                          : "rounded-bl-md bg-white text-gray-900 ring-1 ring-black/5 dark:bg-gray-900 dark:text-gray-100 dark:ring-gray-800"
                    } ${
                      highlighted
                        ? "ring-2 ring-indigo-400 scale-[1.01] shadow-md"
                        : ""
                    } ${failed ? "ring-1 ring-red-400/60" : ""}`}
                    onContextMenu={(e) => {
                      if (deleted) return;
                      e.preventDefault();
                      setActionMsgId(m.id);
                      setReactMsgId(null);
                    }}
                    onTouchStart={() => {
                      if (deleted) return;
                      startLongPress(m.id);
                    }}
                    onTouchEnd={clearLongPress}
                    onTouchMove={clearLongPress}
                    onTouchCancel={clearLongPress}
                    onDoubleClick={() => {
                      if (!deleted) startReply(m);
                    }}
                    onClick={() => {
                      if (failed && mine) void retryFailed(m.id);
                    }}
                  >
                    <div className="flex items-start gap-0.5">
                      <div className="min-w-0 flex-1 px-0.5">
                        {quoted && !deleted && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              scrollToMessage(quoted.id);
                            }}
                            className={`mb-1.5 w-full rounded-lg border-l-[3px] px-2.5 py-1.5 text-left text-[12px] transition hover:brightness-95 ${
                              mine
                                ? "border-emerald-700/60 bg-black/[0.06] dark:border-white/50 dark:bg-black/20"
                                : "border-indigo-500 bg-indigo-50 dark:border-indigo-400 dark:bg-indigo-950/40"
                            }`}
                          >
                            <p className="font-semibold opacity-90">
                              {quoted.sender_id === userId ? "You" : title}
                            </p>
                            <p className="line-clamp-2 opacity-70">
                              {quoted.preview || "Message"}
                            </p>
                          </button>
                        )}

                        {!deleted && media?.local_id && (
                          <div className="mb-1.5 -mx-0.5">
                            <ChatImageBubble localId={media.local_id} />
                          </div>
                        )}
                        {!deleted && media && !media.local_id && (
                          <div className="mb-1.5 flex min-h-[120px] min-w-[160px] items-center justify-center rounded-xl bg-black/5 text-xs text-gray-400 ring-1 ring-black/5 dark:bg-white/5 dark:text-gray-500 dark:ring-white/10">
                            <span className="animate-pulse">Loading photo…</span>
                          </div>
                        )}

                        {(deleted || (m.body || "").trim()) && (
                          <p className="whitespace-pre-wrap break-words">
                            {deleted ? "This message was deleted" : m.body}
                          </p>
                        )}

                        {failed && mine && (
                          <p className="mt-1 text-[11px] font-medium text-red-600 dark:text-red-300">
                            Not sent · tap to retry
                          </p>
                        )}

                        {!deleted && reactionEntries.length > 0 && (
                          <div className="mt-1.5 flex flex-wrap gap-1">
                            {reactionEntries.map(([emoji, users]) => {
                              const mineReact = userId ? users.includes(userId) : false;
                              return (
                                <button
                                  key={emoji}
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    void toggleReaction(m.id, emoji);
                                  }}
                                  className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[12px] ring-1 ${
                                    mineReact
                                      ? "bg-indigo-100 ring-indigo-300 dark:bg-indigo-950/50 dark:ring-indigo-700"
                                      : "bg-black/[0.04] ring-black/10 dark:bg-white/10 dark:ring-white/15"
                                  }`}
                                >
                                  <span>{emoji}</span>
                                  {users.length > 1 && (
                                    <span className="text-[10px] opacity-70">{users.length}</span>
                                  )}
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>

                      {!deleted && (
                        <button
                          type="button"
                          data-msg-menu={m.id}
                          aria-label="Message options"
                          aria-expanded={menuOpen}
                          onClick={(e) => {
                            e.stopPropagation();
                            setReactMsgId(null);
                            setActionMsgId((cur) => (cur === m.id ? null : m.id));
                          }}
                          className={`mt-0.5 shrink-0 rounded-md p-1 transition ${
                            mine
                              ? "text-gray-700 hover:bg-black/10 dark:text-white dark:hover:bg-white/15"
                              : "text-gray-600 hover:bg-black/5 dark:text-gray-200 dark:hover:bg-white/10"
                          } ${menuOpen ? "bg-black/10 dark:bg-white/15" : ""}`}
                        >
                          <MoreVertical size={16} strokeWidth={2.5} />
                        </button>
                      )}
                    </div>

                    <p
                      className={`mt-1 flex items-center justify-end gap-1.5 px-0.5 text-[10px] ${
                        mine && !deleted
                          ? "text-gray-500 dark:text-white/70"
                          : "text-gray-400"
                      }`}
                    >
                      {relativeTime(m.created_at)}
                      {sight && <SightEyes status={sight} />}
                    </p>

                    {reactOpen && (
                      <div
                        className={`absolute z-30 flex -translate-y-full gap-0.5 rounded-full bg-[#1f2c34] px-1.5 py-1 shadow-2xl ${
                          mine ? "right-0 top-0" : "left-0 top-0"
                        }`}
                        onClick={(e) => e.stopPropagation()}
                      >
                        {QUICK_REACT.map((emoji) => (
                          <button
                            key={emoji}
                            type="button"
                            className="rounded-full px-1.5 py-1 text-lg hover:bg-white/10"
                            onClick={() => {
                              void toggleReaction(m.id, emoji);
                              setReactMsgId(null);
                            }}
                          >
                            {emoji}
                          </button>
                        ))}
                      </div>
                    )}

                    {menuOpen && (
                      <MessageActionMenu
                        messageId={m.id}
                        mine={mine}
                        canDelete={canDelete}
                        deleting={deletingId === m.id}
                        onClose={() => setActionMsgId(null)}
                        onReply={() => {
                          startReply(m);
                          setActionMsgId(null);
                        }}
                        onReact={() => {
                          setActionMsgId(null);
                          setReactMsgId(m.id);
                        }}
                        onCopy={async () => {
                          try {
                            await navigator.clipboard.writeText(m.body || "");
                            showToast("success", "Copied");
                          } catch {
                            showToast("error", "Could not copy");
                          }
                          setActionMsgId(null);
                        }}
                        onDeleteForMe={async () => {
                          setDeletingId(m.id);
                          await deleteForMe(m.id);
                          setDeletingId(null);
                          setActionMsgId(null);
                        }}
                        onDelete={
                          canDelete
                            ? async () => {
                                setDeletingId(m.id);
                                await deleteForEveryone(m.id);
                                setDeletingId(null);
                                setActionMsgId(null);
                              }
                            : undefined
                        }
                      />
                    )}
                  </div>
                </div>
              </React.Fragment>
            );
          })
        )}
        {peerTyping && <TypingSpark name={title} />}
        <div ref={bottomRef} />
      </div>

      <div className="border-t border-gray-200/80 bg-[#f0f2f5] px-3 py-2.5 dark:border-gray-800 dark:bg-gray-900 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        {replyTo && (
          <div className="mb-2 flex items-start gap-2 rounded-xl bg-white/80 px-3 py-2 ring-1 ring-black/5 dark:bg-gray-950 dark:ring-gray-800">
            <div className="min-w-0 flex-1 border-l-[3px] border-indigo-500 pl-2">
              <p className="text-xs font-semibold text-indigo-600 dark:text-indigo-400">
                Replying to {replyTo.sender_id === userId ? "yourself" : title}
              </p>
              <p className="truncate text-xs text-gray-500">{replyTo.preview || "Message"}</p>
            </div>
            <button
              type="button"
              onClick={() => setReplyTo(null)}
              className="rounded-full p-1 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
              aria-label="Cancel reply"
            >
              <X size={16} />
            </button>
          </div>
        )}
        {imagePreviewUrl && (
          <div className="mb-2 flex items-start gap-2">
            <div className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={imagePreviewUrl}
                alt="Attachment preview"
                className="h-20 w-20 rounded-xl object-cover ring-1 ring-black/10"
              />
              <button
                type="button"
                onClick={() => setImageDraft(null)}
                className="absolute -right-1.5 -top-1.5 rounded-full bg-gray-900 p-0.5 text-white"
                aria-label="Remove image"
              >
                <X size={12} />
              </button>
            </div>
          </div>
        )}
        {emojiOpen && (
          <div className="mb-2 grid max-h-36 grid-cols-8 gap-1 overflow-y-auto rounded-2xl bg-white p-2 shadow-sm ring-1 ring-black/5 dark:bg-gray-950 dark:ring-gray-800">
            {COMPOSER_EMOJI.map((emoji) => (
              <button
                key={emoji}
                type="button"
                className="rounded-lg p-1.5 text-xl hover:bg-gray-100 dark:hover:bg-gray-900"
                onClick={() => {
                  setDraft((d) => d + emoji);
                  inputRef.current?.focus();
                }}
              >
                {emoji}
              </button>
            ))}
          </div>
        )}
        <div className="flex items-end gap-1.5">
          <button
            type="button"
            onClick={() => setEmojiOpen((v) => !v)}
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${
              emojiOpen
                ? "bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300"
                : "bg-white text-gray-600 shadow-sm dark:bg-gray-950 dark:text-gray-300"
            }`}
            aria-label="Emoji"
          >
            <Smile className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white text-gray-600 shadow-sm dark:bg-gray-950 dark:text-gray-300"
            aria-label="Attach image"
          >
            <ImagePlus className="h-5 w-5" />
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) setImageDraft(file);
              e.target.value = "";
            }}
          />
          <textarea
            ref={inputRef}
            value={draft}
            rows={1}
            onChange={(e) => onDraftChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                sendReply();
              }
            }}
            placeholder={replyTo ? "Reply…" : imageDraft ? "Add a caption…" : "Type a message"}
            className="max-h-[140px] min-h-[44px] flex-1 resize-none rounded-[1.4rem] border-0 bg-white px-4 py-3 text-[15px] leading-5 outline-none shadow-sm focus:ring-2 focus:ring-indigo-400 dark:bg-gray-950"
          />
          <button
            type="button"
            disabled={!draft.trim() && !imageDraft}
            onClick={() => sendReply()}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#25D366] text-white shadow-md disabled:opacity-40"
            aria-label="Send"
          >
            <Send className="h-5 w-5" />
          </button>
        </div>
      </div>
    </div>
  ) : (
    <div className="hidden h-full flex-col items-center justify-center bg-[radial-gradient(circle_at_top,rgba(99,102,241,0.08),transparent_55%)] px-6 text-center md:flex dark:bg-gray-950">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-3xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-lg">
        <MessageSquarePlus size={28} />
      </div>
      <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-50">DataCampus Messages</h3>
      <p className="mt-2 max-w-sm text-sm text-gray-500">
        Select a chat on the left, or browse People to start a new conversation.
      </p>
    </div>
  );

  return (
    <div className="relative w-full">
      <div
        className={`flex min-h-[420px] overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-950 sm:rounded-[1.5rem] xl:max-h-[820px] ${
          activePeer
            ? "h-[calc(100dvh-3.5rem)] xl:h-[calc(100dvh-13rem)]"
            : "h-[calc(100dvh-11rem)] xl:h-[calc(100dvh-13rem)]"
        }`}
      >
        <aside
          className={`shrink-0 border-r border-gray-100 bg-white dark:border-gray-800 dark:bg-gray-950 ${
            activePeer
              ? "hidden xl:flex xl:w-[min(320px,30%)] xl:max-w-[340px] xl:flex-col"
              : "flex w-full flex-col xl:w-[min(320px,30%)] xl:max-w-[340px]"
          }`}
        >
          {conversationList}
        </aside>
        <section className={`min-w-0 flex-1 ${activePeer ? "flex flex-col" : "hidden xl:flex"}`}>
          {chatPane}
        </section>
      </div>

      {requestsOpen && (
        <Sheet onClose={() => setRequestsOpen(false)} title="Chat requests">
          {incoming.length === 0 && outgoing.filter((o) => o.status === "pending").length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-500">No pending requests</p>
          ) : (
            <div className="space-y-4">
              {incoming.length > 0 && (
                <section>
                  <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Incoming</h4>
                  <ul className="space-y-2">
                    {incoming.map((r) => (
                      <li
                        key={r.id}
                        className="rounded-2xl border border-gray-100 bg-gray-50 p-3 dark:border-gray-800 dark:bg-gray-900"
                      >
                        <div className="flex items-start gap-2">
                          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-sky-500 text-xs font-bold text-white">
                            {initials(r.peerName)}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="flex items-center gap-1 text-sm font-semibold">
                              {r.peerName}
                              {r.peerVerified && <VerifiedBadge isVerified size="xs" />}
                            </p>
                            <div className="flex items-center gap-2 text-[11px] text-gray-500">
                              {r.peerStudentId && <span>ID {r.peerStudentId}</span>}
                              <span>{relativeTime(r.created_at)}</span>
                            </div>
                            <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">{r.message}</p>
                            <div className="mt-3 flex gap-2">
                              <button
                                type="button"
                                onClick={async () => {
                                  const result = await respondDetailed(r.id, "accept");
                                  if (result?.ok) {
                                    setRequestsOpen(false);
                                    await openPeer(r.peerId, {
                                      name: r.peerName,
                                      studentId: r.peerStudentId,
                                    });
                                    void refreshMsgs();
                                  }
                                }}
                                className="inline-flex flex-1 items-center justify-center gap-1 rounded-full bg-indigo-600 py-2 text-sm font-semibold text-white"
                              >
                                <Check size={16} /> Accept
                              </button>
                              <button
                                type="button"
                                onClick={() => void respond(r.id, "decline")}
                                className="flex-1 rounded-full bg-white py-2 text-sm font-medium ring-1 ring-gray-200 dark:bg-gray-950 dark:ring-gray-700"
                              >
                                Decline
                              </button>
                            </div>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
              {outgoing.filter((o) => o.status === "pending").length > 0 && (
                <section>
                  <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Waiting</h4>
                  <ul className="space-y-2">
                    {outgoing
                      .filter((o) => o.status === "pending")
                      .map((r) => (
                        <li
                          key={r.id}
                          className="flex items-center gap-3 rounded-2xl border border-gray-100 px-3 py-3 dark:border-gray-800"
                        >
                          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-200 text-xs font-bold dark:bg-gray-800">
                            {initials(r.peerName)}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold">{r.peerName}</p>
                            <p className="text-xs text-amber-600">Pending acceptance · {relativeTime(r.created_at)}</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => void respond(r.id, "cancel")}
                            className="text-xs font-medium text-gray-500"
                          >
                            Cancel
                          </button>
                        </li>
                      ))}
                  </ul>
                </section>
              )}
            </div>
          )}
        </Sheet>
      )}

      {composerOpen && (
        <Sheet
          onClose={() => {
            setComposerOpen(false);
            setSelectedContact(null);
          }}
          title={selectedContact ? "Send request" : "Find students"}
        >
          {!selectedContact ? (
            <>
              <div className="relative mb-3">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input
                  autoFocus
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Name or student ID…"
                  className="w-full rounded-xl border-0 bg-gray-100 py-3 pl-10 pr-3 text-sm outline-none focus:ring-2 focus:ring-indigo-400 dark:bg-gray-900"
                />
              </div>
              {searching && (
                <p className="py-6 text-center text-sm text-gray-500">
                  <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" /> Searching…
                </p>
              )}
              {!searching && query.trim().length >= 2 && hits.length === 0 && (
                <p className="py-8 text-center text-sm text-gray-500">No students found</p>
              )}
              <ul className="max-h-[50vh] space-y-1 overflow-y-auto">
                {hits.map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedContact(c)}
                      className="flex w-full items-center gap-3 rounded-xl px-2 py-2.5 text-left hover:bg-gray-50 dark:hover:bg-gray-900"
                    >
                      <span
                        className={`flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br ${gradientFor(c.id)} text-xs font-bold text-white`}
                      >
                        {initials(c.name)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1 text-sm font-semibold">
                          {c.name}
                          {c.verified && <VerifiedBadge isVerified size="xs" />}
                          {c.isStaff && (
                            <span className="rounded bg-violet-100 px-1 text-[10px] font-bold text-violet-700 dark:bg-violet-950 dark:text-violet-300">
                              STAFF
                            </span>
                          )}
                        </span>
                        <span className="block truncate text-xs text-gray-500">
                          {[c.studentId ? `ID ${c.studentId}` : null, c.program].filter(Boolean).join(" · ") ||
                            "Student"}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <div>
              <div className="mb-4 flex items-center gap-3 rounded-2xl bg-gray-50 p-3 dark:bg-gray-900">
                <span
                  className={`flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br ${gradientFor(selectedContact.id)} text-sm font-bold text-white`}
                >
                  {initials(selectedContact.name)}
                </span>
                <div>
                  <p className="font-semibold">{selectedContact.name}</p>
                  <p className="text-xs text-gray-500">
                    {selectedContact.studentId ? `ID ${selectedContact.studentId}` : "Student"}
                  </p>
                </div>
              </div>
              <label className="mb-1 block text-xs font-medium text-gray-500">Request note</label>
              <textarea
                value={requestNote}
                onChange={(e) => setRequestNote(e.target.value)}
                rows={3}
                maxLength={500}
                className="mb-4 w-full resize-none rounded-xl bg-gray-100 p-3 text-sm outline-none focus:ring-2 focus:ring-indigo-400 dark:bg-gray-900"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedContact(null)}
                  className="flex-1 rounded-full py-2.5 text-sm font-medium ring-1 ring-gray-200 dark:ring-gray-700"
                >
                  Back
                </button>
                <button
                  type="button"
                  disabled={sendingRequest || !requestNote.trim()}
                  onClick={() => void submitRequest()}
                  className="flex flex-1 items-center justify-center gap-2 rounded-full bg-indigo-600 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
                >
                  {sendingRequest ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Send request
                </button>
              </div>
            </div>
          )}
        </Sheet>
      )}
    </div>
  );
}

function MessageActionMenu({
  messageId,
  mine,
  canDelete,
  deleting,
  onClose,
  onReply,
  onReact,
  onCopy,
  onDeleteForMe,
  onDelete,
}: {
  messageId: string;
  mine: boolean;
  canDelete: boolean;
  deleting: boolean;
  onClose: () => void;
  onReply: () => void;
  onReact: () => void;
  onCopy: () => void | Promise<void>;
  onDeleteForMe: () => void | Promise<void>;
  onDelete?: () => void | Promise<void>;
}) {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    const place = () => {
      const anchor = document.querySelector(`[data-msg-menu="${messageId}"]`);
      if (!(anchor instanceof HTMLElement)) {
        setPos({ top: 80, left: 16 });
        return;
      }
      const rect = anchor.getBoundingClientRect();
      const menuW = 200;
      const menuH = mine && canDelete ? 260 : 220;
      const pad = 8;
      let left = mine ? rect.right - menuW : rect.left;
      left = Math.max(pad, Math.min(left, window.innerWidth - menuW - pad));
      let top = rect.bottom + 6;
      if (top + menuH > window.innerHeight - pad) {
        top = Math.max(pad, rect.top - menuH - 6);
      }
      setPos({ top, left });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [messageId, mine, canDelete]);

  if (typeof document === "undefined" || !pos) return null;

  return createPortal(
    <>
      <button
        type="button"
        className="fixed inset-0 z-[99] cursor-default bg-transparent"
        aria-label="Close message menu"
        onClick={onClose}
      />
      <div
        role="menu"
        className="fixed z-[100] min-w-[200px] overflow-hidden rounded-xl bg-[#1f2c34] py-1.5 text-white shadow-2xl ring-1 ring-black/30"
        style={{ top: pos.top, left: pos.left }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          role="menuitem"
          onClick={onReply}
          className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm hover:bg-white/10"
        >
          <Reply size={16} className="opacity-80" />
          Reply
        </button>
        <button
          type="button"
          role="menuitem"
          onClick={onReact}
          className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm hover:bg-white/10"
        >
          <Smile size={16} className="opacity-80" />
          React
        </button>
        <button
          type="button"
          role="menuitem"
          onClick={() => void onCopy()}
          className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm hover:bg-white/10"
        >
          <Copy size={16} className="opacity-80" />
          Copy
        </button>
        <div className="my-1 border-t border-white/10" />
        <button
          type="button"
          role="menuitem"
          disabled={deleting}
          onClick={() => void onDeleteForMe()}
          className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm hover:bg-white/10 disabled:opacity-50"
        >
          {deleting ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            <Trash2 size={16} className="opacity-80" />
          )}
          Delete for me
        </button>
        {mine && canDelete && onDelete && (
          <button
            type="button"
            role="menuitem"
            disabled={deleting}
            onClick={() => void onDelete()}
            className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm text-red-400 hover:bg-white/10 disabled:opacity-50"
          >
            {deleting ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <Trash2 size={16} />
            )}
            Delete for everyone
          </button>
        )}
      </div>
    </>,
    document.body
  );
}

function Sheet({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-[80] flex flex-col justify-end md:items-center md:justify-center md:p-4">
      <button type="button" className="absolute inset-0 bg-black/45" aria-label="Close" onClick={onClose} />
      <div className="relative z-10 max-h-[88vh] w-full overflow-y-auto rounded-t-3xl bg-white p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-2xl dark:bg-gray-950 md:max-w-md md:rounded-3xl md:p-5">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-50">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 active:bg-gray-100 dark:active:bg-gray-900"
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
