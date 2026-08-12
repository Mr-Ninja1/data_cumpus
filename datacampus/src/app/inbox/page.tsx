"use client";

import React, { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Bell,
  CheckCheck,
  Headphones,
  Loader2,
  MessageSquare,
  Shield,
} from "lucide-react";
import { supabase } from "@/utils/supabaseClient";
import { useNotifications } from "@/hooks/useNotifications";
import { useMessages } from "@/hooks/useMessages";
import { useChatSocial } from "@/hooks/useChatSocial";
import { useProfile } from "@/hooks/useProfile";
import Auth from "@/components/Auth";
import LoadingSkeleton from "@/components/LoadingSkeleton";
import MessagesExperience from "@/components/MessagesExperience";
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

function tabFromParam(value: string | null, peer: string | null, requests: boolean): Tab {
  if (value === "messages" || peer || requests) return "messages";
  return "activity";
}

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
  const focusPeer = searchParams.get("peer");
  const focusRequests =
    searchParams.get("requests") === "1" || searchParams.get("tab") === "requests";
  const initialTab = tabFromParam(searchParams.get("tab"), focusPeer, focusRequests);
  const [tab, setTab] = useState<Tab>(initialTab);
  const [session, setSession] = useState<any>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const { isStaff } = useProfile();
  const { notifications, unreadCount, loading, markRead, markAllRead } = useNotifications();
  const { unreadCount: msgUnread, refresh: refreshMsgs } = useMessages();
  const { incoming } = useChatSocial();

  const [supportOpen, setSupportOpen] = useState(false);
  const [supportBody, setSupportBody] = useState("");
  const [supportSending, setSupportSending] = useState(false);
  const [chatOpen, setChatOpen] = useState(Boolean(focusPeer));

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
    const requests =
      searchParams.get("requests") === "1" || searchParams.get("tab") === "requests";
    setTab(tabFromParam(searchParams.get("tab"), searchParams.get("peer"), requests));
    setChatOpen(Boolean(searchParams.get("peer")));
    // Legacy ?tab=requests → messages + requests sheet
    if (searchParams.get("tab") === "requests") {
      router.replace("/inbox?tab=messages&requests=1", { scroll: false });
    }
  }, [searchParams, router]);

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
      <div className="mx-auto max-w-md px-3 py-8">
        <h1 className="mb-4 text-center text-2xl font-bold">Inbox</h1>
        <p className="mb-6 text-center text-sm text-gray-500">
          Sign in to see activity and messages.
        </p>
        <Auth />
      </div>
    );
  }

  return (
    <div className={`mx-auto px-3 pt-4 md:px-0 md:pt-0 ${tab === "messages" ? "max-w-[100rem]" : "max-w-2xl"}`}>
      {isStaff && (
        <div
          className={`mb-4 flex w-full flex-col items-start justify-between gap-3 rounded-2xl border border-amber-200 bg-gradient-to-r from-amber-50 to-yellow-50 p-4 dark:border-amber-800/50 dark:from-amber-950/30 dark:to-yellow-950/20 sm:flex-row sm:items-center ${
            tab === "messages" && chatOpen ? "hidden xl:flex" : ""
          }`}
        >
          <div className="flex min-w-0 items-start gap-2.5">
            <Shield className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
            <p className="text-sm text-amber-900 dark:text-amber-200">
              You have staff tools — moderation reports, pending uploads, and the staff inbox live in the Control Center.
            </p>
          </div>
          <button
            type="button"
            onClick={() => router.push("/admin/moderation")}
            className="inline-flex w-full shrink-0 items-center justify-center gap-1.5 rounded-full bg-gradient-to-r from-amber-400 to-yellow-500 px-3.5 py-2 text-sm font-bold text-slate-950 shadow-md shadow-amber-500/30 transition-shadow hover:shadow-amber-500/50 sm:w-auto"
          >
            Open Control Center →
          </button>
        </div>
      )}
      <div
        className={`mb-4 flex items-center justify-between gap-3 ${
          tab === "messages" && chatOpen ? "hidden xl:flex" : ""
        }`}
      >
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Inbox</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Activity alerts and direct messages
          </p>
        </div>
        {(msgUnread > 0 || unreadCount > 0 || incoming.length > 0) && (
          <div className="flex flex-wrap justify-end gap-1.5">
            {msgUnread > 0 && (
              <span className="rounded-full bg-[#25D366] px-2.5 py-1 text-[11px] font-bold text-white">
                {msgUnread} DM{msgUnread === 1 ? "" : "s"}
              </span>
            )}
            {unreadCount > 0 && (
              <span className="rounded-full bg-indigo-600 px-2.5 py-1 text-[11px] font-bold text-white">
                {unreadCount} alert{unreadCount === 1 ? "" : "s"}
              </span>
            )}
            {incoming.length > 0 && (
              <span className="rounded-full bg-amber-500 px-2.5 py-1 text-[11px] font-bold text-white">
                {incoming.length} request{incoming.length === 1 ? "" : "s"}
              </span>
            )}
          </div>
        )}
      </div>

      <div
        className={`mb-5 flex gap-2 overflow-x-auto pb-1 ${
          tab === "messages" && chatOpen ? "hidden xl:flex" : ""
        }`}
      >
        <button
          type="button"
          onClick={() => {
            setTab("activity");
            router.replace("/inbox");
          }}
          className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium ${
            tab === "activity"
              ? "bg-indigo-600 text-white"
              : "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300"
          }`}
        >
          <Bell className="h-4 w-4" />
          Activity
          {unreadCount > 0 && (
            <span className={`rounded-full px-1.5 text-[10px] font-bold ${tab === "activity" ? "bg-white/20" : "bg-red-600 text-white"}`}>
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={() => {
            setTab("messages");
            router.replace("/inbox?tab=messages");
          }}
          className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium ${
            tab === "messages"
              ? "bg-indigo-600 text-white"
              : "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300"
          }`}
        >
          <MessageSquare className="h-4 w-4" />
          Messages
          {(msgUnread > 0 || incoming.length > 0) && (
            <span className={`rounded-full px-1.5 text-[10px] font-bold ${tab === "messages" ? "bg-white/20" : "bg-[#25D366] text-white"}`}>
              {msgUnread + incoming.length > 9 ? "9+" : msgUnread + incoming.length}
            </span>
          )}
        </button>
      </div>

      {tab === "activity" ? (
        <>
          <div className="mb-3 flex justify-end">
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={() => void markAllRead()}
                className="inline-flex items-center gap-1.5 rounded-lg bg-gray-100 px-3 py-2 text-sm font-medium dark:bg-gray-800"
              >
                <CheckCheck className="h-4 w-4" />
                Mark all read
              </button>
            )}
          </div>
          {loading ? (
            <LoadingSkeleton />
          ) : notifications.length === 0 ? (
            <Empty
              icon={<Bell className="h-10 w-10" />}
              title="No activity yet"
              hint="Follows, comments, and staff alerts show up here."
            />
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
                    className={`w-full rounded-xl border p-4 text-left transition-colors ${
                      n.is_read
                        ? "border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900"
                        : "border-indigo-200 bg-indigo-50 dark:border-indigo-900 dark:bg-indigo-950/30"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{n.title}</p>
                        {n.body && (
                          <p className="mt-0.5 line-clamp-2 text-sm text-gray-600 dark:text-gray-400">
                            {n.body}
                          </p>
                        )}
                        <p className="mt-1 text-xs text-gray-400">{relativeTime(n.created_at)}</p>
                      </div>
                      {!n.is_read && (
                        <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-indigo-600" />
                      )}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      ) : (
        <MessagesExperience
          focusPeerId={focusPeer}
          focusRequests={focusRequests}
          onOpenSupport={() => setSupportOpen(true)}
          onConversationChange={setChatOpen}
        />
      )}

      {supportOpen && (
        <div className="fixed inset-0 z-[80] flex items-end justify-center p-0 sm:items-center sm:p-4">
          <button
            type="button"
            className="absolute inset-0 bg-black/50"
            aria-label="Close"
            onClick={() => setSupportOpen(false)}
          />
          <div className="relative w-full rounded-t-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900 sm:max-w-md sm:rounded-2xl">
            <h3 className="mb-1 flex items-center gap-2 text-lg font-semibold">
              <Headphones className="h-5 w-5 text-indigo-600" />
              Contact support
            </h3>
            <p className="mb-4 text-sm text-gray-500">
              Message the DataCampus team. Replies land in your Messages tab.
            </p>
            <textarea
              value={supportBody}
              onChange={(e) => setSupportBody(e.target.value)}
              rows={4}
              maxLength={4000}
              placeholder="How can we help?"
              className="mb-4 w-full resize-none rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-800"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setSupportOpen(false)}
                className="flex-1 rounded-xl bg-gray-100 py-2.5 text-sm font-medium dark:bg-gray-800"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={supportSending || !supportBody.trim()}
                onClick={() => void contactSupport()}
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-indigo-600 py-2.5 text-sm font-medium text-white disabled:opacity-50"
              >
                {supportSending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
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
    <div className="py-16 text-center text-gray-500 dark:text-gray-400">
      <div className="mx-auto mb-3 flex justify-center opacity-40">{icon}</div>
      <p className="font-medium text-gray-700 dark:text-gray-300">{title}</p>
      <p className="mt-2 text-sm">{hint}</p>
    </div>
  );
}
