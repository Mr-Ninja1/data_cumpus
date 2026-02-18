"use client";
import React, { useEffect, useState } from "react";
import { supabase } from "@/utils/supabaseClient";

export default function Auth() {
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!mounted) return;
      setUser(data.session?.user ?? null);
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => {
      mounted = false;
      sub?.subscription.unsubscribe();
    };
  }, []);

  const signInWithGoogle = async () => {
    await supabase.auth.signInWithOAuth({ provider: "google" });
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <div className="p-4 bg-white dark:bg-gray-900 rounded-lg shadow max-w-md mx-auto">
      {user ? (
        <div className="flex items-center justify-between">
          <div>
            <div className="font-semibold">Signed in as</div>
            <div className="text-sm">{user.email || user.user_metadata?.full_name}</div>
          </div>
          <button onClick={signOut} className="bg-red-600 text-white px-3 py-2 rounded">Sign out</button>
        </div>
      ) : (
        <div className="text-center">
          <p className="mb-3">Sign in to upload past papers</p>
          <button onClick={signInWithGoogle} className="bg-blue-600 text-white px-4 py-2 rounded">
            Sign in with Google
          </button>
        </div>
      )}
    </div>
  );
}
