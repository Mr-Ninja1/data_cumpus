export type ToastType = "success" | "error" | "info" | "loading";

type ToastApi = {
  addToast: (type: ToastType, message: string, duration?: number) => string;
  removeToast: (id: string) => void;
};

export function showToast(type: ToastType, message: string, duration?: number) {
  if (typeof window === "undefined") return;
  const api = (window as unknown as { toast?: ToastApi }).toast;
  if (api?.addToast) {
    return api.addToast(type, message, duration);
  }
  return undefined;
}
