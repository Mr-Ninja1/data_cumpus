/**
 * Device-local chat store (IndexedDB).
 * Full message bodies + media blobs live here; Postgres only keeps thin envelopes / previews.
 */

export type LocalMessage = {
  id: string;
  owner_id: string;
  recipient_id: string;
  sender_id: string | null;
  subject: string | null;
  body: string;
  read: boolean;
  kind: string;
  conversation_key: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

export type MediaBlobRow = {
  id: string;
  owner_id: string;
  mime: string;
  blob: Blob;
  created_at: string;
};

export type OutboxItem = {
  id: string;
  owner_id: string;
  recipient_id: string;
  body: string;
  subject: string | null;
  kind: string;
  conversation_key: string;
  reply_to: {
    id: string;
    preview: string;
    sender_id: string | null;
  } | null;
  media_blob_id: string | null;
  media_path: string | null;
  media_mime: string | null;
  created_at: string;
  attempts: number;
  last_error: string | null;
};

const DB_NAME = "datacampus_chat_v1";
const STORE = "messages";
const MEDIA_STORE = "media_blobs";
const OUTBOX_STORE = "outbox";
const DB_VERSION = 2;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB unavailable"));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: "id" });
        store.createIndex("by_owner", "owner_id", { unique: false });
        store.createIndex("by_owner_key", ["owner_id", "conversation_key"], { unique: false });
        store.createIndex("by_owner_created", ["owner_id", "created_at"], { unique: false });
      }
      if (!db.objectStoreNames.contains(MEDIA_STORE)) {
        const media = db.createObjectStore(MEDIA_STORE, { keyPath: "id" });
        media.createIndex("by_owner", "owner_id", { unique: false });
      }
      if (!db.objectStoreNames.contains(OUTBOX_STORE)) {
        const outbox = db.createObjectStore(OUTBOX_STORE, { keyPath: "id" });
        outbox.createIndex("by_owner", "owner_id", { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error("IndexedDB open failed"));
  });
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error("IndexedDB tx failed"));
    tx.onabort = () => reject(tx.error || new Error("IndexedDB tx aborted"));
  });
}

export async function putLocalMessages(rows: LocalMessage[]): Promise<void> {
  if (!rows.length) return;
  try {
    const db = await openDb();
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    for (const row of rows) store.put(row);
    await txDone(tx);
    db.close();
  } catch (e) {
    console.warn("localMessageStore.put:", e);
  }
}

export async function putLocalMessage(row: LocalMessage): Promise<void> {
  await putLocalMessages([row]);
}

export async function getLocalMessage(id: string): Promise<LocalMessage | null> {
  try {
    const db = await openDb();
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(id);
    const row = await new Promise<LocalMessage | undefined>((resolve, reject) => {
      req.onsuccess = () => resolve(req.result as LocalMessage | undefined);
      req.onerror = () => reject(req.error);
    });
    await txDone(tx);
    db.close();
    return row || null;
  } catch (e) {
    console.warn("localMessageStore.get:", e);
    return null;
  }
}

export async function listLocalMessages(ownerId: string): Promise<LocalMessage[]> {
  try {
    const db = await openDb();
    const tx = db.transaction(STORE, "readonly");
    const idx = tx.objectStore(STORE).index("by_owner");
    const req = idx.getAll(ownerId);
    const rows = await new Promise<LocalMessage[]>((resolve, reject) => {
      req.onsuccess = () => resolve((req.result || []) as LocalMessage[]);
      req.onerror = () => reject(req.error);
    });
    await txDone(tx);
    db.close();
    return rows.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  } catch (e) {
    console.warn("localMessageStore.list:", e);
    return [];
  }
}

export async function listLocalThread(
  ownerId: string,
  conversationKey: string
): Promise<LocalMessage[]> {
  const all = await listLocalMessages(ownerId);
  return all
    .filter((m) => m.conversation_key === conversationKey)
    .sort((a, b) => (a.created_at > b.created_at ? 1 : -1));
}

export async function markLocalRead(
  ownerId: string,
  peerId: string
): Promise<void> {
  const all = await listLocalMessages(ownerId);
  const updates = all.filter(
    (m) => m.recipient_id === ownerId && m.sender_id === peerId && !m.read
  );
  if (!updates.length) return;
  await putLocalMessages(updates.map((m) => ({ ...m, read: true })));
}

export async function deleteLocalMessage(id: string): Promise<void> {
  try {
    const db = await openDb();
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(id);
    await txDone(tx);
    db.close();
  } catch (e) {
    console.warn("localMessageStore.delete:", e);
  }
}

export async function putMediaBlob(row: MediaBlobRow): Promise<void> {
  try {
    const db = await openDb();
    const tx = db.transaction(MEDIA_STORE, "readwrite");
    tx.objectStore(MEDIA_STORE).put(row);
    await txDone(tx);
    db.close();
  } catch (e) {
    console.warn("localMessageStore.putMedia:", e);
  }
}

export async function getMediaBlob(id: string): Promise<MediaBlobRow | null> {
  try {
    const db = await openDb();
    const tx = db.transaction(MEDIA_STORE, "readonly");
    const req = tx.objectStore(MEDIA_STORE).get(id);
    const row = await new Promise<MediaBlobRow | undefined>((resolve, reject) => {
      req.onsuccess = () => resolve(req.result as MediaBlobRow | undefined);
      req.onerror = () => reject(req.error);
    });
    await txDone(tx);
    db.close();
    return row || null;
  } catch (e) {
    console.warn("localMessageStore.getMedia:", e);
    return null;
  }
}

export async function deleteMediaBlob(id: string): Promise<void> {
  try {
    const db = await openDb();
    const tx = db.transaction(MEDIA_STORE, "readwrite");
    tx.objectStore(MEDIA_STORE).delete(id);
    await txDone(tx);
    db.close();
  } catch (e) {
    console.warn("localMessageStore.deleteMedia:", e);
  }
}

export async function putOutboxItem(item: OutboxItem): Promise<void> {
  try {
    const db = await openDb();
    const tx = db.transaction(OUTBOX_STORE, "readwrite");
    tx.objectStore(OUTBOX_STORE).put(item);
    await txDone(tx);
    db.close();
  } catch (e) {
    console.warn("localMessageStore.putOutbox:", e);
  }
}

export async function listOutbox(ownerId: string): Promise<OutboxItem[]> {
  try {
    const db = await openDb();
    const tx = db.transaction(OUTBOX_STORE, "readonly");
    const idx = tx.objectStore(OUTBOX_STORE).index("by_owner");
    const req = idx.getAll(ownerId);
    const rows = await new Promise<OutboxItem[]>((resolve, reject) => {
      req.onsuccess = () => resolve((req.result || []) as OutboxItem[]);
      req.onerror = () => reject(req.error);
    });
    await txDone(tx);
    db.close();
    return rows.sort((a, b) => (a.created_at > b.created_at ? 1 : -1));
  } catch (e) {
    console.warn("localMessageStore.listOutbox:", e);
    return [];
  }
}

export async function deleteOutboxItem(id: string): Promise<void> {
  try {
    const db = await openDb();
    const tx = db.transaction(OUTBOX_STORE, "readwrite");
    tx.objectStore(OUTBOX_STORE).delete(id);
    await txDone(tx);
    db.close();
  } catch (e) {
    console.warn("localMessageStore.deleteOutbox:", e);
  }
}
