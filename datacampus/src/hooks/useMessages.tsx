"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/utils/supabaseClient";
import { conversationKey } from "@/utils/roles";
import { showToast } from "@/utils/toast";
import { canUseSocialFeatures, openVerifyPrompt } from "@/utils/verificationGate";
import {
  deleteLocalMessage,
  deleteOutboxItem,
  getLocalMessage,
  getMediaBlob,
  listLocalMessages,
  listOutbox,
  markLocalRead,
  putLocalMessage,
  putLocalMessages,
  putMediaBlob,
  putOutboxItem,
  type LocalMessage,
  type OutboxItem,
} from "@/utils/localMessageStore";
import { messagePreview } from "@/utils/messagePreview";
import {
  deleteChatMedia,
  downloadChatMedia,
  uploadChatImage,
} from "@/utils/chatMedia";

export type ReplyToRef = {
  id: string;
  preview: string;
  sender_id: string | null;
};

/** Eye status for outgoing messages */
export type DeliverySight = "pending" | "sent" | "delivered" | "seen" | "failed";

/** Kept for callers; own messages can always be deleted for everyone (WhatsApp-style unsend). */
export const DELETE_FOR_EVERYONE_MS = Number.POSITIVE_INFINITY;

export type MediaMeta = {
  path?: string;
  mime?: string;
  local_id?: string;
  w?: number;
  h?: number;
};

export function deliverySightOf(m: {
  read?: boolean | null;
  metadata?: Record<string, unknown> | null;
}): DeliverySight {
  if (m.metadata?.failed) return "failed";
  if (m.metadata?.pending) return "pending";
  if (m.read || typeof m.metadata?.seen_at === "string") return "seen";
  if (
    m.metadata?.body_cleared ||
    m.metadata?.delivered ||
    typeof m.metadata?.delivered_at === "string"
  ) {
    return "delivered";
  }
  return "sent";
}

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
  pending: boolean;
  failed: boolean;
  mine: boolean;
};

type RemoteEnvelope = {
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
  body_cleared_at?: string | null;
};

type ReactionsMap = Record<string, string[]>;

function isEphemeralDm(kind: string) {
  return kind === "dm" || !kind;
}

function isDeletedForEveryone(metadata?: Record<string, unknown> | null) {
  return Boolean(metadata?.deleted_for_everyone);
}

function isHiddenForMe(metadata?: Record<string, unknown> | null) {
  return Boolean(metadata?.hidden_for_me);
}

export function canDeleteForEveryone(m: {
  read?: boolean | null;
  created_at: string;
  metadata?: Record<string, unknown> | null;
}): boolean {
  // Any own message can be unsent; ownership is enforced in deleteForEveryone.
  if (isDeletedForEveryone(m.metadata)) return false;
  return true;
}

export function mediaFrom(metadata?: Record<string, unknown> | null): MediaMeta | null {
  const raw = metadata?.media;
  if (!raw || typeof raw !== "object") return null;
  const m = raw as Record<string, unknown>;
  const path = typeof m.path === "string" ? m.path : undefined;
  const mime = typeof m.mime === "string" ? m.mime : undefined;
  const local_id = typeof m.local_id === "string" ? m.local_id : undefined;
  const w = typeof m.w === "number" ? m.w : undefined;
  const h = typeof m.h === "number" ? m.h : undefined;
  if (!path && !local_id) return null;
  return { path, mime, local_id, w, h };
}

export function reactionsFrom(metadata?: Record<string, unknown> | null): ReactionsMap {
  const raw = metadata?.reactions;
  if (!raw || typeof raw !== "object") return {};
  const out: ReactionsMap = {};
  for (const [emoji, users] of Object.entries(raw as Record<string, unknown>)) {
    if (Array.isArray(users)) {
      out[emoji] = users.filter((u): u is string => typeof u === "string");
    }
  }
  return out;
}

function previewOf(m: {
  body?: string | null;
  subject?: string | null;
  metadata?: Record<string, unknown> | null;
}) {
  if (isDeletedForEveryone(m.metadata)) return "This message was deleted";
  const media = mediaFrom(m.metadata);
  if (media && !(m.body || "").trim()) return "📷 Photo";
  const metaPreview = typeof m.metadata?.preview === "string" ? m.metadata.preview : "";
  return (m.body || metaPreview || m.subject || "").toString();
}

function envelopeToLocal(ownerId: string, m: RemoteEnvelope, body: string): LocalMessage {
  const key =
    m.conversation_key ||
    (m.sender_id && m.recipient_id
      ? conversationKey(m.sender_id, m.recipient_id)
      : m.id);
  const deleted = isDeletedForEveryone(m.metadata);
  const hasMedia = Boolean(mediaFrom(m.metadata));
  return {
    id: m.id,
    owner_id: ownerId,
    recipient_id: m.recipient_id,
    sender_id: m.sender_id,
    subject: m.subject,
    body: deleted ? "" : body,
    read: Boolean(m.read),
    kind: m.kind || "dm",
    conversation_key: key,
    metadata: {
      ...(m.metadata || {}),
      preview: deleted
        ? "This message was deleted"
        : messagePreview(body || (hasMedia ? "📷 Photo" : "")),
      local_first: true,
      pending: false,
      failed: false,
    },
    created_at: m.created_at,
  };
}

