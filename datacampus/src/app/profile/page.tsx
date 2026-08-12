"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Bookmark,
  LogOut,
  User,
  GraduationCap,
  BookOpen,
  Heart,
  Shield,
  ShieldCheck,
  Bell,
  ExternalLink,
  BadgeCheck,
  Coins,
  MessageSquare,
  Award,
  Sparkles,
} from "lucide-react";
import { supabase } from "@/utils/supabaseClient";
import { usePreferences } from "@/hooks/usePreferences";
import { useLibrary } from "@/hooks/useLibrary";
import { useProfile } from "@/hooks/useProfile";
import Auth from "@/components/Auth";
import PaperCard from "@/components/PaperCard";
import LoadingSkeleton from "@/components/LoadingSkeleton";
import EmptyState from "@/components/EmptyState";
import VerifiedBadge from "@/components/VerifiedBadge";
import { dismissVerifyPrompt } from "@/utils/verificationGate";
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

interface ProfilePost {
  id: string;
  user_id: string;
  price_credits: number;
  created_at: string;
  unlocked: boolean;
  is_owner: boolean;
  body: string | null;
  media_path: string | null;
}

export default function ProfilePage() {
  const router = useRouter();
  const { preferences, setPreferences } = usePreferences();
  const { saves, likes } = useLibrary();
  const {
    isStaff,
    displayName,
    userId,
    role,
    isVerified,
    canUseSocialFeatures,
    verificationStatus,
    studentId,
    program: verifiedProgram,
    fullName,
  } = useProfile();
  const [user, setUser] = useState<any>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [tab, setTab] = useState<"saved" | "liked" | "uploads">("saved");
  const [papers, setPapers] = useState<Paper[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [uploadCount, setUploadCount] = useState(0);
  const [school, setSchool] = useState(preferences?.school || "");
  const [program, setProgram] = useState(preferences?.program || "");
  const [savingPrefs, setSavingPrefs] = useState(false);
  const [hideVerifyBanner, setHideVerifyBanner] = useState(false);

  useEffect(() => {
    try {
      setHideVerifyBanner(localStorage.getItem("dc:verify_prompt_dismissed") === "true");
    } catch {
      // ignore
    }
  }, []);

  const [followFee, setFollowFee] = useState("0");
  const [messageFee, setMessageFee] = useState("0");
  const [showReputation, setShowReputation] = useState(true);
  const [monetizeLoading, setMonetizeLoading] = useState(false);
  const [savingMonetize, setSavingMonetize] = useState(false);
  const [reputationScore, setReputationScore] = useState<number | null>(null);
  const [reputationLoading, setReputationLoading] = useState(false);

  const [posts, setPosts] = useState<ProfilePost[]>([]);
  const [postsLoading, setPostsLoading] = useState(false);
  const [newPostBody, setNewPostBody] = useState("");
  const [newPostPrice, setNewPostPrice] = useState("0");
  const [postingLoading, setPostingLoading] = useState(false);
  const [postCount, setPostCount] = useState(0);
  const [maxPosts, setMaxPosts] = useState(10);

  const [spotlightImpressions, setSpotlightImpressions] = useState("100");
  const [spotlightLoading, setSpotlightLoading] = useState(false);

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
      setFollowFee("0");
      setMessageFee("0");
      return;
    }
    let mounted = true;
    (async () => {
      setMonetizeLoading(true);
      const { data, error } = await supabase
        .from("profiles")
        .select("follow_fee_credits, message_fee_credits, show_reputation")
        .eq("id", user.id)
        .maybeSingle();
      if (!mounted) return;
      if (!error && data) {
        setFollowFee(String(data.follow_fee_credits ?? 0));
        setMessageFee(String(data.message_fee_credits ?? 0));
        setShowReputation(data.show_reputation ?? true);
      }
      setMonetizeLoading(false);
    })();
    return () => {
      mounted = false;
    };
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) {
      setReputationScore(null);
      return;
    }
    let mounted = true;
    (async () => {
      setReputationLoading(true);
      try {
        const res = await fetch(`/api/social/profile-stats?userId=${user.id}`);
        const json = await res.json();
        if (!mounted) return;
        setReputationScore(typeof json.reputation === "number" ? json.reputation : null);
      } catch {
        if (mounted) setReputationScore(null);
      }
      if (mounted) setReputationLoading(false);
    })();
    return () => {
      mounted = false;
    };
  }, [user?.id]);

  const loadPosts = async () => {
    if (!user?.id) {
      setPosts([]);
      return;
    }
    setPostsLoading(true);
    const session = await supabase.auth.getSession();
    const token = session.data.session?.access_token;
    const res = await fetch(`/api/social/posts?userId=${user.id}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    });
    const json = await res.json();
    setPosts(json.posts ?? []);
    setPostCount(typeof json.postCount === "number" ? json.postCount : (json.posts ?? []).length);
    setMaxPosts(typeof json.maxPosts === "number" ? json.maxPosts : 10);
    setPostsLoading(false);
  };

  useEffect(() => {
    void loadPosts();
  }, [user?.id]);

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

  const handleSaveMonetize = async () => {
    if (!user?.id) return;
    const parsedFollowFee = Number(followFee);
    const parsedMessageFee = Number(messageFee);
    if (!Number.isInteger(parsedFollowFee) || parsedFollowFee < 0 || !Number.isInteger(parsedMessageFee) || parsedMessageFee < 0) {
      showToast("error", "Fees must be whole numbers of 0 or more");
      return;
    }
    setSavingMonetize(true);
    const { error } = await supabase
      .from("profiles")
      .update({ follow_fee_credits: parsedFollowFee, message_fee_credits: parsedMessageFee, show_reputation: showReputation })
      .eq("id", user.id);
    if (error) {
      showToast("error", error.message || "Couldn't save your fees");
    } else {
      showToast("success", "Monetization settings saved");
    }
    setSavingMonetize(false);
  };

  const handleCreatePost = async () => {
    if (!newPostBody.trim()) {
      showToast("error", "Write something for your post first");
      return;
    }
    const parsedPrice = Number(newPostPrice);
    if (!Number.isInteger(parsedPrice) || parsedPrice < 0) {
      showToast("error", "Price must be a whole number of 0 or more");
      return;
    }
    setPostingLoading(true);
    const session = await supabase.auth.getSession();
    const token = session.data.session?.access_token;
    if (!token) {
      showToast("error", "You need to be signed in to post");
      setPostingLoading(false);
      return;
    }
    const res = await fetch("/api/social/posts", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ body: newPostBody.trim(), priceCredits: parsedPrice }),
    });
    const json = await res.json();
    if (!res.ok || json.error) {
      showToast("error", json.error || "Couldn't create your post");
    } else {
      showToast("success", json.evictedPostId ? "Post published — your oldest post was removed to stay within the 10-post limit" : "Post published");
      setNewPostBody("");
      setNewPostPrice("0");
      if (typeof json.postCount === "number") setPostCount(json.postCount);
      if (typeof json.maxPosts === "number") setMaxPosts(json.maxPosts);
      await loadPosts();
    }
    setPostingLoading(false);
  };

  const handleBoostSpotlight = async () => {
    const parsedImpressions = Number(spotlightImpressions);
    if (!Number.isInteger(parsedImpressions) || parsedImpressions < 1 || parsedImpressions > 5000) {
      showToast("error", "Impressions must be a whole number between 1 and 5000");
      return;
    }
    setSpotlightLoading(true);
    const session = await supabase.auth.getSession();
    const token = session.data.session?.access_token;
    if (!token) {
      showToast("error", "You need to be signed in to boost your profile");
      setSpotlightLoading(false);
      return;
    }
    try {
      const res = await fetch("/api/social/spotlight", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ impressionsTarget: parsedImpressions }),
      });
      const json = await res.json();
      if (!res.ok || json.error) {
        showToast(res.status === 503 ? "info" : "error", json.error || "Couldn't start your spotlight campaign");
      } else {
        showToast(
          "success",
          `Spotlight started! Spent ${json.totalCost} credits (${json.costPerImpression} credits/impression).`
        );
      }
    } catch {
      showToast("error", "Couldn't reach the server. Try again.");
    }
    setSpotlightLoading(false);
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

  const name = fullName || displayName || user.user_metadata?.full_name || "Student";
  const pendingReview =
    verificationStatus === "pending" || verificationStatus === "needs_review";

  return (
    <div className="font-sans mx-auto max-w-4xl px-3 pt-4 md:px-0 md:pt-0">
      {/* Hero identity band */}
      <div className="relative mb-6 overflow-hidden rounded-3xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
        <div
          className={`h-28 sm:h-32 ${
            isVerified
              ? "bg-gradient-to-br from-sky-500 via-indigo-500 to-violet-600"
              : "bg-gradient-to-br from-slate-700 via-slate-800 to-indigo-900"
          }`}
        >
          <div className="pointer-events-none absolute inset-x-0 top-0 h-28 opacity-30 sm:h-32">
            <div className="absolute -right-8 -top-10 h-40 w-40 rounded-full bg-white/20 blur-2xl" />
            <div className="absolute left-10 top-6 h-24 w-24 rounded-full bg-sky-300/30 blur-2xl" />
          </div>
        </div>

        <div className="relative px-4 pb-5 sm:px-6 sm:pb-6">
          <div className="-mt-10 flex flex-col gap-4 sm:-mt-12 sm:flex-row sm:items-end sm:justify-between">
            <div className="flex items-end gap-4">
              {user.user_metadata?.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={user.user_metadata.avatar_url}
                  alt=""
                  className="h-20 w-20 rounded-2xl border-4 border-white object-cover shadow-lg dark:border-gray-900 sm:h-24 sm:w-24"
                />
              ) : (
                <div className="flex h-20 w-20 items-center justify-center rounded-2xl border-4 border-white bg-indigo-100 shadow-lg dark:border-gray-900 dark:bg-indigo-900/40 sm:h-24 sm:w-24">
                  <User className="h-10 w-10 text-indigo-600 dark:text-indigo-300" />
                </div>
              )}
              <div className="min-w-0 pb-1">
                <div className="flex min-w-0 items-center gap-2">
                  <h1 className="truncate text-xl font-bold tracking-tight text-gray-900 dark:text-gray-50 sm:text-2xl">
                    {name}
                  </h1>
                  <VerifiedBadge role={role} isVerified={isVerified} size="md" />
                </div>
                <p className="truncate text-sm text-gray-500 dark:text-gray-400">{user.email}</p>
                <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                  {isVerified ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-sky-50 px-2.5 py-1 font-medium text-sky-700 dark:bg-sky-950/50 dark:text-sky-300">
                      <BadgeCheck size={12} />
                      Verified student
                      {studentId ? ` · ${studentId}` : ""}
                    </span>
                  ) : pendingReview ? (
                    <span className="rounded-full bg-amber-50 px-2.5 py-1 font-medium text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
                      Verification {verificationStatus.replace("_", " ")}
                    </span>
                  ) : (
                    <span className="rounded-full bg-gray-100 px-2.5 py-1 font-medium text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                      Browse-only · not verified
                    </span>
                  )}
                  {(verifiedProgram || program) && (
                    <span className="truncate">{verifiedProgram || program}</span>
                  )}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => router.push("/inbox")}
                className="inline-flex items-center gap-2 rounded-full bg-gray-100 px-3.5 py-2 text-sm font-medium transition-colors hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700"
              >
                <Bell size={15} />
                Alerts
              </button>
              {userId && (
                <button
                  type="button"
                  onClick={() => router.push(`/u/${userId}`)}
                  className="inline-flex items-center gap-2 rounded-full bg-gray-100 px-3.5 py-2 text-sm font-medium transition-colors hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700"
                >
                  <ExternalLink size={15} />
                  Channel
                </button>
              )}
              <button
                type="button"
                onClick={signOut}
                className="inline-flex items-center gap-2 rounded-full bg-gray-100 px-3.5 py-2 text-sm font-medium transition-colors hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700"
              >
                <LogOut size={15} />
                Sign out
              </button>
              {isStaff && (
                <button
                  type="button"
                  onClick={() => router.push("/admin")}
                  className="inline-flex items-center gap-2 rounded-full bg-indigo-600 px-3.5 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-700"
                >
                  <Shield size={15} />
                  Review
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {!canUseSocialFeatures && !hideVerifyBanner && (
        <section className="relative mb-6 overflow-hidden rounded-3xl border border-sky-200 bg-gradient-to-r from-sky-50 via-white to-indigo-50 p-5 dark:border-sky-900/40 dark:from-sky-950/50 dark:via-gray-900 dark:to-indigo-950/40 sm:p-6">
          <div className="pointer-events-none absolute -right-6 -top-6 h-28 w-28 rounded-full bg-sky-400/20 blur-2xl" />
          <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-start gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-sky-500/15 text-sky-600 dark:text-sky-400">
                <Sparkles size={20} />
              </div>
              <div>
                <h2 className="text-base font-semibold text-gray-900 dark:text-gray-50">
                  Verify your student status
                </h2>
                <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                  Unlock likes, comments, follows, messages, uploads — and earn your blue tick.
                </p>
              </div>
            </div>
            <div className="flex shrink-0 flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  dismissVerifyPrompt();
                  setHideVerifyBanner(true);
                }}
                className="rounded-full px-4 py-2 text-sm font-medium text-gray-600 transition hover:bg-white/80 dark:text-gray-300 dark:hover:bg-gray-800"
              >
                Not now
              </button>
              <button
                type="button"
                onClick={() => router.push("/verify")}
                className="inline-flex items-center gap-2 rounded-full bg-sky-500 px-4 py-2 text-sm font-semibold text-white shadow-sm shadow-sky-500/25 hover:bg-sky-400"
              >
                <ShieldCheck size={15} />
                Verify
              </button>
            </div>
          </div>
        </section>
      )}

      <section className="mb-8 rounded-3xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900 sm:p-6">
        <div className="mb-4 flex items-center gap-2">
          <GraduationCap className="text-indigo-600 dark:text-indigo-400" size={20} />
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Preferences</h2>
        </div>
        <div className="mb-4 grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">School</span>
            <select
              value={school}
              onChange={(e) => {
                setSchool(e.target.value);
                setProgram("");
              }}
              className="mt-1 w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-800"
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
              className="mt-1 w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm disabled:opacity-50 dark:border-gray-700 dark:bg-gray-800"
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
          className="rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-indigo-700 disabled:opacity-50"
        >
          {savingPrefs ? "Saving..." : "Save preferences"}
        </button>
      </section>

      <section className="mb-8 p-4 sm:p-6 bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800">
        <div className="flex items-center gap-2 mb-2">
          <Coins className="text-indigo-600 dark:text-indigo-400" size={20} />
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Monetize your profile</h2>
        </div>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
          Set optional fees for people who want to follow or message you for the first time. People you already
          follow/message-with are never charged again. Set to 0 for free.
        </p>
        <div className="flex items-center gap-2 mb-4 p-3 rounded-xl bg-gray-50 dark:bg-gray-800/50">
          <Award className="text-indigo-600 dark:text-indigo-400 shrink-0" size={18} />
          <div>
            <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
              Your reputation score: {reputationLoading ? "..." : reputationScore !== null ? reputationScore.toLocaleString() : "—"}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Reputation = wallet balance + lifetime earnings + followers × 5. It only ever goes up, even when you spend credits.
            </p>
          </div>
        </div>
        <div className="grid sm:grid-cols-2 gap-3 mb-4">
          <label className="block">
            <span className="text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">Follow fee (credits)</span>
            <input
              type="number"
              min={0}
              step={1}
              value={followFee}
              onChange={(e) => setFollowFee(e.target.value)}
              disabled={monetizeLoading}
              className="mt-1 w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm disabled:opacity-50"
            />
          </label>
          <label className="block">
            <span className="text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">First message fee (credits)</span>
            <input
              type="number"
              min={0}
              step={1}
              value={messageFee}
              onChange={(e) => setMessageFee(e.target.value)}
              disabled={monetizeLoading}
              className="mt-1 w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm disabled:opacity-50"
            />
          </label>
        </div>
        <label className="flex items-center gap-2 mb-4 text-sm text-gray-700 dark:text-gray-300">
          <input
            type="checkbox"
            checked={showReputation}
            onChange={(e) => setShowReputation(e.target.checked)}
            disabled={monetizeLoading}
            className="w-4 h-4 rounded border-gray-300 dark:border-gray-700 text-indigo-600 focus:ring-indigo-500 disabled:opacity-50"
          />
          Show my reputation score publicly
        </label>
        <button
          type="button"
          onClick={handleSaveMonetize}
          disabled={savingMonetize || monetizeLoading}
          className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-xl disabled:opacity-50 transition-colors"
        >
          {savingMonetize ? "Saving..." : "Save"}
        </button>
      </section>

      <section className="mb-8 p-4 sm:p-6 bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800">
        <div className="flex items-center justify-between gap-2 mb-4">
          <div className="flex items-center gap-2">
            <MessageSquare className="text-indigo-600 dark:text-indigo-400" size={20} />
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Your posts</h2>
          </div>
          <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
            {postCount} / {maxPosts} posts
          </span>
        </div>

        <div className="space-y-3 mb-6">
          <label className="block">
            <span className="text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">What's on your mind?</span>
            <textarea
              value={newPostBody}
              onChange={(e) => setNewPostBody(e.target.value)}
              rows={3}
              placeholder="Share an update..."
              className="mt-1 w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm resize-none"
            />
          </label>
          <div className="flex flex-col sm:flex-row sm:items-end gap-3">
            <label className="block w-full sm:w-48">
              <span className="text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">Price (credits, optional)</span>
              <input
                type="number"
                min={0}
                step={1}
                value={newPostPrice}
                onChange={(e) => setNewPostPrice(e.target.value)}
                className="mt-1 w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm"
              />
            </label>
            <button
              type="button"
              onClick={handleCreatePost}
              disabled={postingLoading}
              className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-xl disabled:opacity-50 transition-colors"
            >
              {postingLoading ? "Posting..." : "Post"}
            </button>
          </div>
          {postCount >= maxPosts && (
            <p className="text-xs text-amber-600 dark:text-amber-400">
              You're at the {maxPosts}-post limit — publishing a new one will automatically remove your oldest post.
            </p>
          )}
        </div>

        {postsLoading ? (
          <LoadingSkeleton />
        ) : posts.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">You haven't posted anything yet.</p>
        ) : (
          <div className="space-y-3">
            {posts.map((post) => (
              <div
                key={post.id}
                className="p-3 sm:p-4 rounded-xl border border-gray-200 dark:border-gray-800"
              >
                <div className="flex items-center justify-between gap-2 mb-2">
                  <span
                    className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                      post.price_credits > 0
                        ? "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400"
                        : "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400"
                    }`}
                  >
                    {post.price_credits > 0 ? `${post.price_credits} credits to view` : "Free"}
                  </span>
                  <span className="text-xs text-gray-400 dark:text-gray-500">
                    {new Date(post.created_at).toLocaleDateString()}
                  </span>
                </div>
                <p className="text-sm text-gray-800 dark:text-gray-200 whitespace-pre-wrap wrap-break-word">{post.body}</p>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="mb-8 p-4 sm:p-6 bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800">
        <div className="flex items-center gap-2 mb-2">
          <Sparkles className="text-indigo-600 dark:text-indigo-400" size={20} />
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Spotlight — get seen</h2>
        </div>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
          Pay credits to get your profile featured in the homepage Discover rail — real visibility to real students
          browsing DataCampus, not fake followers.
        </p>
        <div className="flex flex-col sm:flex-row sm:items-end gap-3 mb-2">
          <label className="block w-full sm:w-48">
            <span className="text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">Impressions</span>
            <input
              type="number"
              min={1}
              max={5000}
              step={1}
              value={spotlightImpressions}
              onChange={(e) => setSpotlightImpressions(e.target.value)}
              disabled={spotlightLoading}
              className="mt-1 w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm disabled:opacity-50"
            />
          </label>
          <button
            type="button"
            onClick={handleBoostSpotlight}
            disabled={spotlightLoading}
            className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-xl disabled:opacity-50 transition-colors"
          >
            {spotlightLoading ? "Boosting..." : "Boost my profile"}
          </button>
        </div>
        <p className="text-xs text-gray-400 dark:text-gray-500">
          Final cost is confirmed at checkout based on current rates.
        </p>
      </section>

      <section>
        <div className="mb-4 flex items-center gap-2">
          <BookOpen className="text-indigo-600 dark:text-indigo-400" size={20} />
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">My library</h2>
        </div>
        <div className="mb-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setTab("saved")}
            className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium ${
              tab === "saved"
                ? "bg-indigo-600 text-white"
                : "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300"
            }`}
          >
            <Bookmark size={16} />
            Saved ({saves.length})
          </button>
          <button
            type="button"
            onClick={() => setTab("liked")}
            className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium ${
              tab === "liked"
                ? "bg-indigo-600 text-white"
                : "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300"
            }`}
          >
            <Heart size={16} />
            Liked ({likes.length})
          </button>
          <button
            type="button"
            onClick={() => setTab("uploads")}
            className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium ${
              tab === "uploads"
                ? "bg-indigo-600 text-white"
                : "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300"
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
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
