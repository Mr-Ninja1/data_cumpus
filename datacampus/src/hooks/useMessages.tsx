"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/utils/supabaseClient";
import { conversationKey } from "@/utils/roles";
import { showToast } from "@/utils/toast";

export type MessageRow = {
  id: string;
  recipient_id: string;
  sender_id: string | null;
  subject: string | null;
  body: string | null;
  read: boolean | null;
  kind: string;
  conversation_key: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  peer_name?: string;
  peer_id?: string;
};

export type ConversationSummary = {
  key: string;
  peerId: string;
  peerName: string;
  lastBody: string;
  lastAt: string;
  unread: number;
  kind: string;
};

export function useMessages() {
  const [userId, setUserId] = useState<string | null>(null);
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async (uid: string | null) => {
    if (!uid) {
      setMessages([]);
      setConversations([]);
      setUnreadCount(0);
      setLoading(false);
      return;
    }
    setLoading(true);

    const { data, error } = await supabase
      .from("messages")
      .select("id, recipient_id, sender_id, subject, body, read, kind, conversation_key, metadata, created_at")
      .or(`recipient_id.eq.${uid},sender_id.eq.${uid}`)
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) {
      console.warn("messages:", error.message);
      setMessages([]);
      setConversations([]);
      setUnreadCount(0);
      setLoading(false);
      return;
    }

    const rows = (data || []) as MessageRow[];
    const peerIds = [
      ...new Set(
        rows
          .map((m) => (m.sender_id === uid ? m.recipient_id : m.sender_id))
          .filter(Boolean) as string[]
      ),
    ];

    const nameMap: Record<string, string> = {};
    if (peerIds.length) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, display_name")
        .in("id", peerIds);
      for (const p of profiles || []) {
        nameMap[p.id] = p.display_name || "User";
      }
    }

    const enriched = rows.map((m) => {
      const peerId = m.sender_id === uid ? m.recipient_id : m.sender_id || m.recipient_id;
      return {
        ...m,
        peer_id: peerId,
        peer_name: nameMap[peerId] || (m.kind === "support" ? "Support" : "User"),
      };
    });

    setMessages(enriched);
    setUnreadCount(enriched.filter((m) => m.recipient_id === uid && !m.read).length);

    const map = new Map<string, ConversationSummary>();
    for (const m of enriched) {
      const key =
        m.conversation_key ||
        (m.sender_id && m.recipient_id
          ? conversationKey(m.sender_id, m.recipient_id)
          : m.id);
      const peerId = m.peer_id || "";
      const existing = map.get(key);
      if (!existing) {
        map.set(key, {
          key,
          peerId,
          peerName: m.peer_name || "User",
          lastBody: m.body || m.subject || "",
          lastAt: m.created_at,
          unread: m.recipient_id === uid && !m.read ? 1 : 0,
          kind: m.kind || "dm",
        });
      } else if (m.recipient_id === uid && !m.read) {
        existing.unread += 1;
      }
    }
    setConversations([...map.values()].sort((a, b) => (a.lastAt < b.lastAt ? 1 : -1)));
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

  const send = async (opts: {
    recipientId: string;
    body: string;
    subject?: string;
    kind?: "dm" | "support" | "staff";
  }) => {
    if (!userId) {
      showToast("info", "Sign in to send messages");
      return null;
    }
    const trimmed = opts.body.trim();
    if (!trimmed) return null;
    if (opts.recipientId === userId) {
      showToast("error", "Cannot message yourself");
      return null;
    }

    const key = conversationKey(userId, opts.recipientId);
    const { data, error } = await supabase
      .from("messages")
      .insert({
        sender_id: userId,
        recipient_id: opts.recipientId,
        body: trimmed.slice(0, 4000),
        subject: opts.subject?.trim().slice(0, 120) || null,
        kind: opts.kind || "dm",
        conversation_key: key,
        read: false,
        metadata: {},
      })
      .select("id, recipient_id, sender_id, subject, body, read, kind, conversation_key, metadata, created_at")
      .single();

    if (error) {
      showToast(
        "error",
        error.message.includes("messages")
          ? "Run messages_foundation.sql in Supabase first"
          : error.message
      );
      return null;
    }

    await refresh(userId);
    showToast("success", "Message sent");
    return data as MessageRow;
  };

  const markConversationRead = async (peerId: string) => {
    if (!userId) return;
    await supabase
      .from("messages")
      .update({ read: true })
      .eq("recipient_id", userId)
      .eq("sender_id", peerId)
      .eq("read", false);
    await refresh(userId);
  };

  const threadWith = (peerId: string) =>
    messages
      .filter(
        (m) =>
          (m.sender_id === peerId && m.recipient_id === userId) ||
          (m.sender_id === userId && m.recipient_id === peerId)
      )
      .slice()
      .reverse();

  return {
    userId,
    messages,
    conversations,
    unreadCount,
    loading,
    send,
    markConversationRead,
    threadWith,
    refresh: () => refresh(userId),
  };
}

export default useMessages;