function localToRow(m: LocalMessage, uid: string, nameMap: Record<string, string>): MessageRow {
  const peerId = m.sender_id === uid ? m.recipient_id : m.sender_id || m.recipient_id;
  return {
    id: m.id,
    recipient_id: m.recipient_id,
    sender_id: m.sender_id,
    subject: m.subject,
    body: m.body,
    read: m.read,
    kind: m.kind,
    conversation_key: m.conversation_key,
    metadata: m.metadata,
    created_at: m.created_at,
    peer_id: peerId,
    peer_name: nameMap[peerId] || (m.kind === "support" || m.kind === "staff" ? "Support" : "User"),
  };
}

function newMessageId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function conversationKeyOf(m: {
  id: string;
  sender_id: string | null;
  recipient_id: string;
  conversation_key?: string | null;
}) {
  return (
    m.conversation_key ||
    (m.sender_id && m.recipient_id ? conversationKey(m.sender_id, m.recipient_id) : m.id)
  );
}

async function broadcastDmEvent(targetUserId: string, event: string, payload: Record<string, unknown>) {
  const channel = supabase.channel(`dm-sync:${targetUserId}`, {
    config: { broadcast: { self: false } },
  });

  try {
    await new Promise<void>((resolve, reject) => {
      const timer = window.setTimeout(() => reject(new Error("Broadcast subscribe timeout")), 2500);
      channel.subscribe((status) => {
        if (status === "SUBSCRIBED") {
          clearTimeout(timer);
          resolve();
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          clearTimeout(timer);
          reject(new Error(`Broadcast unavailable: ${status}`));
        }
      });
    });

    await channel.send({
      type: "broadcast",
      event,
      payload,
    });
  } finally {
    void supabase.removeChannel(channel);
  }
}

