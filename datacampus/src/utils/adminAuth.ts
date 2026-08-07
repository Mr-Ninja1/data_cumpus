import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/utils/supabaseServerClient";
import { isStaffRole } from "@/utils/staff";

async function getAuthedUser(req: NextRequest) {
  const auth = req.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token || !supabaseServer) return null;
  const { data, error } = await supabaseServer.auth.getUser(token);
  if (error) return null;
  return data.user ?? null;
}

export async function assertStaffUser(userId: string) {
  if (!supabaseServer) return false;
  const { data } = await supabaseServer
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle();
  return isStaffRole(data?.role);
}

export { getAuthedUser };
