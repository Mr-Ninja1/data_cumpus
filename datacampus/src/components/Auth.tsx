"use client";
import React, { useEffect, useState } from "react";
import { supabase } from "@/utils/supabaseClient";
import { LogIn, LogOut, Mail, Lock, User, Chrome, Loader2, AlertCircle } from "lucide-react";

export default function Auth() {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    setLoading(true);
    setError(null);
    try {
      const { error } = await supabase.auth.signInWithOAuth({ provider: "google" });
      if (error) {
        setError(error.message);
      }
    } catch (e: any) {
      setError(e.message || "Failed to sign in with Google");
    } finally {
      setLoading(false);
    }
  };

  const signOut = async () => {
    setLoading(true);
    try {
      await supabase.auth.signOut();
    } catch (e: any) {
      setError(e.message || "Failed to sign out");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 md:p-8 bg-white dark:bg-gray-900 rounded-2xl shadow-lg border border-gray-200 dark:border-gray-800 max-w-md mx-auto">
      {user ? (
        <div className="space-y-4">
          <div className="flex items-center gap-3 p-4 bg-indigo-50 dark:bg-indigo-900/20 rounded-xl">
            <div className="p-3 bg-indigo-100 dark:bg-indigo-900/30 rounded-full">
              <User className="text-indigo-600 dark:text-indigo-400 w-6 h-6" />
            </div>
            <div className="flex-1">
              <div className="font-semibold text-gray-900 dark:text-gray-100">Signed in</div>
              <div className="text-sm text-gray-600 dark:text-gray-400 truncate">
                {user.email || user.user_metadata?.full_name || "User"}
              </div>
            </div>
          </div>
          <button
            onClick={signOut}
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-red-600 hover:bg-red-700 text-white rounded-xl font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <>
                <LogOut className="w-5 h-5" />
                <span>Sign out</span>
              </>
            )}
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="text-center">
            <div className="p-4 bg-gradient-to-br from-indigo-100 to-purple-100 dark:from-indigo-900/30 dark:to-purple-900/30 rounded-full w-16 h-16 mx-auto mb-4 flex items-center justify-center">
              <LogIn className="text-indigo-600 dark:text-indigo-400 w-8 h-8" />
            </div>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">Welcome to DataCampus</h2>
            <p className="text-gray-600 dark:text-gray-400">Sign in to upload and access past papers</p>
          </div>

          {error && (
            <div className="flex items-center gap-3 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl">
              <AlertCircle className="text-red-600 dark:text-red-400 w-5 h-5 flex-shrink-0" />
              <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
            </div>
          )}

          <button
            onClick={signInWithGoogle}
            disabled={loading}
            className="w-full flex items-center justify-center gap-3 px-4 py-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-xl font-medium text-gray-900 dark:text-gray-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm hover:shadow-md"
          >
            {loading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <>
                <Chrome className="w-5 h-5" />
                <span>Continue with Google</span>
              </>
            )}
          </button>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-200 dark:border-gray-700"></div>
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-2 bg-white dark:bg-gray-900 text-gray-500 dark:text-gray-400">or</span>
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center gap-3 px-4 py-3 bg-gray-50 dark:bg-gray-800 rounded-xl">
              <Mail className="text-gray-400 w-5 h-5" />
              <span className="text-sm text-gray-500 dark:text-gray-400">Email sign-in coming soon</span>
            </div>
            <div className="flex items-center gap-3 px-4 py-3 bg-gray-50 dark:bg-gray-800 rounded-xl">
              <Lock className="text-gray-400 w-5 h-5" />
              <span className="text-sm text-gray-500 dark:text-gray-400">Password sign-in coming soon</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
