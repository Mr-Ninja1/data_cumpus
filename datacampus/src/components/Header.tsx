"use client";
import React, { useEffect, useState, useRef } from "react";
import { Search, Upload, User, Home, Menu } from "lucide-react";
import { supabase } from "@/utils/supabaseClient";
import { useRouter } from "next/navigation";

export default function Header() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

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

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("click", onDoc);
    return () => document.removeEventListener("click", onDoc);
  }, []);

  const handleUploadClick = () => router.push("/upload");

  const handleProfileClick = async () => {
    if (!user) {
      await supabase.auth.signInWithOAuth({ provider: "google" });
      return;
    }
    setOpen((s) => !s);
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setOpen(false);
  };

  return (
    <header className="flex items-center justify-between px-6 py-3 border-b bg-white dark:bg-gray-900 sticky top-0 z-30">
      <div className="flex items-center gap-4">
        <button
          onClick={() => window.dispatchEvent(new CustomEvent('toggle-sidebar'))}
          title="Toggle sidebar"
          className="p-3 rounded hover:bg-gray-200 dark:hover:bg-gray-700"
        >
          <Menu size={26} />
        </button>

        <div onClick={() => router.push("/")} className="flex items-center gap-3 cursor-pointer">
          <span className="font-extrabold text-2xl md:text-3xl">DataCampus</span>
        </div>
      </div>

      <div className="flex-1 flex justify-center">
        <div className="relative w-full max-w-2xl flex items-center">
          <button onClick={() => router.push("/")} title="Home" className="p-3 rounded hover:bg-gray-200 dark:hover:bg-gray-700 mr-3">
            <Home size={24} />
          </button>
          <div className="relative flex-1">
            <input
              type="text"
              placeholder="Search past papers..."
              className="w-full pl-14 pr-4 py-3 rounded-xl border bg-gray-100 dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 text-base md:text-lg"
            />
            <Search className="absolute left-4 top-3.5 text-gray-400" size={22} />
          </div>
        </div>
      </div>
      <div className="flex items-center gap-5">
        <button onClick={handleUploadClick} title="Upload" className="p-3 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700">
          <Upload size={26} />
        </button>

        <div ref={ref} className="relative">
          <button onClick={handleProfileClick} title={user ? "Profile" : "Sign in"} className="flex items-center gap-2 p-2 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700">
            {user && user.user_metadata?.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={user.user_metadata.avatar_url} alt="avatar" className="h-10 w-10 rounded-full object-cover" />
            ) : (
              <div className="h-10 w-10 rounded-full bg-gray-300 dark:bg-gray-700 flex items-center justify-center text-sm font-semibold text-gray-700 dark:text-gray-200">
                <User size={20} />
              </div>
            )}
          </button>

          {open && user && (
            <div className="absolute right-0 mt-2 w-56 bg-white dark:bg-gray-800 border rounded shadow py-2">
              <div className="px-3 py-2 text-sm text-gray-700 dark:text-gray-200">{user.email}</div>
              <hr />
              <button onClick={() => router.push("/profile")} className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700">Profile</button>
              <button onClick={signOut} className="w-full text-left px-3 py-2 text-sm text-red-600 hover:bg-gray-100 dark:hover:bg-gray-700">Sign out</button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
