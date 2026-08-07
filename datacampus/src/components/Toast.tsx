"use client";
import React, { useEffect, useState } from "react";
import { Check, AlertCircle, Info, X, Loader2 } from "lucide-react";

export type ToastType = 'success' | 'error' | 'info' | 'loading';

export interface Toast {
  id: string;
  type: ToastType;
  message: string;
  duration?: number;
}

interface ToastProps {
  toast: Toast;
  onRemove: (id: string) => void;
}

const toastIcons = {
  success: Check,
  error: AlertCircle,
  info: Info,
  loading: Loader2,
};

const toastColors = {
  success: 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300',
  error: 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-red-700 dark:text-red-300',
  info: 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300',
  loading: 'bg-indigo-50 dark:bg-indigo-900/20 border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300',
};

function ToastItem({ toast, onRemove }: ToastProps) {
  const [visible, setVisible] = useState(false);
  const Icon = toastIcons[toast.type];

  useEffect(() => {
    setVisible(true);
    const duration = toast.duration ?? 4000;
    if (toast.type !== 'loading') {
      const timer = setTimeout(() => {
        setVisible(false);
        setTimeout(() => onRemove(toast.id), 300);
      }, duration);
      return () => clearTimeout(timer);
    }
  }, [toast, onRemove]);

  return (
    <div
      className={`flex items-center gap-3 p-4 rounded-xl border shadow-lg transition-all duration-300 ${
        toastColors[toast.type]
      } ${visible ? 'translate-x-0 opacity-100' : 'translate-x-full opacity-0'}`}
      role="alert"
    >
      <div className={`flex-shrink-0 ${toast.type === 'loading' ? 'animate-spin' : ''}`}>
        <Icon className="w-5 h-5" />
      </div>
      <p className="flex-1 text-sm font-medium">{toast.message}</p>
      {toast.type !== 'loading' && (
        <button
          onClick={() => {
            setVisible(false);
            setTimeout(() => onRemove(toast.id), 300);
          }}
          className="p-1 hover:opacity-70 transition-opacity"
          aria-label="Close toast"
        >
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}

export default function ToastContainer() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = (type: ToastType, message: string, duration?: number) => {
    const id = Math.random().toString(36).substring(2);
    setToasts((prev) => [...prev, { id, type, message, duration }]);
    return id;
  };

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  // Expose addToast to window for global access
  useEffect(() => {
    (window as any).toast = { addToast, removeToast };
    return () => {
      delete (window as any).toast;
    };
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-50 flex flex-col gap-3 max-w-sm w-full">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onRemove={removeToast} />
      ))}
    </div>
  );
}
