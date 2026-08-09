"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Inbox as InboxIcon, Loader2, Send } from "lucide-react";
import { supabase } from "@/utils/supabaseClient";
import { useProfile } from "@/hooks/useProfile";
import { showToast } from "@/utils/toast";

type Message = {
  id: string;
  recipient_id: string;
  sender_id: string;
  subject: string;
  body: string;
  read: boolean;
  kind: string;
  conversation_key: string;
  metadata: unknown;
  created_at: string;
};

type Conversation = {
  key: string;
  peerId: string;
  peerName: string;
  lastBody: string;
  lastAt: string;
  unread: boolean;
};

function relativeTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

function shortId(id: string) {
  return `User ${id.slice(0, 8)}`;
}

function ConversationListSkeleton() {
  return (
    <div className="divide-y divide-white/5">
      {[...Array(6)].map((_, i) => (
        <div key={i} className="p-4 flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-white/5 animate-pulse shrink-0" />
          <div className="flex-1 space-y-2">
            <div className="h-3 w-1/3 rounded bg-white/5 animate-pulse" />
            <div className="h-3 w-2/3 rounded bg-white/5 animate-pulse" />
          </div>
        </div>
      ))}
    </div>
  );
}

function ThreadSkeleton() {
  return (
    <div className="flex-1 flex flex-col gap-3 p-4">
      {[...Array(5)].map((_, i) => (
        <div
          key={i}
          className={`h-10 rounded-2xl bg-white/5 animate-pulse ${
            i % 2 === 0 ? "w-2/3 self-start" : "w-1/2 self-end"
          }`}
        />
      ))}
    </div>
  );
}

