"use client";

import React, { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Bell,
  CheckCheck,
  Headphones,
  Loader2,
  MessageSquare,
  Send,
  ArrowLeft,
} from "lucide-react";
import { supabase } from "@/utils/supabaseClient";
import { useNotifications } from "@/hooks/useNotifications";
import { useMessages } from "@/hooks/useMessages";
import Auth from "@/components/Auth";
import LoadingSkeleton from "@/components/LoadingSkeleton";
import { showToast } from "@/utils/toast";

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

type Tab = "activity" | "messages";

export default function InboxPage() {
  return (
    <Suspense fallback={<LoadingSkeleton />}>
      <InboxContent />
    </Suspense>
  );
}

function InboxContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialTab = searchParams.get("tab") === "messages" ? "messages" : "activity";
  const [tab, setTab] = useState<Tab>(initialTab);
  const [session, setSession] = useState<any>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const { notifications, unreadCount, loading, markRead, markAllRead } = useNotifications();
  const {
    userId,
    conversations,
    unreadCount: msgUnread,
    loading: msgLoading,
    send,
    markConversationRead,
    threadWith,
    refresh: refreshMsgs,
  } = useMessages();

  const [activePeer, setActivePeer] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [supportOpen, setSupportOpen] = useState(false);
  const [supportBody, setSupportBody] = useState("");
  const [supportSending, setSupportSending] = useState(false);

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
    const t = searchParams.get("tab") === "messages" ? "messages" : "activity";
    setTab(t);
  }, [searchParams]);

  const thread = useMemo(
    () => (activePeer ? threadWith(activePeer) : []),
    [activePeer, threadWith]
  );

  const activePeerName =
    conversations.find((c) => c.peerId === activePeer)?.peerName || "Conversation";

  const openThread = async (peerId: string) => {
    setActivePeer(peerId);
    await markConversationRead(peerId);
  };

  const sendReply = async () => {
    if (!activePeer || !draft.trim()) return;
    setSending(true);
    await send({ recipientId: activePeer, body: draft });
    setDraft("");
    setSending(false);
  };

  const contactSupport = async () => {
    if (!supportBody.trim()) return;
    const token = session?.access_token;
    if (!token) return;
    setSupportSending(true);
    try {
      const res = await fetch("/api/messages/support", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ body: supportBody, subject: "Support request" }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast("error", json.error || "Could not reach support");
        return;
      }
      showToast("success", "Sent to support — they'll reply in Messages");
      setSupportBody("");
      setSupportOpen(false);
      setTab("messages");
      await refreshMsgs();
    } finally {
      setSupportSending(false);
    }
  };

  if (authLoading) return <LoadingSkeleton />;

  if (!session) {
    return (
      <div className="max-w-md mx-auto py-8 px-3">
        <h1 className="text-2xl font-bold text-center mb-4">Inbox</h1>
        <p className="text-sm text-gray-500 text-center mb-6">
          Sign in to see activity and messages.
        </p>
        <Auth />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-3 pt-4 md:px-0 md:pt-0">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Inbox</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Activity and direct messages in one place
          </p>
        </div>
        {!activePeer && (
          <button
            type="button"
            onClick={() => setSupportOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium bg-indigo-600 text-white hover:bg-indigo-700"
          >
            <Headphones className="w-4 h-4" />
            Support
          </button>
        )}
      </div>

      {!activePeer && (
        <div className="flex gap-2 mb-5">
          <button
            type="button"
            onClick={() => {
              setTab("activity");
              router.replace("/inbox");
            }}
            className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium ${
              tab === "activity"
                ? "bg-indigo-600 text-white"
                : "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300"
            }`}
          >
            <Bell className="w-4 h-4" />
            Activity
            {unreadCount > 0 && (
              <span className="ml-1 text-[10px] bg-white/20 px-1.5 rounded-full">{unreadCount}</span>
            )}
          </button>
          <button
            type="button"
            onClick={() => {
              setTab("messages");
              router.replace("/inbox?tab=messages");
            }}
            className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium ${
              tab === "messages"
                ? "bg-indigo-600 text-white"
                : "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300"
            }`}
          >
            <MessageSquare className="w-4 h-4" />
            Messages
            {msgUnread > 0 && (
              <span className="ml-1 text-[10px] bg-white/20 px-1.5 rounded-full">{msgUnread}</span>
            )}
          </button>
        </div>
      )}

      {tab === "activity" && !activePeer ? (
        <>
          <div className="flex justify-end mb-3">
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={() => void markAllRead()}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium bg-gray-100 dark:bg-gray-800"
              >
                <CheckCheck className="w-4 h-4" />
                Mark all read
              </button>
            )}
          </div>
          {loading ? (
            <LoadingSkeleton />
          ) : notifications.length === 0 ? (
            <Empty icon={<Bell className="w-10 h-10" />} title="No activity yet" hint="Follows, comments, and staff alerts show up here." />
          ) : (
            <ul className="space-y-2">
              {notifications.map((n) => (
                <li key={n.id}>
                  <button
                    type="button"
                    onClick={() => {
                      if (!n.is_read) void markRead(n.id);
                      if (n.link) router.push(n.link);
                    }}
                    className={`w-full text-left p-4 rounded-xl border transition-colors ${
                      n.is_read
                        ? "bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800"
                        : "bg-indigo-50 dark:bg-indigo-950/30 border-indigo-200 dark:border-indigo-900"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-semibold text-gray-900 dark:text-gray-100 text-sm">{n.title}</p>
                        {n.body && (
                          <p className="text-sm text-gray-600 dark:text-gray-400 mt-0.5 line-clamp-2">
                            {n.body}
                          </p>
                        )}
                        <p className="text-xs text-gray-400 mt-1">{relativeTime(n.created_at)}</p>
                      </div>
                      {!n.is_read && (
                        <span className="h-2.5 w-2.5 rounded-full bg-indigo-600 shrink-0 mt-1" />
                      )}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      ) : activePeer ? (
        <div className="flex flex-col min-h-[60vh]">
          <div className="flex items-center gap-2 mb-4">
            <button
              type="button"
              onClick={() => setActivePeer(null)}
              className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h2 className="font-semibold text-gray-900 dark:text-gray-100">{activePeerName}</h2>
              <p className="text-xs text-gray-400">Direct message</p>
            </div>
          </div>

          <div className="flex-1 space-y-3 mb-4 overflow-y-auto max-h-[50vh]">
            {thread.map((m) => {
              const mine = m.sender_id === userId;
              return (
                <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm ${
                      mine
                        ? "bg-indigo-600 text-white rounded-br-md"
                        : "bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-bl-md"
                    }`}
                  >
                    <p className="whitespace-pre-wrap break-words">{m.body}</p>
                    <p className={`text-[10px] mt-1 ${mine ? "text-white/70" : "text-gray-400"}`}>
                      {relativeTime(m.created_at)}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex gap-2 sticky bottom-0 bg-white dark:bg-gray-950 py-2">
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !sending && void sendReply()}
              placeholder="Write a reply…"
              className="flex-1 px-3 py-2.5 rounded-full border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 text-sm"
            />
            <button
              type="button"
              disabled={sending || !draft.trim()}
              onClick={() => void sendReply()}
              className="p-2.5 rounded-full bg-indigo-600 text-white disabled:opacity-50"
            >
              {sending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
            </button>
          </div>
        </div>
      ) : msgLoading ? (
        <LoadingSkeleton />
      ) : conversations.length === 0 ? (
        <Empty
          icon={<MessageSquare className="w-10 h-10" />}
          title="No messages yet"
          hint="Contact support or wait for a staff reply — conversations appear here."
        />
      ) : (
        <ul className="space-y-2">
          {conversations.map((c) => (
            <li key={c.key}>
              <button
                type="button"
                onClick={() => void openThread(c.peerId)}
                className={`w-full text-left p-4 rounded-xl border ${
                  c.unread > 0
                    ? "bg-indigo-50 dark:bg-indigo-950/30 border-indigo-200 dark:border-indigo-900"
                    : "bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-sm text-gray-900 dark:text-gray-100">
                      {c.peerName}
                      {c.kind === "support" || c.kind === "staff" ? (
                        <span className="ml-2 text-[10px] uppercase tracking-wide text-indigo-600">
                          {c.kind}
                        </span>
                      ) : null}
                    </p>
                    <p className="text-sm text-gray-500 dark:text-gray-400 line-clamp-1 mt-0.5">
                      {c.lastBody}
                    </p>
                    <p className="text-xs text-gray-400 mt-1">{relativeTime(c.lastAt)}</p>
                  </div>
                  {c.unread > 0 && (
                    <span className="text-xs font-bold bg-indigo-600 text-white px-1.5 py-0.5 rounded-full">
                      {c.unread}
                    </span>
                  )}
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}

      {supportOpen && (
        <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center p-0 sm:p-4">
          <button
            type="button"
            className="absolute inset-0 bg-black/50"
            aria-label="Close"
            onClick={() => setSupportOpen(false)}
          />
          <div className="relative w-full sm:max-w-md bg-white dark:bg-gray-900 rounded-t-2xl sm:rounded-2xl p-5 border border-gray-200 dark:border-gray-800">
            <h3 className="font-semibold text-lg mb-1">Contact support</h3>
            <p className="text-sm text-gray-500 mb-4">
              Message the DataCampus team. Replies land in your Messages tab.
            </p>
            <textarea
              value={supportBody}
              onChange={(e) => setSupportBody(e.target.value)}
              rows={4}
              maxLength={4000}
              placeholder="How can we help?"
              className="w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm resize-none mb-4"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setSupportOpen(false)}
                className="flex-1 py-2.5 rounded-xl bg-gray-100 dark:bg-gray-800 text-sm font-medium"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={supportSending || !supportBody.trim()}
                onClick={() => void contactSupport()}
                className="flex-1 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-medium disabled:opacity-50 inline-flex items-center justify-center gap-2"
              >
                {supportSending ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                Send
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Empty({
  icon,
  title,
  hint,
}: {
  icon: React.ReactNode;
  title: string;
  hint: string;
}) {
  return (
    <div className="text-center py-16 text-gray-500 dark:text-gray-400">
      <div className="mx-auto mb-3 opacity-40 flex justify-center">{icon}</div>
      <p className="font-medium text-gray-700 dark:text-gray-300">{title}</p>
      <p className="text-sm mt-2">{hint}</p>
    </div>
  );
}
