"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Search,
  RefreshCw,
  Users as UsersIcon,
  ShieldAlert,
  Copy,
  Check,
  FileText,
  Crown,
  Sparkles,
} from "lucide-react";
import { useProfile } from "@/hooks/useProfile";
import { APP_ROLES, canAssignRole } from "@/utils/roles";
import { supabase } from "@/utils/supabaseClient";
import { showToast } from "@/utils/toast";
import VerifiedBadge from "@/components/VerifiedBadge";

interface AdminUserRow {
  id: string;
  display_name: string | null;
  role: string;
  permissions: Record<string, unknown> | null;
  is_verified: boolean;
  created_at: string;
  upload_count: number;
}

export default function AdminUsersPage() {
  const { userId, role: actorRole } = useProfile();
  const canEditRoles = actorRole === "admin" || actorRole === "owner";

  const [rows, setRows] = useState<AdminUserRow[]>([]);
  const [search, setSearch] = useState("");
  const [initialLoading, setInitialLoading] = useState(true);
  const [searchLoading, setSearchLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);

  const isFirstRun = useRef(true);

  const fetchUsers = useCallback(async (q: string) => {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) {
      throw new Error("Not authenticated");
    }
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    const res = await fetch(`/api/admin/users?${params.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(json?.error || "Failed to load users");
    }
    return (json.users || []) as AdminUserRow[];
  }, []);

  useEffect(() => {
    let active = true;

    const run = async () => {
      const firstRun = isFirstRun.current;
      if (firstRun) setInitialLoading(true);
      else setSearchLoading(true);

      try {
        const users = await fetchUsers(search);
        if (!active) return;
        setRows(users);
        setError(null);
      } catch (e) {
        if (!active) return;
        setError(e instanceof Error ? e.message : "Failed to load users");
      } finally {
        if (!active) return;
        setInitialLoading(false);
        setSearchLoading(false);
        isFirstRun.current = false;
      }
    };

    const delay = isFirstRun.current ? 0 : 300;
    const t = setTimeout(run, delay);
    return () => {
      active = false;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, refreshTick, fetchUsers]);

  const handleRefresh = () => setRefreshTick((n) => n + 1);

  const handleRoleChange = async (row: AdminUserRow, newRole: string) => {
    if (newRole === row.role) return;
    const prevRole = row.role;
    setRows((rs) => rs.map((r) => (r.id === row.id ? { ...r, role: newRole } : r)));

    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error("Not authenticated");

      const res = await fetch(`/api/admin/users/${row.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ role: newRole }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) {
        throw new Error(json?.error || "Failed to update role");
      }
      showToast("success", `${row.display_name || "User"} is now ${roleLabel(newRole)}`);
    } catch (e) {
      setRows((rs) => rs.map((r) => (r.id === row.id ? { ...r, role: prevRole } : r)));
      showToast("error", e instanceof Error ? e.message : "Failed to update role");
    }
  };

  const handleVerifiedChange = async (row: AdminUserRow, newVerified: boolean) => {
    if (newVerified === row.is_verified) return;
    const prevVerified = row.is_verified;
    setRows((rs) => rs.map((r) => (r.id === row.id ? { ...r, is_verified: newVerified } : r)));

    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error("Not authenticated");

      const res = await fetch(`/api/admin/users/${row.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ isVerified: newVerified }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) {
        throw new Error(json?.error || "Failed to update verified status");
      }
      showToast(
        "success",
        newVerified
          ? `${row.display_name || "User"} is now verified`
          : `${row.display_name || "User"} is no longer verified`
      );
    } catch (e) {
      setRows((rs) => rs.map((r) => (r.id === row.id ? { ...r, is_verified: prevVerified } : r)));
      showToast("error", e instanceof Error ? e.message : "Failed to update verified status");
    }
  };

  const copyId = async (id: string) => {
    try {
      await navigator.clipboard.writeText(id);
      showToast("info", "User ID copied to clipboard");
    } catch {
      showToast("error", "Could not copy user ID");
    }
  };

  const loading = initialLoading || searchLoading;

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl font-bold text-white">Users & roles</h2>
        <p className="text-sm text-slate-400 mt-1 max-w-2xl">
          Manage who can access moderation and admin tools.
        </p>
      </div>

      {!canEditRoles && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-sm text-amber-300">
          <ShieldAlert className="w-4 h-4 shrink-0" />
          Only admins can change roles or verified status. You have read-only access to this list.
        </div>
      )}

      <div className="flex items-center gap-3 mb-5">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or user ID…"
            className="w-full rounded-lg border border-white/10 bg-slate-900/60 text-slate-100 placeholder:text-slate-500 pl-9 pr-3 py-2 focus:outline-none focus:ring-1 focus:ring-cyan-500"
          />
        </div>
        <button
          type="button"
          onClick={handleRefresh}
          disabled={loading}
          className="rounded-lg border border-white/10 bg-white/5 text-slate-200 hover:bg-white/10 px-4 py-2 inline-flex items-center gap-2 text-sm font-medium disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-rose-500/20 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">
          {error}
        </div>
      )}

      <div className="rounded-2xl border border-white/5 bg-slate-900/50 overflow-hidden">
        {loading ? (
          <UsersSkeleton />
        ) : rows.length === 0 ? (
          <EmptyState hasSearch={search.trim().length > 0} />
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden md:block">
              <div className="grid grid-cols-[minmax(0,2fr)_150px_110px_110px_140px_90px] gap-4 items-center px-4 py-3 border-b border-white/5 text-slate-500 text-[11px] font-semibold uppercase tracking-wider">
                <div>Name / ID</div>
                <div>Role</div>
                <div>Verified</div>
                <div>Uploads</div>
                <div>Joined</div>
                <div className="text-right">Actions</div>
              </div>
              <div className="divide-y divide-white/5">
                {rows.map((row) => (
                  <DesktopRow
                    key={row.id}
                    row={row}
                    isSelf={row.id === userId}
                    canEditRoles={canEditRoles}
                    actorRole={actorRole}
                    onRoleChange={handleRoleChange}
                    onVerifiedChange={handleVerifiedChange}
                    onCopyId={copyId}
                  />
                ))}
              </div>
            </div>

            {/* Mobile cards */}
            <div className="md:hidden divide-y divide-white/5">
              {rows.map((row) => (
                <MobileCard
                  key={row.id}
                  row={row}
                  isSelf={row.id === userId}
                  canEditRoles={canEditRoles}
                  actorRole={actorRole}
                  onRoleChange={handleRoleChange}
                  onVerifiedChange={handleVerifiedChange}
                  onCopyId={copyId}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ---------- Helpers ---------- */

function roleLabel(role: string): string {
  if (!role) return "User";
  return role
    .split("_")
    .map((w) => w[0]?.toUpperCase() + w.slice(1))
    .join(" ");
}

function roleBadgeClass(role: string): string {
  switch (role) {
    case "owner":
      return "bg-gradient-to-r from-amber-400 to-yellow-500 text-slate-950";
    case "admin":
      return "bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white";
    case "moderator":
      return "bg-gradient-to-r from-cyan-400 to-sky-500 text-slate-950";
    case "trusted_contributor":
      return "bg-gradient-to-r from-emerald-400 to-teal-500 text-slate-950";
    default:
      return "bg-slate-700 text-slate-100";
  }
}

function roleIcon(role: string) {
  if (role === "owner") return Crown;
  if (role === "admin") return Sparkles;
  if (role === "moderator") return ShieldAlert;
  return null;
}

function formatJoined(dateString: string): string {
  try {
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    }).format(new Date(dateString));
  } catch {
    return dateString;
  }
}

function RoleBadge({ role }: { role: string }) {
  const Icon = roleIcon(role);
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold uppercase ${roleBadgeClass(
        role
      )}`}
    >
      {Icon && <Icon className="w-3 h-3" />}
      {roleLabel(role)}
    </span>
  );
}

