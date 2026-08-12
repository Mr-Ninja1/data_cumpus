/** Client-side verification gate helpers for social / creator actions. */

import { isStaffRole } from "@/utils/staff";

export type VerifyAction =
  | "like"
  | "follow"
  | "comment"
  | "message"
  | "upload"
  | "general";

export const VERIFY_REQUIRED_EVENT = "dc:verify-required";
export const VERIFY_DISMISS_KEY = "dc:verify_prompt_dismissed";

export function openVerifyPrompt(action: VerifyAction = "general") {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(VERIFY_REQUIRED_EVENT, { detail: { action } })
  );
}

export function actionLabel(action: VerifyAction): string {
  switch (action) {
    case "like":
      return "like papers";
    case "follow":
      return "follow channels";
    case "comment":
      return "comment";
    case "message":
      return "send messages";
    case "upload":
      return "upload materials";
    default:
      return "use this feature";
  }
}

export function wasVerifyPromptDismissed(): boolean {
  try {
    return localStorage.getItem(VERIFY_DISMISS_KEY) === "true";
  } catch {
    return false;
  }
}

export function dismissVerifyPrompt() {
  try {
    localStorage.setItem(VERIFY_DISMISS_KEY, "true");
  } catch {
    // ignore
  }
}

export function clearVerifyPromptDismiss() {
  try {
    localStorage.removeItem(VERIFY_DISMISS_KEY);
  } catch {
    // ignore
  }
}

/** Staff accounts bypass student verification (dev + admin workflows). */
export function canUseSocialFeatures(
  isVerified: boolean,
  role?: string | null
): boolean {
  return isVerified || isStaffRole(role || "user");
}
