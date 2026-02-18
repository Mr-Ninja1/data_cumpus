"use client";
import React, { useEffect, useState } from "react";
import { supabase } from "@/utils/supabaseClient";
import Auth from "./Auth";

export default function AuthGate() {
  const [session, setSession] = useState<any>(null);
  const [dismissed, setDismissed] = useState<boolean>(false);

  useEffect(() => {
    const key = localStorage.getItem("auth_dismissed");
    if (key === "true") setDismissed(true);

    let mounted = true;
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!mounted) return;
      setSession(data.session ?? null);
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session ?? null);
      if (session) {
        // if user signs in after dismissing, we can clear the dismissed flag
        localStorage.removeItem("auth_dismissed");
        setDismissed(false);
      }
    });

    return () => sub?.subscription.unsubscribe();
  }, []);

  const handleContinue = () => {
    localStorage.setItem("auth_dismissed", "true");
    setDismissed(true);
  };

  if (session || dismissed) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="max-w-md w-full">
        <div className="relative">
          <Auth />
          <div className="mt-3 text-center">
            <button onClick={handleContinue} className="text-sm text-gray-200 underline">
              Continue without signing in
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