export default function AdminInboxPage() {
  const { userId } = useProfile();
  const [messages, setMessages] = useState<Message[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [selectedPeer, setSelectedPeer] = useState<string | null>(null);
  const [thread, setThread] = useState<Message[]>([]);
  const [threadLoading, setThreadLoading] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const getToken = async () => {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token || null;
  };

  const loadConversations = async () => {
    setLoading(true);
    try {
      const token = await getToken();
      if (!token) return;
      const res = await fetch("/api/admin/messages", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 401 || res.status === 403) {
          showToast("error", "You don't have access to the staff inbox");
        } else {
          showToast("error", json?.error || "Failed to load messages");
        }
        return;
      }
      setMessages(json.messages || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!userId) return;
    void loadConversations();
  }, [userId]);

  const conversations: Conversation[] = useMemo(() => {
    if (!userId) return [];
    const grouped = new Map<string, Message[]>();
    for (const m of messages) {
      const key = m.conversation_key;
      const arr = grouped.get(key) || [];
      arr.push(m);
      grouped.set(key, arr);
    }
    const list: Conversation[] = [];
    for (const [key, msgs] of grouped) {
      msgs.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      const latest = msgs[0];
      const peerId = latest.sender_id === userId ? latest.recipient_id : latest.sender_id;
      const unread = latest.recipient_id === userId && !latest.read;
      list.push({
        key,
        peerId,
        peerName: names[peerId] || shortId(peerId),
        lastBody: latest.body,
        lastAt: latest.created_at,
        unread,
      });
    }
    list.sort((a, b) => new Date(b.lastAt).getTime() - new Date(a.lastAt).getTime());
    return list;
  }, [messages, userId, names]);

  useEffect(() => {
    const peerIds = new Set<string>();
    for (const m of messages) {
      if (!userId) continue;
      const peerId = m.sender_id === userId ? m.recipient_id : m.sender_id;
      peerIds.add(peerId);
    }
    const missing = [...peerIds].filter((id) => !names[id]);
    if (!missing.length) return;
    (async () => {
      const { data } = await supabase.from("profiles").select("id, display_name").in("id", missing);
      if (!data) return;
      setNames((prev) => {
        const next = { ...prev };
        for (const p of data) {
          if (p.display_name) next[p.id] = p.display_name;
        }
        return next;
      });
    })();
  }, [messages, userId, names]);

  const openConversation = async (peerId: string) => {
    setSelectedPeer(peerId);
    setThread([]);
    setThreadLoading(true);
    try {
      const token = await getToken();
      if (!token) return;
      const res = await fetch(`/api/admin/messages?peerId=${encodeURIComponent(peerId)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast("error", json?.error || "Failed to load conversation");
        return;
      }
      setThread(json.messages || []);
    } finally {
      setThreadLoading(false);
    }
  };

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [thread]);

  const sendMessage = async () => {
    if (!selectedPeer || !draft.trim() || !userId) return;
    const body = draft.trim();
    setSending(true);
    try {
      const token = await getToken();
      if (!token) return;
      const res = await fetch("/api/admin/messages", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ recipientId: selectedPeer, body }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast("error", json?.error || "Failed to send message");
        return;
      }
      const optimistic: Message = {
        id: json.messageId || `tmp-${Date.now()}`,
        recipient_id: selectedPeer,
        sender_id: userId,
        subject: "Message from DataCampus staff",
        body,
        read: false,
        kind: "staff",
        conversation_key: thread[0]?.conversation_key || "",
        metadata: { staff: true },
        created_at: new Date().toISOString(),
      };
      setThread((prev) => [...prev, optimistic]);
      setMessages((prev) => [optimistic, ...prev]);
      setDraft("");
    } finally {
      setSending(false);
    }
  };

  const selectedConversation = conversations.find((c) => c.peerId === selectedPeer);

  return (
    <div className="rounded-2xl border border-white/5 bg-slate-900/50 overflow-hidden h-[calc(100vh-9.5rem)] min-h-[420px] flex">
      {/* Conversation list */}
      <div
        className={`w-full md:w-80 md:shrink-0 border-r border-white/5 flex flex-col ${
          selectedPeer ? "hidden md:flex" : "flex"
        }`}
      >
        <div className="px-4 py-3 border-b border-white/5">
          <h2 className="text-sm font-bold text-white">Conversations</h2>
          <p className="text-[11px] text-slate-500 mt-0.5">Direct messages with students &amp; staff</p>
        </div>
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <ConversationListSkeleton />
          ) : conversations.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full py-16 px-4 text-center">
              <InboxIcon className="w-10 h-10 text-slate-600 mb-3" />
              <p className="text-sm text-slate-400">No messages yet</p>
            </div>
          ) : (
            <div className="divide-y divide-white/5">
              {conversations.map((c) => (
                <button
                  key={c.key}
                  type="button"
                  onClick={() => void openConversation(c.peerId)}
                  className={`w-full text-left p-4 flex items-center gap-3 transition-colors hover:bg-white/[0.03] ${
                    selectedPeer === c.peerId ? "bg-white/[0.04]" : ""
                  }`}
                >
                  <div className="h-10 w-10 rounded-full bg-gradient-to-br from-slate-700 to-slate-800 border border-white/10 flex items-center justify-center text-sm font-bold text-slate-200 shrink-0">
                    {c.peerName[0]?.toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-white truncate">{c.peerName}</p>
                      <span className="text-[11px] text-slate-500 font-mono shrink-0">
                        {relativeTime(c.lastAt)}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 truncate mt-0.5">{c.lastBody}</p>
                  </div>
                  {c.unread && (
                    <span className="relative flex h-2 w-2 shrink-0">
                      <span className="absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75 animate-ping" />
                      <span className="relative inline-flex h-2 w-2 rounded-full bg-cyan-400" />
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Thread */}
      <div className={`flex-1 flex flex-col ${selectedPeer ? "flex" : "hidden md:flex"}`}>
        {!selectedPeer ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center px-4">
            <InboxIcon className="w-10 h-10 text-slate-600 mb-3" />
            <p className="text-sm text-slate-400">Select a conversation to view the thread</p>
          </div>
        ) : (
          <>
            <div className="px-4 py-3 border-b border-white/5 flex items-center gap-3">
              <button
                type="button"
                onClick={() => setSelectedPeer(null)}
                className="md:hidden p-1.5 -ml-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/5"
                aria-label="Back to conversations"
              >
                <ArrowLeft className="w-4.5 h-4.5" />
              </button>
              <div className="h-8 w-8 rounded-full bg-gradient-to-br from-slate-700 to-slate-800 border border-white/10 flex items-center justify-center text-xs font-bold text-slate-200 shrink-0">
                {(selectedConversation?.peerName || shortId(selectedPeer))[0]?.toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-bold text-white truncate">
                  {selectedConversation?.peerName || shortId(selectedPeer)}
                </p>
                <p className="text-[11px] text-slate-500">Direct message</p>
              </div>
            </div>

            {threadLoading ? (
              <ThreadSkeleton />
            ) : (
              <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 flex flex-col gap-2.5">
                {thread.map((m) => {
                  const mine = m.sender_id === userId;
                  return (
                    <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                      <div
                        className={`rounded-2xl px-3.5 py-2.5 max-w-[80%] text-sm ${
                          mine
                            ? "bg-gradient-to-r from-violet-600 to-cyan-600 text-white"
                            : "bg-slate-800 text-slate-100"
                        }`}
                      >
                        <p className="whitespace-pre-wrap break-words">{m.body}</p>
                        <p className={`text-[10px] mt-1 ${mine ? "text-white/70" : "text-slate-400"}`}>
                          {relativeTime(m.created_at)}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="p-3 border-t border-white/5 flex items-end gap-2">
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    if (!sending && draft.trim()) void sendMessage();
                  }
                }}
                placeholder="Write a reply…"
                rows={1}
                className="flex-1 resize-none rounded-lg border border-white/10 bg-slate-900/60 text-slate-100 placeholder:text-slate-500 px-3 py-2 focus:outline-none focus:ring-1 focus:ring-cyan-500 max-h-32"
              />
              <button
                type="button"
                disabled={sending || !draft.trim()}
                onClick={() => void sendMessage()}
                className="rounded-lg bg-gradient-to-r from-violet-600 to-cyan-600 text-white font-semibold px-4 py-2 hover:opacity-90 disabled:opacity-50 inline-flex items-center gap-2 shrink-0"
              >
                {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                <span className="hidden sm:inline">Send</span>
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
