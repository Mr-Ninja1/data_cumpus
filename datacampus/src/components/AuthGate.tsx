"use client";
import React, { useEffect, useState } from "react";
import { supabase } from "@/utils/supabaseClient";
import Auth from "./Auth";
import { Loader2, X } from "lucide-react";
import ModalPortal from "./ModalPortal";

export default function AuthGate() {
  const [session, setSession] = useState<any>(null);
  const [dismissed, setDismissed] = useState<boolean>(false);
  const [loading, setLoading] = useState(true);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const key = localStorage.getItem("auth_dismissed");
    if (key === "true") setDismissed(true);

    let mounted = true;
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!mounted) return;
      setSession(data.session ?? null);
      setLoading(false);
      // Trigger fade-in animation after loading
      setTimeout(() => setVisible(true), 50);
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session ?? null);
      if (session) {
        localStorage.removeItem("auth_dismissed");
        setDismissed(false);
      }
    });

    return () => sub?.subscription.unsubscribe();
  }, []);

  const handleContinue = () => {
    setVisible(false);
    setTimeout(() => {
      localStorage.setItem("auth_dismissed", "true");
      setDismissed(true);
    }, 300);
  };

  const handleClose = () => {
    handleContinue();
  };

  if (session || dismissed) return null;

  if (loading) {
    return (
      <ModalPortal>
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4">
          <div className="bg-white dark:bg-gray-900 rounded-2xl p-8 shadow-2xl">
            <div className="flex flex-col items-center gap-4">
              <Loader2 className="w-8 h-8 text-indigo-600 dark:text-indigo-400 animate-spin" />
              <p className="text-gray-600 dark:text-gray-400">Loading...</p>
            </div>
          </div>
        </div>
      </ModalPortal>
    );
  }

  return (
    <ModalPortal>
      <div
        className={`fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm transition-opacity duration-300 ${
          visible ? 'opacity-100' : 'opacity-0'
        }`}
      >
        <div
          className={`max-w-md w-full transition-all duration-300 ${
            visible ? 'scale-100 opacity-100' : 'scale-95 opacity-0'
          }`}
        >
          <div className="relative">
            <button
              onClick={handleClose}
              className="absolute -top-10 right-0 p-2 text-white/80 hover:text-white transition-colors"
              aria-label="Close"
            >
              <X className="w-6 h-6" />
            </button>
            <Auth />
            <div className="mt-4 text-center">
              <button
                onClick={handleContinue}
                className="text-sm text-gray-400 dark:text-gray-500 hover:text-gray-200 dark:hover:text-gray-300 underline transition-colors"
              >
                Continue without signing in
              </button>
            </div>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}
