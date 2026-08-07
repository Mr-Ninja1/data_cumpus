"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/utils/supabaseClient";

export type NotificationRow = {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  link: string | null;
  is_read: boolean;
  created_at: string;
};

export function useNotifications() {
  const [userId, setUserId] = useState<string | null>(null);
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async (uid: string | null) => {
    if (!uid) {
      setNotifications([]);
      setUnreadCount(0);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from("notifications")
      .select("id, kind, title, body, link, is_read, created_at")
      .eq("user_id", uid)
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) {
      console.warn("notifications:", error.message);
      setNotifications([]);
      setUnreadCount(0);
    } else {
      const rows = (data || []) as NotificationRow[];
      setNotifications(rows);
      setUnreadCount(rows.filter((n) => !n.is_read).length);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!mounted) return;
      const uid = data.session?.user?.id ?? null;
      setUserId(uid);
      await refresh(uid);
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      const uid = session?.user?.id ?? null;
      setUserId(uid);
      void refresh(uid);
    });

    return () => {
      mounted = false;
      sub?.subscription.unsubscribe();
    };
  }, [refresh]);

  const markRead = async (id: string) => {
    if (!userId) return;
    const { error } = await supabase
      .from("notifications")
      .update({ is_read: true })
      .eq("id", id)
      .eq("user_id", userId);
    if (error) return;
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, is_read: true } : n))
    );
    setUnreadCount((c) => Math.max(0, c - 1));
  };

  const markAllRead = async () => {
    if (!userId) return;
    const { error } = await supabase
      .from("notifications")
      .update({ is_read: true })
      .eq("user_id", userId)
      .eq("is_read", false);
    if (error) return;
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    setUnreadCount(0);
  };

  return {
    userId,
    notifications,
    unreadCount,
    loading,
    markRead,
    markAllRead,
    refresh: () => refresh(userId),
  };
}

export default useNotifications;
