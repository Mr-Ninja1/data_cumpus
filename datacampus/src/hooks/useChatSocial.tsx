"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/utils/supabaseClient";
import { showToast } from "@/utils/toast";
import { openVerifyPrompt } from "@/utils/verificationGate";

export type ChatRequestRow = {
  id: string;
  kind: string;
  from_user_id: string;
  to_user_id: string;
  message: string | null;
  status: string;
  created_at: string;
  peerId: string;
  peerName: string;
  peerStudentId: string | null;
  peerVerified: boolean;
  direction: "incoming" | "outgoing";
};

export type ContactHit = {
  id: string;
  name: string;
  studentId: string | null;
  program: string | null;
  verified: boolean;
  isStaff: boolean;
};

export type AdminContact = {
  id: string;
  name: string;
  role: string;
  studentId: string | null;
} | null;

async function authHeaders() {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) return null;
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

export function useChatSocial() {
  const [incoming, setIncoming] = useState<ChatRequestRow[]>([]);
  const [outgoing, setOutgoing] = useState<ChatRequestRow[]>([]);
  const [acceptedPeerIds, setAcceptedPeerIds] = useState<Set<string>>(new Set());
  const [admin, setAdmin] = useState<AdminContact>(null);
  const [adminLabel, setAdminLabel] = useState("Campus Admin");
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const headers = await authHeaders();
    if (!headers) {
      setIncoming([]);
      setOutgoing([]);
      setAcceptedPeerIds(new Set());
      setAdmin(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [reqRes, adminRes] = await Promise.all([
        fetch("/api/chat/requests", { headers, cache: "no-store" }),
        fetch("/api/contacts/admin", { headers, cache: "no-store" }),
      ]);
      const reqJson = await reqRes.json().catch(() => ({}));
      const adminJson = await adminRes.json().catch(() => ({}));

      setIncoming(reqJson.incoming || []);
      setOutgoing(reqJson.outgoing || []);
      const accepted = new Set<string>();
      for (const r of (reqJson.all || []) as ChatRequestRow[]) {
        if (r.status === "accepted" && r.peerId) accepted.add(r.peerId);
      }
      setAcceptedPeerIds(accepted);

      setAdmin(adminJson.admin || null);
      setAdminLabel(adminJson.label || "Campus Admin");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const searchContacts = async (q: string): Promise<ContactHit[]> => {
    const headers = await authHeaders();
    if (!headers) return [];
    const res = await fetch(`/api/contacts/search?q=${encodeURIComponent(q)}`, {
      headers,
      cache: "no-store",
    });
    const json = await res.json().catch(() => ({}));
    return (json.contacts || []) as ContactHit[];
  };

  const sendRequest = async (toUserId: string, message: string, kind: "dm" | "group" = "dm") => {
    const headers = await authHeaders();
    if (!headers) {
      showToast("info", "Sign in to send a chat request");
      return null;
    }
    const res = await fetch("/api/chat/requests", {
      method: "POST",
      headers,
      body: JSON.stringify({ toUserId, message, kind }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (json.code === "VERIFY") openVerifyPrompt("message");
      showToast("error", json.error || "Could not send request");
      return null;
    }
    if (json.alreadyAccepted) {
      showToast("success", "You can already chat with this student");
      await refresh();
      return { alreadyAccepted: true as const, peerId: toUserId };
    }
    showToast("success", "Chat request sent");
    await refresh();
    return { request: json.request, peerId: toUserId };
  };

  const respondDetailed = async (id: string, action: "accept" | "decline" | "cancel") => {
    const headers = await authHeaders();
    if (!headers) return null;
    const target = [...incoming, ...outgoing].find((r) => r.id === id) || null;
    const res = await fetch(`/api/chat/requests/${id}/respond`, {
      method: "POST",
      headers,
      body: JSON.stringify({ action }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      showToast("error", json.error || "Could not update request");
      return null;
    }

    if (action === "accept" && target?.peerId) {
      setAcceptedPeerIds((prev) => new Set([...prev, target.peerId]));
    }
    setIncoming((prev) => prev.filter((r) => r.id !== id));
    setOutgoing((prev) => prev.map((r) => (r.id === id ? { ...r, status: json.status || action } : r)));

    showToast(
      "success",
      action === "accept" ? "Chat opened" : action === "decline" ? "Request declined" : "Request cancelled"
    );
    void refresh();
    return {
      ok: true as const,
      status: (json.status || action) as string,
      peerId: (json.peerId as string | undefined) || target?.peerId || null,
    };
  };

  const respond = async (id: string, action: "accept" | "decline" | "cancel") => {
    const result = await respondDetailed(id, action);
    return Boolean(result?.ok);
  };

  const canMessagePeer = (peerId: string, opts?: { isAdmin?: boolean; hasThread?: boolean }) => {
    if (opts?.isAdmin) return true;
    if (opts?.hasThread) return true;
    return acceptedPeerIds.has(peerId);
  };

  return {
    incoming,
    outgoing,
    acceptedPeerIds,
    admin,
    adminLabel,
    loading,
    refresh,
    searchContacts,
    sendRequest,
    respond,
    respondDetailed,
    canMessagePeer,
  };
}
