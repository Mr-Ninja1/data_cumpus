"use client";
import React, { useEffect, useState } from "react";
import Auth from "./Auth";
import { supabase } from "@/utils/supabaseClient";
import ModalPortal from "./ModalPortal";

export default function PreferenceLauncher({
  onDismiss,
}: {
  onDismiss?: () => void;
}) {
  const [showPrompt, setShowPrompt] = useState(false);
  const [showAuth, setShowAuth] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!mounted) return;
      const hasLocal = Boolean(localStorage.getItem("dc:preferences"));
      const session = data.session ?? null;
      const hasAccountPrefs = Boolean(session?.user?.user_metadata?.preferences);

      // Show prompt only when there are no local prefs and no account prefs
      if (!hasLocal && !hasAccountPrefs) {
        setShowPrompt(true);
      } else {
        onDismiss?.();
      }
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((_ev, s) => {
      if (s) {
        setShowPrompt(false);
        setShowAuth(false);
        onDismiss?.();
      }
    });

    return () => {
      mounted = false;
      sub?.subscription.unsubscribe();
    };
  }, [onDismiss]);

  // Called when user chooses "continue without login" from prompt
  const onContinueWithoutLogin = () => {
    setShowPrompt(false);
    onDismiss?.();
  };

  return (
    <>
      {/* Sign-in prompt shown before preferences */}
      {showPrompt && (
        <ModalPortal>
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
            <div className="w-[min(92vw,28rem)] bg-white dark:bg-gray-900 p-6 sm:p-7 rounded-xl shadow-lg text-center border border-gray-200 dark:border-gray-800">
              <h3 className="text-lg font-semibold mb-2">Welcome — personalize your experience</h3>
              <p className="text-sm text-gray-600 dark:text-gray-300 mb-5">
                Sign in to save your preferences to your account, or continue without signing in.
              </p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <button
                  className="w-full sm:w-auto sm:flex-1 px-4 py-2.5 bg-blue-600 text-white rounded-lg font-medium"
                  onClick={() => {
                    setShowAuth(true);
                    setShowPrompt(false);
                  }}
                >
                  Sign in
                </button>
                <button
                  className="w-full sm:w-auto sm:flex-1 px-4 py-2.5 bg-gray-200 text-gray-900 rounded-lg border border-gray-300 hover:bg-gray-100 dark:bg-gray-700 dark:text-white dark:border-gray-600 font-medium"
                  onClick={onContinueWithoutLogin}
                >
                  Continue without login
                </button>
              </div>
            </div>
          </div>
        </ModalPortal>
      )}

      {/* Auth modal (simple) */}
      {showAuth && (
        <ModalPortal>
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
            <div className="w-[min(92vw,28rem)] bg-white dark:bg-gray-900 p-6 sm:p-7 rounded-xl shadow-lg border border-gray-200 dark:border-gray-800">
              <div className="flex justify-between items-start">
                <h3 className="text-lg font-semibold">Sign in</h3>
                <button
                  className="text-sm text-gray-500"
                  onClick={() => {
                    setShowAuth(false);
                    onDismiss?.();
                  }}
                >
                  Close
                </button>
              </div>
              <div className="mt-4">
                <Auth />
              </div>
            </div>
          </div>
        </ModalPortal>
      )}

    </>
  );
}