function Avatar({ name }: { name: string | null }) {
  const letter = (name || "?")[0]?.toUpperCase() || "?";
  return (
    <div className="h-9 w-9 shrink-0 rounded-full bg-gradient-to-br from-slate-700 to-slate-800 border border-white/10 flex items-center justify-center text-xs font-bold text-slate-200">
      {letter}
    </div>
  );
}

function RoleSelect({
  row,
  actorRole,
  disabled,
  onChange,
}: {
  row: AdminUserRow;
  actorRole: string;
  disabled: boolean;
  onChange: (newRole: string) => void;
}) {
  return (
    <select
      value={row.role}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      className="rounded-lg border border-white/10 bg-slate-900/60 text-slate-100 text-xs px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-cyan-500 disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {APP_ROLES.map((r) => (
        <option key={r} value={r} disabled={!canAssignRole(actorRole, r)}>
          {roleLabel(r)}
        </option>
      ))}
    </select>
  );
}

function VerifiedToggle({
  isVerified,
  disabled,
  onChange,
}: {
  isVerified: boolean;
  disabled: boolean;
  onChange: (newVerified: boolean) => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onChange(!isVerified)}
      title={disabled ? "Only admins can change verified status" : undefined}
      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold uppercase transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
        isVerified
          ? "bg-sky-500/15 text-sky-300 border border-sky-500/30 hover:bg-sky-500/25"
          : "bg-white/5 text-slate-400 border border-white/10 hover:bg-white/10"
      }`}
    >
      {isVerified ? "Verified ✓" : "Verify"}
    </button>
  );
}

function CopyIdButton({ id, onCopyId }: { id: string; onCopyId: (id: string) => void }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      title="Copy user ID"
      onClick={() => {
        onCopyId(id);
        setCopied(true);
        setTimeout(() => setCopied(false), 1200);
      }}
      className="p-1.5 rounded-lg border border-white/10 bg-white/5 text-slate-300 hover:bg-white/10 transition-colors"
    >
      {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  );
}

function DesktopRow({
  row,
  isSelf,
  canEditRoles,
  actorRole,
  onRoleChange,
  onVerifiedChange,
  onCopyId,
}: {
  row: AdminUserRow;
  isSelf: boolean;
  canEditRoles: boolean;
  actorRole: string;
  onRoleChange: (row: AdminUserRow, newRole: string) => void;
  onVerifiedChange: (row: AdminUserRow, newVerified: boolean) => void;
  onCopyId: (id: string) => void;
}) {
  return (
    <div className="grid grid-cols-[minmax(0,2fr)_150px_110px_110px_140px_90px] gap-4 items-center px-4 py-3 hover:bg-white/[0.03] transition-colors">
      <div className="flex items-center gap-3 min-w-0">
        <Avatar name={row.display_name} />
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-white truncate">
              {row.display_name || "Unnamed user"}
            </span>
            <VerifiedBadge role={row.role} isVerified={row.is_verified} size="sm" />
            {isSelf && (
              <span className="inline-flex items-center px-1.5 py-0.5 rounded-full bg-white/10 text-slate-300 text-[10px] font-semibold uppercase">
                You
              </span>
            )}
          </div>
          <div className="text-xs text-slate-500 truncate">{row.id}</div>
        </div>
      </div>

      <div>
        {canEditRoles && !isSelf ? (
          <RoleSelect
            row={row}
            actorRole={actorRole}
            disabled={false}
            onChange={(newRole) => onRoleChange(row, newRole)}
          />
        ) : (
          <RoleBadge role={row.role} />
        )}
      </div>

      <div>
        <VerifiedToggle
          isVerified={row.is_verified}
          disabled={!canEditRoles}
          onChange={(newVerified) => onVerifiedChange(row, newVerified)}
        />
      </div>

      <div className="text-sm text-slate-300">{row.upload_count} uploads</div>

      <div className="text-sm text-slate-400">{formatJoined(row.created_at)}</div>

      <div className="flex justify-end">
        <CopyIdButton id={row.id} onCopyId={onCopyId} />
      </div>
    </div>
  );
}

function MobileCard({
  row,
  isSelf,
  canEditRoles,
  actorRole,
  onRoleChange,
  onVerifiedChange,
  onCopyId,
}: {
  row: AdminUserRow;
  isSelf: boolean;
  canEditRoles: boolean;
  actorRole: string;
  onRoleChange: (row: AdminUserRow, newRole: string) => void;
  onVerifiedChange: (row: AdminUserRow, newVerified: boolean) => void;
  onCopyId: (id: string) => void;
}) {
  return (
    <div className="p-4 hover:bg-white/[0.03] transition-colors">
      <div className="flex items-center gap-3 mb-3">
        <Avatar name={row.display_name} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-white truncate">
              {row.display_name || "Unnamed user"}
            </span>
            <VerifiedBadge role={row.role} isVerified={row.is_verified} size="sm" />
            {isSelf && (
              <span className="inline-flex items-center px-1.5 py-0.5 rounded-full bg-white/10 text-slate-300 text-[10px] font-semibold uppercase">
                You
              </span>
            )}
          </div>
          <div className="text-xs text-slate-500 truncate">{row.id}</div>
        </div>
        <CopyIdButton id={row.id} onCopyId={onCopyId} />
      </div>

      <div className="flex items-center justify-between gap-3">
        {canEditRoles && !isSelf ? (
          <RoleSelect
            row={row}
            actorRole={actorRole}
            disabled={false}
            onChange={(newRole) => onRoleChange(row, newRole)}
          />
        ) : (
          <RoleBadge role={row.role} />
        )}

        <VerifiedToggle
          isVerified={row.is_verified}
          disabled={!canEditRoles}
          onChange={(newVerified) => onVerifiedChange(row, newVerified)}
        />
      </div>

      <div className="flex items-center gap-3 text-xs text-slate-400 mt-3">
        <span className="inline-flex items-center gap-1">
          <FileText className="w-3.5 h-3.5 text-slate-500" />
          {row.upload_count} uploads
        </span>
        <span>{formatJoined(row.created_at)}</span>
      </div>
    </div>
  );
}

function UsersSkeleton() {
  return (
    <div className="divide-y divide-white/5">
      {[...Array(6)].map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-4 py-3">
          <div className="h-9 w-9 rounded-full bg-white/5 animate-pulse shrink-0" />
          <div className="flex-1 space-y-2">
            <div className="h-3 w-1/3 rounded bg-white/5 animate-pulse" />
            <div className="h-2.5 w-1/2 rounded bg-white/5 animate-pulse" />
          </div>
          <div className="h-6 w-20 rounded-full bg-white/5 animate-pulse hidden md:block" />
          <div className="h-3 w-16 rounded bg-white/5 animate-pulse hidden md:block" />
          <div className="h-3 w-16 rounded bg-white/5 animate-pulse hidden md:block" />
        </div>
      ))}
    </div>
  );
}

function EmptyState({ hasSearch }: { hasSearch: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-16 px-4">
      <UsersIcon className="w-10 h-10 text-slate-600 mb-3" />
      <p className="text-sm text-slate-400">
        {hasSearch ? "No users match your search." : "No users found."}
      </p>
    </div>
  );
}
