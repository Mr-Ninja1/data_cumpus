"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/utils/supabaseClient";
import { isStaffRole, isTrustedContributor as checkTrusted } from "@/utils/staff";
import { canUseSocialFeatures as checkSocialAccess } from "@/utils/verificationGate";

export type AppRole = "user" | "trusted_contributor" | "moderator" | "admin" | "owner" | string;

export type VerificationStatus =
  | "unverified"
  | "pending"
  | "verified"
  | "rejected"
  | "needs_review"
  | string;

export function useProfile() {
  const [userId, setUserId] = useState<string | null>(null);
  const [role, setRole] = useState<AppRole>("user");
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [isVerified, setIsVerified] = useState(false);
  const [verificationStatus, setVerificationStatus] =
    useState<VerificationStatus>("unverified");
  const [studentId, setStudentId] = useState<string | null>(null);
  const [program, setProgram] = useState<string | null>(null);
  const [department, setDepartment] = useState<string | null>(null);
  const [fullName, setFullName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (uid: string | null, meta?: Record<string, any>) => {
    if (!uid) {
      setUserId(null);
      setRole("user");
      setDisplayName(null);
      setIsVerified(false);
      setVerificationStatus("unverified");
      setStudentId(null);
      setProgram(null);
      setDepartment(null);
      setFullName(null);
      setLoading(false);
      return;
    }

    const name =
      meta?.full_name || meta?.name || meta?.preferred_username || null;

    try {
      await supabase.from("profiles").upsert(
        {
          id: uid,
          display_name: name,
        },
        { onConflict: "id" }
      );
    } catch {
      // profiles table / RLS may not be ready yet
    }

    const { data } = await supabase
      .from("profiles")
      .select(
        "role, display_name, is_verified, verification_status, student_id, program, department, full_name"
      )
      .eq("id", uid)
      .maybeSingle();

    setUserId(uid);
    setRole((data?.role as AppRole) || "user");
    setDisplayName(data?.display_name || name);
    setIsVerified(Boolean(data?.is_verified) || data?.verification_status === "verified");
    setVerificationStatus(
      (data?.verification_status as VerificationStatus) ||
        (data?.is_verified ? "verified" : "unverified")
    );
    setStudentId(data?.student_id ?? null);
    setProgram(data?.program ?? null);
    setDepartment(data?.department ?? null);
    setFullName(data?.full_name ?? null);
    setLoading(false);
  }, []);

  const refresh = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    const session = data.session;
    setLoading(true);
    await load(session?.user?.id ?? null, session?.user?.user_metadata);
  }, [load]);

  useEffect(() => {
    let mounted = true;

    (async () => {
      const { data } = await supabase.auth.getSession();
      const session = data.session;
      if (!mounted) return;
      await load(session?.user?.id ?? null, session?.user?.user_metadata);
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setLoading(true);
      void load(session?.user?.id ?? null, session?.user?.user_metadata);
    });

    return () => {
      mounted = false;
      sub?.subscription.unsubscribe();
    };
  }, [load]);

  const isStaff = isStaffRole(role);
  const isTrusted = checkTrusted(role);
  const canUseSocialFeatures = checkSocialAccess(isVerified, role);

  return {
    userId,
    role,
    displayName,
    loading,
    isStaff,
    isTrusted,
    isVerified,
    canUseSocialFeatures,
    verificationStatus,
    studentId,
    program,
    department,
    fullName,
    refresh,
  };
}

export default useProfile;
