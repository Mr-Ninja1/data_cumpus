/**
 * Ephemeral chat media via private Supabase Storage bucket `chat-media`.
 * Objects are claimed into IndexedDB then removed from Storage.
 */

import { supabase } from "@/utils/supabaseClient";
import { compressImage } from "@/utils/compressImage";

export const CHAT_MEDIA_BUCKET = "chat-media";

export function chatMediaFolder(userA: string, userB: string): string {
  return userA < userB ? `${userA}/${userB}` : `${userB}/${userA}`;
}

export function chatMediaPath(userA: string, userB: string, messageId: string, ext = "webp"): string {
  return `${chatMediaFolder(userA, userB)}/${messageId}.${ext}`;
}

export async function uploadChatImage(opts: {
  senderId: string;
  recipientId: string;
  messageId: string;
  file: Blob | File;
}): Promise<{ path: string; mime: string; file: File }> {
  const compressed = await compressImage(opts.file, `chat-${opts.messageId}.jpg`);
  const ext = compressed.type.includes("webp")
    ? "webp"
    : compressed.type.includes("png")
      ? "png"
      : "jpg";
  const path = chatMediaPath(opts.senderId, opts.recipientId, opts.messageId, ext);
  const { error } = await supabase.storage
    .from(CHAT_MEDIA_BUCKET)
    .upload(path, compressed, {
      contentType: compressed.type || "image/webp",
      upsert: true,
    });
  if (error) throw error;
  return { path, mime: compressed.type || "image/webp", file: compressed };
}

export async function downloadChatMedia(path: string): Promise<Blob> {
  const { data, error } = await supabase.storage.from(CHAT_MEDIA_BUCKET).download(path);
  if (error || !data) throw error || new Error("Download failed");
  return data;
}

export async function deleteChatMedia(path: string): Promise<void> {
  const { error } = await supabase.storage.from(CHAT_MEDIA_BUCKET).remove([path]);
  if (error) console.warn("chatMedia.delete:", error.message);
}

export function isPhotoPreview(text: string): boolean {
  return text === "📷 Photo" || text === "Photo";
}
