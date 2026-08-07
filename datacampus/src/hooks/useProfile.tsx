"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/utils/supabaseClient";
import { isStaffRole, isTrustedContributor as checkTrusted } from "@/utils/staff";

export type AppRole = "user" | "trusted_contributor" | "moderator" | "admin" | "owner" | string;

export function useProfile() {
  const [userId, setUserId] = useState<string | null>(null);
  const [role, setRole] = useState<AppRole>("user");
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    const load = async (uid: string | null, meta?: Record<string, any>) => {
      if (!uid) {
        if (!mounted) return;
        setUserId(null);
        setRole("user");
        setDisplayName(null);
        setLoading(false);
        return;
      }

      const name =
        meta?.full_name || meta?.name || meta?.preferred_username || null;

      // Ensure a profile row exists for role / display lookups
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
        .select("role, display_name")
        .eq("id", uid)
        .maybeSingle();

      if (!mounted) return;
      setUserId(uid);
      setRole((data?.role as AppRole) || "user");
      setDisplayName(data?.display_name || name);
      setLoading(false);
    };

    (async () => {
      const { data } = await supabase.auth.getSession();
      const session = data.session;
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
  }, []);

  const isStaff = isStaffRole(role);
  const isTrusted = checkTrusted(role);

  return { userId, role, displayName, loading, isStaff, isTrusted };
}

export default useProfile;
