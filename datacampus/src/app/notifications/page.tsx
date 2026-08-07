"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, CheckCheck, Loader2 } from "lucide-react";
import { supabase } from "@/utils/supabaseClient";
import { useNotifications } from "@/hooks/useNotifications";
import Auth from "@/components/Auth";
import LoadingSkeleton from "@/components/LoadingSkeleton";

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

export default function NotificationsPage() {
  const router = useRouter();
  const [session, setSession] = useState<any>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const { notifications, unreadCount, loading, markRead, markAllRead } = useNotifications();

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

  if (authLoading) return <LoadingSkeleton />;

  if (!session) {
    return (
      <div className="max-w-md mx-auto py-8 px-3">
        <h1 className="text-2xl font-bold text-center mb-4">Notifications</h1>
        <p className="text-sm text-gray-500 text-center mb-6">
          Sign in to see updates from channels you follow and your uploads.
        </p>
        <Auth />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-3 pt-4 md:px-0 md:pt-0">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Bell className="text-indigo-600 dark:text-indigo-400" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Inbox</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {unreadCount > 0 ? `${unreadCount} unread` : "You're all caught up"}
            </p>
          </div>
        </div>
        {unreadCount > 0 && (
          <button
            type="button"
            onClick={() => void markAllRead()}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700"
          >
            <CheckCheck className="w-4 h-4" />
            Mark all read
          </button>
        )}
      </div>

      {loading ? (
        <LoadingSkeleton />
      ) : notifications.length === 0 ? (
        <div className="text-center py-16 text-gray-500 dark:text-gray-400">
          <Bell className="w-10 h-10 mx-auto mb-3 opacity-40" />
          <p>No notifications yet</p>
          <p className="text-sm mt-2">Subscribe to uploaders to get notified about new papers.</p>
        </div>
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
                      <p className="text-sm text-gray-600 dark:text-gray-400 mt-0.5 line-clamp-2">{n.body}</p>
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
    </div>
  );
}
