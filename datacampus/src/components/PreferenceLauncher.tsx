"use client";
import React, { useEffect, useState, useRef } from "react";
import PreferenceModal from "./PreferenceModal";
import Auth from "./Auth";
import { supabase } from "@/utils/supabaseClient";

export default function PreferenceLauncher() {
  const [showPref, setShowPref] = useState(false);
  const [showPrompt, setShowPrompt] = useState(false);
  const [showAuth, setShowAuth] = useState(false);
  const intervalRefRef = useRef<number | null>(null);

  useEffect(() => {
    let mounted = true;
    const intervalRef = intervalRefRef.current;
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!mounted) return;
      const hasLocal = Boolean(localStorage.getItem("dc:preferences"));
      const session = data.session ?? null;
      const hasAccountPrefs = Boolean(session?.user?.user_metadata?.preferences);

      // Show prompt only when there are no local prefs and no account prefs
      if (!hasLocal && !hasAccountPrefs) {
        setShowPrompt(true);
        // schedule showing the preference modal every 1 minute until prefs exist
        if (!intervalRefRef.current) {
          intervalRefRef.current = window.setInterval(() => {
            try {
              const hasLocalNow = Boolean(localStorage.getItem("dc:preferences"));
              if (!hasLocalNow) setShowPref(true);
            } catch (e) {
              // ignore
            }
          }, 60 * 1000);
        }
      }
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((_ev, s) => {
      const session = s ?? null;
      const hasAccountPrefs = Boolean(session?.user?.user_metadata?.preferences);
      if (hasAccountPrefs) {
        // stop re-prompting
        if (intervalRefRef.current) {
          clearInterval(intervalRefRef.current as number);
          intervalRefRef.current = null;
        }
        setShowPrompt(false);
        setShowPref(false);
      }
    });

    return () => {
      mounted = false;
      sub?.subscription.unsubscribe();
      if (intervalRefRef.current) {
        clearInterval(intervalRefRef.current as number);
        intervalRefRef.current = null;
      }
    };
  }, []);

  // Called when user chooses "continue without login" from prompt
  const onContinueWithoutLogin = () => {
    setShowPrompt(false);
    setShowPref(true);
  };

  // Called after PreferenceModal saves locally
  const handleSavedLocal = () => {
    // stop the periodic re-open since preferences now exist locally
    if (intervalRefRef.current) {
      clearInterval(intervalRefRef.current as number);
      intervalRefRef.current = null;
    }
    // show the login prompt so user can optionally sign in to persist
    setShowPrompt(true);
  };

  return (
    <>
      {/* Sign-in prompt shown before preferences */}
      {showPrompt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md bg-white dark:bg-gray-900 p-6 rounded shadow text-center">
            <h3 className="text-lg font-semibold mb-2">Welcome — personalize your experience</h3>
            <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">Sign in to save your preferences to your account, or continue without signing in.</p>
            <div className="flex gap-3 justify-center">
              <button className="px-4 py-2 bg-blue-600 text-white rounded" onClick={() => { setShowAuth(true); setShowPrompt(false); }}>Sign in</button>
              <button className="px-4 py-2 bg-gray-200 text-gray-900 rounded border border-gray-300 hover:bg-gray-100 dark:bg-gray-700 dark:text-white dark:border-gray-600" onClick={onContinueWithoutLogin}>Continue without login</button>
            </div>
          </div>
        </div>
      )}

      {/* Auth modal (simple) */}
      {showAuth && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md bg-white dark:bg-gray-900 p-6 rounded shadow">
            <div className="flex justify-between items-start">
              <h3 className="text-lg font-semibold">Sign in</h3>
              <button className="text-sm text-gray-500" onClick={() => setShowAuth(false)}>Close</button>
            </div>
            <div className="mt-4">
              <Auth />
            </div>
          </div>
        </div>
      )}

      <PreferenceModal visible={showPref} onClose={() => setShowPref(false)} onSavedLocal={handleSavedLocal} />
    </>
  );
}
