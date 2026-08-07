"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Bookmark, LogOut, User, GraduationCap, BookOpen, Heart, Shield, Bell, ExternalLink } from "lucide-react";
import { supabase } from "@/utils/supabaseClient";
import { usePreferences } from "@/hooks/usePreferences";
import { useLibrary } from "@/hooks/useLibrary";
import { useProfile } from "@/hooks/useProfile";
import Auth from "@/components/Auth";
import PaperCard from "@/components/PaperCard";
import LoadingSkeleton from "@/components/LoadingSkeleton";
import EmptyState from "@/components/EmptyState";
import { showToast } from "@/utils/toast";

const schools = [
  {
    name: "School of Engineering & Technology",
    programs: ["Electrical & Electronics", "Telecommunications", "Instrumentation"],
  },
  {
    name: "School of Business",
    programs: ["Accountancy", "BBA", "Marketing", "Purchasing & Supply"],
  },
  {
    name: "School of Information & Communication Technology",
    programs: ["BSE", "Cyber Security", "BIT", "BICTE"],
  },
];

interface Paper {
  id: string;
  school: string;
  program: string;
  type: string;
  title: string;
  uploadedAt: string;
}

export default function ProfilePage() {
  const router = useRouter();
  const { preferences, setPreferences } = usePreferences();
  const { saves, likes } = useLibrary();
  const { isStaff, displayName, userId } = useProfile();
  const [user, setUser] = useState<any>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [tab, setTab] = useState<"saved" | "liked" | "uploads">("saved");
  const [papers, setPapers] = useState<Paper[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [uploadCount, setUploadCount] = useState(0);
  const [school, setSchool] = useState(preferences?.school || "");
  const [program, setProgram] = useState(preferences?.program || "");
  const [savingPrefs, setSavingPrefs] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!mounted) return;
      setUser(data.session?.user ?? null);
      setAuthLoading(false);
    })();
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setUser(session?.user ?? null);
    });
    return () => {
      mounted = false;
      sub?.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    setSchool(preferences?.school || "");
    setProgram(preferences?.program || "");
  }, [preferences]);

  useEffect(() => {
    if (!user?.id) {
      setUploadCount(0);
      return;
    }
    let mounted = true;
    (async () => {
      const { count } = await supabase
        .from("papers")
        .select("*", { count: "exact", head: true })
        .eq("uploaded_by", user.id);
      if (mounted) setUploadCount(count ?? 0);
    })();
    return () => {
      mounted = false;
    };
  }, [user?.id]);

  const ids = tab === "saved" ? saves : tab === "liked" ? likes : [];

  useEffect(() => {
    let mounted = true;
    (async () => {
      setListLoading(true);

      if (tab === "uploads") {
        if (!user?.id) {
          setPapers([]);
          setListLoading(false);
          return;
        }
        const { data, error } = await supabase
          .from("papers")
          .select("*")
          .eq("uploaded_by", user.id)
          .order("uploaded_at", { ascending: false })
          .limit(48);
        if (!mounted) return;
        if (error) {
          console.warn(error.message);
          setPapers([]);
          setUploadCount(0);
        } else {
          const mapped = (data || []).map((row: any) => ({
            id: row.id,
            school: row.school,
            program: row.program,
            type: row.type,
            title: row.title,
            uploadedAt: row.uploaded_at,
          }));
          setPapers(mapped);
          setUploadCount(mapped.length);
        }
        setListLoading(false);
        return;
      }

      if (ids.length === 0) {
        setPapers([]);
        setListLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from("papers")
        .select("*")
        .in("id", ids)
        .limit(48);
      if (!mounted) return;
      if (error) {
        console.error(error);
        setPapers([]);
      } else {
        const mapped = (data || []).map((row: any) => ({
          id: row.id,
          school: row.school,
          program: row.program,
          type: row.type,
          title: row.title,
          uploadedAt: row.uploaded_at,
        }));
        const order = new Map(ids.map((id, i) => [id, i]));
        mapped.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
        setPapers(mapped);
      }
      setListLoading(false);
    })();
    return () => {
      mounted = false;
    };
  }, [tab, ids.join(","), user?.id]);

  const programs = schools.find((s) => s.name === school)?.programs || [];

  const handleSavePrefs = async () => {
    setSavingPrefs(true);
    const payload = { school, program };
    await setPreferences(payload, Boolean(user));
    showToast("success", user ? "Preferences saved to your account" : "Preferences saved on this device");
    setSavingPrefs(false);
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    showToast("info", "Signed out");
    router.push("/");
  };

  if (authLoading) {
    return <LoadingSkeleton />;
  }

  if (!user) {
    return (
      <div className="max-w-md mx-auto py-8 px-3 md:px-0">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">Your profile</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Sign in to sync preferences. Saved papers still work on this device as a guest.
          </p>
        </div>
        <Auth />
        {(saves.length > 0 || likes.length > 0) && (
          <div className="mt-10">
            <h2 className="text-lg font-semibold mb-4 text-gray-900 dark:text-gray-100">
              Library on this device
            </h2>
            <div className="flex gap-2 mb-4">
              <button
                type="button"
                onClick={() => setTab("saved")}
                className={`px-4 py-2 rounded-lg text-sm font-medium ${
                  tab === "saved"
                    ? "bg-indigo-600 text-white"
                    : "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300"
                }`}
              >
                Saved ({saves.length})
              </button>
              <button
                type="button"
                onClick={() => setTab("liked")}
                className={`px-4 py-2 rounded-lg text-sm font-medium ${
                  tab === "liked"
                    ? "bg-indigo-600 text-white"
                    : "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300"
                }`}
              >
                Liked ({likes.length})
              </button>
            </div>
            {listLoading ? (
              <LoadingSkeleton />
            ) : papers.length === 0 ? (
              <EmptyState type="empty-library" onReset={() => router.push("/")} />
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {papers.map((p) => (
                  <PaperCard
                    key={p.id}
                    id={p.id}
                    title={p.title}
                    program={p.program}
                    type={p.type}
                    uploadedAt={p.uploadedAt}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="font-sans max-w-4xl mx-auto px-3 pt-4 md:px-0 md:pt-0">
      <div className="flex flex-col sm:flex-row sm:items-center gap-4 mb-8 p-4 sm:p-6 bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800">
        {user.user_metadata?.avatar_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={user.user_metadata.avatar_url}
            alt=""
            className="h-16 w-16 rounded-full object-cover"
          />
        ) : (
          <div className="h-16 w-16 rounded-full bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center">
            <User className="w-8 h-8 text-indigo-600 dark:text-indigo-400" />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100 truncate">
            {displayName || user.user_metadata?.full_name || "Student"}
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 truncate">{user.email}</p>
          {userId && (
            <button
              type="button"
              onClick={() => router.push(`/u/${userId}`)}
              className="mt-2 inline-flex items-center gap-1 text-sm text-indigo-600 dark:text-indigo-400 hover:underline"
            >
              <ExternalLink size={14} />
              View public channel
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={() => router.push("/notifications")}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-sm font-medium transition-colors"
        >
          <Bell size={16} />
          Inbox
        </button>
        <button
          type="button"
          onClick={signOut}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-sm font-medium transition-colors"
        >
          <LogOut size={16} />
          Sign out
        </button>
        {isStaff && (
          <button
            type="button"
            onClick={() => router.push("/admin")}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium transition-colors"
          >
            <Shield size={16} />
            Review queue
          </button>
        )}
      </div>

      <section className="mb-8 p-4 sm:p-6 bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800">
        <div className="flex items-center gap-2 mb-4">
          <GraduationCap className="text-indigo-600 dark:text-indigo-400" size={20} />
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Preferences</h2>
        </div>
        <div className="grid sm:grid-cols-2 gap-3 mb-4">
          <label className="block">
            <span className="text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">School</span>
            <select
              value={school}
              onChange={(e) => {
                setSchool(e.target.value);
                setProgram("");
              }}
              className="mt-1 w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm"
            >
              <option value="">All schools</option>
              {schools.map((s) => (
                <option key={s.name} value={s.name}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">Program</span>
            <select
              value={program}
              onChange={(e) => setProgram(e.target.value)}
              disabled={!school}
              className="mt-1 w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm disabled:opacity-50"
            >
              <option value="">All programs</option>
              {programs.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </label>
        </div>
        <button
          type="button"
          onClick={handleSavePrefs}
          disabled={savingPrefs}
          className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-xl disabled:opacity-50 transition-colors"
        >
          {savingPrefs ? "Saving..." : "Save preferences"}
        </button>
      </section>

      <section>
        <div className="flex items-center gap-2 mb-4">
          <BookOpen className="text-indigo-600 dark:text-indigo-400" size={20} />
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">My library</h2>
        </div>
        <div className="flex gap-2 mb-4">
          <button
            type="button"
            onClick={() => setTab("saved")}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium ${
              tab === "saved"
                ? "bg-indigo-600 text-white"
                : "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300"
            }`}
          >
            <Bookmark size={16} />
            Saved ({saves.length})
          </button>
          <button
            type="button"
            onClick={() => setTab("liked")}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium ${
              tab === "liked"
                ? "bg-indigo-600 text-white"
                : "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300"
            }`}
          >
            <Heart size={16} />
            Liked ({likes.length})
          </button>
          <button
            type="button"
            onClick={() => setTab("uploads")}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium ${
              tab === "uploads"
                ? "bg-indigo-600 text-white"
                : "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300"
            }`}
          >
            <BookOpen size={16} />
            Uploads ({uploadCount})
          </button>
        </div>

        {listLoading ? (
          <LoadingSkeleton />
        ) : papers.length === 0 ? (
          <EmptyState type="empty-library" onReset={() => router.push("/")} />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {papers.map((p) => (
              <PaperCard
                key={p.id}
                id={p.id}
                title={p.title}
                program={p.program}
                type={p.type}
                uploadedAt={p.uploadedAt}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