export function useMessages() {
  const [userId, setUserId] = useState<string | null>(null);
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const flushing = useRef(false);
  const userIdRef = useRef<string | null>(null);
  const syncChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const rebuildUi = useCallback(
    async (uid: string, local: LocalMessage[], remote: RemoteEnvelope[]) => {
      const byId = new Map<string, MessageRow>();

      const clearMap = new Map<string, string>();
      try {
        const { data: clears } = await supabase
          .from("conversation_clears")
          .select("conversation_key, cleared_before")
          .eq("user_id", uid);
        for (const c of clears || []) {
          clearMap.set(c.conversation_key, c.cleared_before);
        }
      } catch {
        /* table may not exist yet */
      }

      const peerIds = new Set<string>();
      for (const m of local) {
        const peer = m.sender_id === uid ? m.recipient_id : m.sender_id;
        if (peer) peerIds.add(peer);
      }
      for (const m of remote) {
        const peer = m.sender_id === uid ? m.recipient_id : m.sender_id;
        if (peer) peerIds.add(peer);
      }

      const nameMap: Record<string, string> = {};
      if (peerIds.size) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, display_name")
          .in("id", [...peerIds]);
        for (const p of profiles || []) {
          nameMap[p.id] = p.display_name || "User";
        }
      }

      for (const m of local) {
        if (isHiddenForMe(m.metadata)) continue;
        const row = localToRow(m, uid, nameMap);
        if (isDeletedForEveryone(m.metadata)) {
          row.body = null;
        }
        byId.set(m.id, row);
      }

      for (const m of remote) {
        if (byId.has(m.id)) {
          const existing = byId.get(m.id)!;
          if (isHiddenForMe(existing.metadata)) continue;
          if (isDeletedForEveryone(m.metadata)) {
            existing.body = null;
            existing.metadata = {
              ...(existing.metadata || {}),
              ...(m.metadata || {}),
              deleted_for_everyone: true,
              preview: "This message was deleted",
              pending: false,
              failed: false,
            };
          } else {
            const keepPending = Boolean(existing.metadata?.pending || existing.metadata?.failed);
            const keepLocalMedia = mediaFrom(existing.metadata);
            const remoteReactions = reactionsFrom(m.metadata);
            const localReactions = reactionsFrom(existing.metadata);
            const mergedReactions = { ...localReactions };
            for (const [emoji, users] of Object.entries(remoteReactions)) {
              const set = new Set([...(mergedReactions[emoji] || []), ...users]);
              mergedReactions[emoji] = [...set];
            }
            existing.read = Boolean(m.read) || Boolean(existing.read);
            const remoteMedia = mediaFrom(m.metadata);
            const nextMedia =
              remoteMedia || keepLocalMedia
                ? {
                    ...(remoteMedia || {}),
                    ...(keepLocalMedia?.local_id ? { local_id: keepLocalMedia.local_id } : {}),
                  }
                : undefined;
            const localReply = (existing.metadata as Record<string, unknown> | null)?.reply_to;
            const remoteReply = (m.metadata as Record<string, unknown> | null)?.reply_to;
            existing.metadata = {
              ...(existing.metadata || {}),
              ...(m.metadata || {}),
              reactions: mergedReactions,
              pending: keepPending ? existing.metadata?.pending : false,
              failed: keepPending ? existing.metadata?.failed : false,
              reply_to: localReply || remoteReply,
              ...(nextMedia ? { media: nextMedia } : { media: undefined }),
            };
            if (!existing.body && m.body) {
              existing.body = m.body;
            }
          }
          continue;
        }
        if (isHiddenForMe(m.metadata)) continue;
        const peerId = m.sender_id === uid ? m.recipient_id : m.sender_id || m.recipient_id;
        byId.set(m.id, {
          ...m,
          body: isDeletedForEveryone(m.metadata) ? null : m.body || previewOf(m) || null,
          peer_id: peerId,
          peer_name: nameMap[peerId] || (m.kind === "support" ? "Support" : "User"),
        });
      }

      const allRows = [...byId.values()];
      const enriched = allRows
        .filter((m) => {
          if (m.kind === "request") return false;
          if (isHiddenForMe(m.metadata)) return false;
          const key = conversationKeyOf(m);
          const clearedBefore = clearMap.get(key);
          if (clearedBefore && m.created_at < clearedBefore) return false;
          return true;
        })
        .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));

      setMessages(enriched);
      setUnreadCount(enriched.filter((m) => m.recipient_id === uid && !m.read).length);

      const map = new Map<string, ConversationSummary>();
      for (const m of enriched) {
        const key = conversationKeyOf(m);
        const peerId = m.peer_id || "";
        const existing = map.get(key);
        if (!existing) {
          map.set(key, {
            key,
            peerId,
            peerName: m.peer_name || "User",
            lastBody: previewOf(m),
            lastAt: m.created_at,
            unread: m.recipient_id === uid && !m.read ? 1 : 0,
            kind: m.kind || "dm",
            pending: Boolean(m.metadata?.pending),
            failed: Boolean(m.metadata?.failed),
            mine: m.sender_id === uid,
          });
        } else if (m.recipient_id === uid && !m.read) {
          existing.unread += 1;
        }
      }
      setConversations([...map.values()].sort((a, b) => (a.lastAt < b.lastAt ? 1 : -1)));
    },
    []
  );

  const softRebuildFromLocal = useCallback(
    async (uid: string) => {
      const local = await listLocalMessages(uid);
      await rebuildUi(uid, local, []);
    },
    [rebuildUi]
  );

  const claimMediaForLocal = useCallback(
    async (uid: string, local: LocalMessage): Promise<LocalMessage> => {
      const media = mediaFrom(local.metadata);
      if (!media?.path) return local;

      if (media.local_id) {
        const existingBlob = await getMediaBlob(media.local_id);
        if (existingBlob) return local;
      }

      try {
        const blob = await downloadChatMedia(media.path);
        const localId = newMessageId();
        await putMediaBlob({
          id: localId,
          owner_id: uid,
          mime: media.mime || blob.type || "image/webp",
          blob,
          created_at: new Date().toISOString(),
        });
        const next: LocalMessage = {
          ...local,
          metadata: {
            ...(local.metadata || {}),
            media: { ...media, local_id: localId },
          },
        };
        await putLocalMessage(next);
        // Recipient can drop the temp Storage object after local claim
        if (local.recipient_id === uid) {
          await deleteChatMedia(media.path);
        }
        return next;
      } catch (e) {
        console.warn("claim media:", e);
        return local;
      }
    },
    []
  );

  /** Pull cloud envelopes → IndexedDB, then strip DM bodies from Postgres. */
  const claimAndMerge = useCallback(
    async (uid: string) => {
      const { data, error } = await supabase
        .from("messages")
        .select(
          "id, recipient_id, sender_id, subject, body, read, kind, conversation_key, metadata, created_at"
        )
        .or(`recipient_id.eq.${uid},sender_id.eq.${uid}`)
        .order("created_at", { ascending: false })
        .limit(120);

      if (error) {
        console.warn("messages envelopes:", error.message);
        const localOnly = await listLocalMessages(uid);
        await rebuildUi(uid, localOnly, []);
        return;
      }

      const remote = (data || []) as RemoteEnvelope[];
      const pendingLocal: LocalMessage[] = [];
      const deliveredAcks: Array<{ id: string; senderId: string; deliveredAt: string }> = [];
      const purgeIds: string[] = [];

      for (const m of remote) {
        if (isDeletedForEveryone(m.metadata)) {
          pendingLocal.push(envelopeToLocal(uid, m, ""));
          if (m.recipient_id === uid) {
            purgeIds.push(m.id);
          }
          continue;
        }
        const fullBody = (m.body || "").trim();
        const hasMediaPath = Boolean(mediaFrom(m.metadata)?.path);
        if (fullBody || hasMediaPath) {
          const existing = await getLocalMessage(m.id);
          const base = envelopeToLocal(uid, m, fullBody || existing?.body || "");
          // Preserve local-only flags / local media id
          if (existing?.metadata) {
            base.metadata = {
              ...base.metadata,
              hidden_for_me: existing.metadata.hidden_for_me,
              media: {
                ...(mediaFrom(base.metadata) || {}),
                ...(mediaFrom(existing.metadata)?.local_id
                  ? { local_id: mediaFrom(existing.metadata)!.local_id }
                  : {}),
              },
              reactions: {
                ...reactionsFrom(existing.metadata),
                ...reactionsFrom(m.metadata),
              },
            };
          }
          const withMedia = await claimMediaForLocal(uid, base);
          pendingLocal.push(withMedia);
          const claimedMedia = !hasMediaPath || Boolean(mediaFrom(withMedia.metadata)?.local_id);
          if (m.recipient_id === uid && isEphemeralDm(m.kind || "dm") && (fullBody || claimedMedia)) {
            deliveredAcks.push({
              id: m.id,
              senderId: m.sender_id || "",
              deliveredAt: new Date().toISOString(),
            });
            purgeIds.push(m.id);
          }
        } else {
          // Body already claimed / cleared — still sync receipts, delete signals, reply_to, reactions.
          const existing = await getLocalMessage(m.id);
          if (existing) {
            const remoteMeta = (m.metadata || {}) as Record<string, unknown>;
            const localMeta = (existing.metadata || {}) as Record<string, unknown>;
            const remoteMedia = mediaFrom(remoteMeta);
            const localMedia = mediaFrom(localMeta);
            pendingLocal.push({
              ...existing,
              read: Boolean(m.read) || existing.read,
              body: isDeletedForEveryone(m.metadata) ? "" : existing.body,
              metadata: {
                ...localMeta,
                ...remoteMeta,
                hidden_for_me: localMeta.hidden_for_me,
                pending: false,
                failed: false,
                reply_to: localMeta.reply_to || remoteMeta.reply_to,
                reactions: {
                  ...reactionsFrom(localMeta),
                  ...reactionsFrom(remoteMeta),
                },
                media:
                  remoteMedia || localMedia
                    ? {
                        ...(remoteMedia || {}),
                        ...(localMedia?.local_id ? { local_id: localMedia.local_id } : {}),
                      }
                    : undefined,
              },
            });
          }
        }
      }

      if (pendingLocal.length) await putLocalMessages(pendingLocal);

      for (const ack of deliveredAcks) {
        if (!ack.senderId) continue;
        try {
          await broadcastDmEvent(ack.senderId, "delivered", {
            messageId: ack.id,
            deliveredAt: ack.deliveredAt,
          });
        } catch (e) {
          console.warn("deliver ack:", e);
        }
      }

      for (const id of purgeIds) {
        const { error: purgeErr } = await supabase.from("messages").delete().eq("id", id);
        if (purgeErr) {
          console.warn("purge delete signal:", purgeErr.message);
        }
      }

      const local = await listLocalMessages(uid);
      const { data: after } = await supabase
        .from("messages")
        .select(
          "id, recipient_id, sender_id, subject, body, read, kind, conversation_key, metadata, created_at"
        )
        .or(`recipient_id.eq.${uid},sender_id.eq.${uid}`)
        .order("created_at", { ascending: false })
        .limit(120);

      await rebuildUi(uid, local, (after || remote) as RemoteEnvelope[]);
    },
    [rebuildUi, claimMediaForLocal]
  );

  const refresh = useCallback(
    async (uid: string | null) => {
      if (!uid) {
        setMessages([]);
        setConversations([]);
        setUnreadCount(0);
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        await claimAndMerge(uid);
      } finally {
        setLoading(false);
      }
    },
    [claimAndMerge]
  );

  const deliverOutboxItem = useCallback(
    async (uid: string, item: OutboxItem): Promise<boolean> => {
      let mediaPath = item.media_path;
      let mediaMime = item.media_mime;
      let localMediaId = item.media_blob_id;

      try {
        if (item.media_blob_id && !mediaPath) {
          const blobRow = await getMediaBlob(item.media_blob_id);
          if (!blobRow) throw new Error("Local image missing");
          const uploaded = await uploadChatImage({
            senderId: uid,
            recipientId: item.recipient_id,
            messageId: item.id,
            file: blobRow.blob,
          });
          mediaPath = uploaded.path;
          mediaMime = uploaded.mime;
          localMediaId = item.media_blob_id;
          await putOutboxItem({
            ...item,
            media_path: mediaPath,
            media_mime: mediaMime,
          });
        }

        const caption = item.body.trim();
        const hasMedia = Boolean(mediaPath);
        const bodyText = caption || (hasMedia ? "📷 Photo" : "");
        if (!bodyText && !hasMedia) {
          await deleteOutboxItem(item.id);
          return true;
        }

        const preview = messagePreview(bodyText || "📷 Photo");
        const metadata: Record<string, unknown> = {
          preview,
          local_first: true,
          ...(item.reply_to ? { reply_to: item.reply_to } : {}),
          ...(mediaPath
            ? {
                media: {
                  path: mediaPath,
                  mime: mediaMime || "image/webp",
                },
              }
            : {}),
        };

        const { data, error } = await supabase
          .from("messages")
          .insert({
            id: item.id,
            sender_id: uid,
            recipient_id: item.recipient_id,
            body: bodyText.slice(0, 4000),
            subject: item.subject,
            kind: item.kind,
            conversation_key: item.conversation_key,
            read: false,
            metadata,
          })
          .select(
            "id, recipient_id, sender_id, subject, body, read, kind, conversation_key, metadata, created_at"
          )
          .single();

        if (error) {
          // Conflict: already inserted (retry after partial success)
          if (error.code === "23505" || /duplicate|already exists/i.test(error.message)) {
            await deleteOutboxItem(item.id);
            const existing = await getLocalMessage(item.id);
            if (existing) {
              await putLocalMessage({
                ...existing,
                metadata: {
                  ...(existing.metadata || {}),
                  pending: false,
                  failed: false,
                },
              });
            }
            return true;
          }
          throw error;
        }

        const row = data as RemoteEnvelope;
        const localBody = caption || (hasMedia ? "" : bodyText);
        await putLocalMessage({
          ...envelopeToLocal(uid, row, localBody),
          metadata: {
            ...envelopeToLocal(uid, row, localBody).metadata,
            media: mediaPath
              ? {
                  path: mediaPath,
                  mime: mediaMime || "image/webp",
                  ...(localMediaId ? { local_id: localMediaId } : {}),
                }
              : undefined,
            pending: false,
            failed: false,
          },
        });
        await deleteOutboxItem(item.id);
        return true;
      } catch (e) {
        const message = e instanceof Error ? e.message : "Send failed";
        await putOutboxItem({
          ...item,
          attempts: item.attempts + 1,
          last_error: message,
          media_path: mediaPath,
          media_mime: mediaMime,
        });
        const existing = await getLocalMessage(item.id);
        if (existing) {
          await putLocalMessage({
            ...existing,
            metadata: {
              ...(existing.metadata || {}),
              pending: false,
              failed: true,
              last_error: message,
            },
          });
        }
        return false;
      }
    },
    []
  );

  const flushOutbox = useCallback(
    async (uid: string | null) => {
      if (!uid || flushing.current) return;
      flushing.current = true;
      try {
        const items = await listOutbox(uid);
        for (const item of items) {
          await deliverOutboxItem(uid, item);
        }
        if (items.length) {
          await softRebuildFromLocal(uid);
          // Also sync remote receipts without blocking UI hard
          void claimAndMerge(uid);
        }
      } finally {
        flushing.current = false;
      }
    },
    [deliverOutboxItem, softRebuildFromLocal, claimAndMerge]
  );

  const applySyncToLocal = useCallback(
    async (
      uid: string,
      messageIds: string[],
      mutate: (row: LocalMessage) => LocalMessage,
      refreshAfter = true
    ) => {
      let changed = false;
      for (const id of messageIds) {
        const row = await getLocalMessage(id);
        if (!row) continue;
        await putLocalMessage(mutate(row));
        changed = true;
      }
      if (changed && refreshAfter) {
        await softRebuildFromLocal(uid);
      }
      return changed;
    },
    [softRebuildFromLocal]
  );

  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!mounted) return;
      const uid = data.session?.user?.id ?? null;
      userIdRef.current = uid;
      setUserId(uid);
      await refresh(uid);
      await flushOutbox(uid);
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      const uid = session?.user?.id ?? null;
      userIdRef.current = uid;
      setUserId(uid);
      void refresh(uid).then(() => flushOutbox(uid));
    });

    const onOnline = () => {
      void flushOutbox(userIdRef.current);
    };
    window.addEventListener("online", onOnline);

    return () => {
      mounted = false;
      sub?.subscription.unsubscribe();
      window.removeEventListener("online", onOnline);
    };
  }, [refresh, flushOutbox]);

  useEffect(() => {
    if (!userId) return;

    const sync = supabase.channel(`dm-sync:${userId}`, {
      config: { broadcast: { self: false } },
    });

    sync
      .on("broadcast", { event: "delivered" }, ({ payload }) => {
        const messageId = typeof (payload as { messageId?: unknown }).messageId === "string"
          ? (payload as { messageId: string }).messageId
          : null;
        const deliveredAt = typeof (payload as { deliveredAt?: unknown }).deliveredAt === "string"
          ? (payload as { deliveredAt: string }).deliveredAt
          : new Date().toISOString();
        if (!messageId) return;
        void applySyncToLocal(userId, [messageId], (row) => ({
          ...row,
          metadata: {
            ...(row.metadata || {}),
            pending: false,
            failed: false,
            delivered: true,
            delivered_at: deliveredAt,
            body_cleared: true,
          },
        }));
      })
      .on("broadcast", { event: "seen" }, ({ payload }) => {
        const messageIds = Array.isArray((payload as { messageIds?: unknown }).messageIds)
          ? ((payload as { messageIds: unknown[] }).messageIds.filter(
              (id): id is string => typeof id === "string"
            ))
          : [];
        const seenAt = typeof (payload as { seenAt?: unknown }).seenAt === "string"
          ? (payload as { seenAt: string }).seenAt
          : new Date().toISOString();
        if (!messageIds.length) return;
        void applySyncToLocal(userId, messageIds, (row) => ({
          ...row,
          read: true,
          metadata: {
            ...(row.metadata || {}),
            pending: false,
            failed: false,
            delivered: true,
            delivered_at:
              typeof row.metadata?.delivered_at === "string" ? row.metadata.delivered_at : seenAt,
            seen_at: seenAt,
          },
        }));
      })
      .on("broadcast", { event: "reaction" }, ({ payload }) => {
        const messageId = typeof (payload as { messageId?: unknown }).messageId === "string"
          ? (payload as { messageId: string }).messageId
          : null;
        const emoji = typeof (payload as { emoji?: unknown }).emoji === "string"
          ? (payload as { emoji: string }).emoji
          : null;
        const actorId = typeof (payload as { actorId?: unknown }).actorId === "string"
          ? (payload as { actorId: string }).actorId
          : null;
        const active = Boolean((payload as { active?: unknown }).active);
        if (!messageId || !emoji || !actorId) return;
        void applySyncToLocal(userId, [messageId], (row) => {
          const nextReactions = reactionsFrom(row.metadata);
          const set = new Set(nextReactions[emoji] || []);
          if (active) set.add(actorId);
          else set.delete(actorId);
          if (set.size) nextReactions[emoji] = [...set];
          else delete nextReactions[emoji];
          return {
            ...row,
            metadata: {
              ...(row.metadata || {}),
              reactions: nextReactions,
            },
          };
        });
      })
      .on("broadcast", { event: "delete" }, ({ payload }) => {
        const messageId = typeof (payload as { messageId?: unknown }).messageId === "string"
          ? (payload as { messageId: string }).messageId
          : null;
        const deletedAt = typeof (payload as { deletedAt?: unknown }).deletedAt === "string"
          ? (payload as { deletedAt: string }).deletedAt
          : new Date().toISOString();
        const deletedBy = typeof (payload as { deletedBy?: unknown }).deletedBy === "string"
          ? (payload as { deletedBy: string }).deletedBy
          : null;
        if (!messageId) return;
        void applySyncToLocal(userId, [messageId], (row) => ({
          ...row,
          body: "",
          metadata: {
            ...(row.metadata || {}),
            preview: "This message was deleted",
            deleted_for_everyone: true,
            deleted_at: deletedAt,
            deleted_by: deletedBy,
          },
        }));
      })
      .subscribe();

    syncChannelRef.current = sync;

    const channel = supabase
      .channel(`dm-envelopes-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `recipient_id=eq.${userId}`,
        },
        () => {
          void refresh(userId);
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "messages",
        },
        () => {
          void refresh(userId);
        }
      )
      .subscribe();

    return () => {
      syncChannelRef.current = null;
      void supabase.removeChannel(sync);
      void supabase.removeChannel(channel);
    };
  }, [userId, refresh, applySyncToLocal]);

  const ensureCanSend = async (uid: string, recipientId: string) => {
    const { data: profile } = await supabase
      .from("profiles")
      .select("is_verified, verification_status, role")
      .eq("id", uid)
      .maybeSingle();
    const verified =
      Boolean(profile?.is_verified) || profile?.verification_status === "verified";
    if (!canUseSocialFeatures(verified, profile?.role)) {
      showToast("info", "Verify your student status to send messages");
      openVerifyPrompt("message");
      return false;
    }
    if (recipientId === uid) {
      showToast("error", "Cannot message yourself");
      return false;
    }
    const { data: blockRow } = await supabase
      .from("blocks")
      .select("id")
      .or(
        `and(blocker_id.eq.${uid},blocked_id.eq.${recipientId}),and(blocker_id.eq.${recipientId},blocked_id.eq.${uid})`
      )
      .maybeSingle();
    if (blockRow) {
      showToast("error", "Cannot message this user");
      return false;
    }
    return true;
  };

  const send = async (opts: {
    recipientId: string;
    body: string;
    subject?: string;
    kind?: "dm" | "support" | "staff";
    replyTo?: ReplyToRef | null;
    image?: File | Blob | null;
    skipPreflight?: boolean;
  }) => {
    if (!userId) {
      showToast("info", "Sign in to send messages");
      return null;
    }

    const trimmed = (opts.body || "").trim();
    const hasImage = Boolean(opts.image);
    if (!trimmed && !hasImage) return null;

    if (!opts.skipPreflight) {
      const allowed = await ensureCanSend(userId, opts.recipientId);
      if (!allowed) return null;
    } else if (opts.recipientId === userId) {
      showToast("error", "Cannot message yourself");
      return null;
    }

    const id = newMessageId();
    const kind = opts.kind || "dm";
    const key = conversationKey(userId, opts.recipientId);
    const createdAt = new Date().toISOString();
    const replyTo = opts.replyTo
      ? {
          id: opts.replyTo.id,
          preview: messagePreview(opts.replyTo.preview || "").slice(0, 120),
          sender_id: opts.replyTo.sender_id,
        }
      : null;

    let mediaBlobId: string | null = null;
    if (opts.image) {
      mediaBlobId = newMessageId();
      await putMediaBlob({
        id: mediaBlobId,
        owner_id: userId,
        mime: opts.image.type || "image/jpeg",
        blob: opts.image,
        created_at: createdAt,
      });
    }

    const preview = messagePreview(trimmed || "📷 Photo");
    const local: LocalMessage = {
      id,
      owner_id: userId,
      recipient_id: opts.recipientId,
      sender_id: userId,
      subject: opts.subject?.trim().slice(0, 120) || null,
      body: trimmed,
      read: false,
      kind,
      conversation_key: key,
      metadata: {
        preview,
        local_first: true,
        pending: true,
        failed: false,
        ...(replyTo ? { reply_to: replyTo } : {}),
        ...(mediaBlobId
          ? { media: { local_id: mediaBlobId, mime: opts.image?.type || "image/jpeg" } }
          : {}),
      },
      created_at: createdAt,
    };

    await putLocalMessage(local);
    await putOutboxItem({
      id,
      owner_id: userId,
      recipient_id: opts.recipientId,
      body: trimmed,
      subject: local.subject,
      kind,
      conversation_key: key,
      reply_to: replyTo,
      media_blob_id: mediaBlobId,
      media_path: null,
      media_mime: opts.image?.type || null,
      created_at: createdAt,
      attempts: 0,
      last_error: null,
    });

    await softRebuildFromLocal(userId);
    void flushOutbox(userId);
    return localToRow(local, userId, {});
  };

  const retryFailed = async (messageId: string) => {
    if (!userId) return false;
    const local = await getLocalMessage(messageId);
    if (!local || local.sender_id !== userId) return false;
    const media = mediaFrom(local.metadata);
    await putLocalMessage({
      ...local,
      metadata: {
        ...(local.metadata || {}),
        pending: true,
        failed: false,
      },
    });
    await putOutboxItem({
      id: local.id,
      owner_id: userId,
      recipient_id: local.recipient_id,
      body: local.body || "",
      subject: local.subject,
      kind: local.kind,
      conversation_key: local.conversation_key,
      reply_to: (() => {
        const raw = local.metadata?.reply_to;
        if (!raw || typeof raw !== "object") return null;
        const r = raw as Record<string, unknown>;
        if (typeof r.id !== "string") return null;
        return {
          id: r.id,
          preview: typeof r.preview === "string" ? r.preview : "",
          sender_id: typeof r.sender_id === "string" ? r.sender_id : null,
        };
      })(),
      media_blob_id: media?.local_id || null,
      media_path: media?.path || null,
      media_mime: media?.mime || null,
      created_at: local.created_at,
      attempts: 0,
      last_error: null,
    });
    await softRebuildFromLocal(userId);
    await flushOutbox(userId);
    return true;
  };

  const markConversationRead = async (peerId: string) => {
    if (!userId) return;
    const seenAt = new Date().toISOString();
    const thread = (await listLocalMessages(userId)).filter(
      (m) => m.recipient_id === userId && m.sender_id === peerId && !m.read
    );

    await markLocalRead(userId, peerId);

    if (thread.length) {
      try {
        await broadcastDmEvent(peerId, "seen", {
          messageIds: thread.map((m) => m.id),
          seenAt,
        });
      } catch (e) {
        console.warn("seen ack:", e);
      }
    }

    const { data: unread } = await supabase
      .from("messages")
      .select("id, metadata, kind")
      .eq("recipient_id", userId)
      .eq("sender_id", peerId)
      .eq("read", false);

    for (const row of unread || []) {
      if (isEphemeralDm(row.kind || "dm")) continue;
      const meta = {
        ...((row.metadata as Record<string, unknown>) || {}),
        delivered: true,
        delivered_at:
          typeof (row.metadata as Record<string, unknown>)?.delivered_at === "string"
            ? (row.metadata as Record<string, unknown>).delivered_at
            : seenAt,
        seen_at: seenAt,
      };
      await supabase
        .from("messages")
        .update({ read: true, metadata: meta })
        .eq("id", row.id)
        .eq("recipient_id", userId);
    }
    await softRebuildFromLocal(userId);
    void refresh(userId);
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

  const clearThread = async (peerId: string) => {
    if (!userId) return;
    const key = conversationKey(userId, peerId);
    const { error } = await supabase
      .from("conversation_clears")
      .upsert(
        { user_id: userId, conversation_key: key, cleared_before: new Date().toISOString() },
        { onConflict: "user_id,conversation_key" }
      );
    if (error) {
      showToast(
        "error",
        error.message.includes("conversation_clears")
          ? "Run social_economy_v3.sql in Supabase first"
          : "Could not clear chat"
      );
      return;
    }
    showToast("success", "Chat cleared");
    await refresh(userId);
  };

  /** Hide a single message on this device only. */
  const deleteForMe = async (messageId: string) => {
    if (!userId) return false;
    const local = await getLocalMessage(messageId);
    if (!local || local.owner_id !== userId) {
      // Still hide from UI if only in remote merge
      const row = messages.find((m) => m.id === messageId);
      if (!row) return false;
      await putLocalMessage({
        id: row.id,
        owner_id: userId,
        recipient_id: row.recipient_id,
        sender_id: row.sender_id,
        subject: row.subject,
        body: row.body || "",
        read: Boolean(row.read),
        kind: row.kind,
        conversation_key:
          row.conversation_key ||
          conversationKey(row.sender_id || userId, row.recipient_id),
        metadata: {
          ...(row.metadata || {}),
          hidden_for_me: true,
        },
        created_at: row.created_at,
      });
    } else {
      await putLocalMessage({
        ...local,
        metadata: {
          ...(local.metadata || {}),
          hidden_for_me: true,
        },
      });
    }
    await softRebuildFromLocal(userId);
    return true;
  };

  const deleteForEveryone = async (messageId: string) => {
    if (!userId) return false;
    const row = messages.find((m) => m.id === messageId);
    if (!row || row.sender_id !== userId) {
      showToast("error", "You can only delete your own messages");
      return false;
    }
    if (isDeletedForEveryone(row.metadata)) return true;

    // Pending/failed: remove locally + outbox, never hit cloud
    if (row.metadata?.pending || row.metadata?.failed) {
      await deleteOutboxItem(messageId);
      await deleteLocalMessage(messageId);
      const media = mediaFrom(row.metadata);
      if (media?.local_id) {
        // keep blob cleanup optional
      }
      await softRebuildFromLocal(userId);
      return true;
    }

    const deletedAt = new Date().toISOString();
    const nextMeta = {
      ...(row.metadata || {}),
      preview: "This message was deleted",
      deleted_for_everyone: true,
      deleted_at: deletedAt,
      deleted_by: userId,
      local_first: true,
      ephemeral: true,
      pending: false,
      failed: false,
    };

    await putLocalMessage(
      envelopeToLocal(
        userId,
        {
          id: row.id,
          recipient_id: row.recipient_id,
          sender_id: row.sender_id,
          subject: row.subject,
          body: null,
          read: row.read,
          kind: row.kind,
          conversation_key: row.conversation_key,
          metadata: nextMeta,
          created_at: row.created_at,
        },
        ""
      )
    );

    const media = mediaFrom(row.metadata);
    if (media?.path) {
      await deleteChatMedia(media.path);
    }

    if (isEphemeralDm(row.kind || "dm")) {
      try {
        await broadcastDmEvent(row.recipient_id, "delete", {
          messageId,
          deletedAt,
          deletedBy: userId,
        });
      } catch (e) {
        console.warn("delete sync:", e);
      }
    }

    const { error } = await supabase
      .from("messages")
      .update({
        body: null,
        metadata: nextMeta,
      })
      .eq("id", messageId)
      .eq("sender_id", userId);

    if (error && !isEphemeralDm(row.kind || "dm")) {
      showToast(
        "error",
        error.message.includes("policy") || error.message.includes("permission")
          ? "Run supabase/messages_dm_actions.sql in Supabase first"
          : error.message
      );
      return false;
    }

    await softRebuildFromLocal(userId);
    return true;
  };

  const toggleReaction = async (messageId: string, emoji: string) => {
    if (!userId) return false;
    const local = (await getLocalMessage(messageId)) || null;
    const row = messages.find((m) => m.id === messageId);
    if (!local && !row) return false;

    const base: LocalMessage =
      local ||
      ({
        id: row!.id,
        owner_id: userId,
        recipient_id: row!.recipient_id,
        sender_id: row!.sender_id,
        subject: row!.subject,
        body: row!.body || "",
        read: Boolean(row!.read),
        kind: row!.kind,
        conversation_key:
          row!.conversation_key ||
          conversationKey(row!.sender_id || userId, row!.recipient_id),
        metadata: row!.metadata,
        created_at: row!.created_at,
      } as LocalMessage);

    const current = reactionsFrom(base.metadata);
    const users = new Set(current[emoji] || []);
    if (users.has(userId)) users.delete(userId);
    else users.add(userId);
    if (users.size) current[emoji] = [...users];
    else delete current[emoji];

    const nextMeta = {
      ...(base.metadata || {}),
      reactions: current,
      local_first: true,
    };
    await putLocalMessage({ ...base, metadata: nextMeta });
    await softRebuildFromLocal(userId);

    if (!base.metadata?.pending && !base.metadata?.failed) {
      const peerId = base.sender_id === userId ? base.recipient_id : base.sender_id;
      if (peerId && isEphemeralDm(base.kind || "dm")) {
        try {
          await broadcastDmEvent(peerId, "reaction", {
            messageId,
            emoji,
            actorId: userId,
            active: users.has(userId),
          });
        } catch (e) {
          console.warn("reaction sync:", e);
        }
      } else {
        const { data: cloud } = await supabase
          .from("messages")
          .select("id, metadata")
          .eq("id", messageId)
          .maybeSingle();
        if (cloud) {
          const cloudReactions = reactionsFrom(cloud.metadata as Record<string, unknown>);
          const merged = { ...cloudReactions };
          const set = new Set(merged[emoji] || []);
          if (users.has(userId)) set.add(userId);
          else set.delete(userId);
          if (set.size) merged[emoji] = [...set];
          else delete merged[emoji];
          await supabase
            .from("messages")
            .update({
              metadata: {
                ...((cloud.metadata as Record<string, unknown>) || {}),
                reactions: merged,
              },
            })
            .eq("id", messageId);
        }
      }
    }
    return true;
  };

  return {
    userId,
    messages,
    conversations,
    unreadCount,
    loading,
    send,
    retryFailed,
    markConversationRead,
    threadWith,
    clearThread,
    deleteForEveryone,
    deleteForMe,
    toggleReaction,
    getMediaBlob,
    refresh: () => refresh(userId),
  };
}

export default useMessages;
