"use client";

import React from "react";
import { BadgeCheck } from "lucide-react";
import { isStaffRole } from "@/utils/staff";

type Size = "xs" | "sm" | "md";

const SIZE_MAP: Record<Size, string> = {
  xs: "w-3 h-3",
  sm: "w-3.5 h-3.5",
  md: "w-[18px] h-[18px]",
};

function staffLabel(role?: string | null) {
  switch (role) {
    case "owner":
      return "Owner";
    case "admin":
      return "Admin";
    case "moderator":
      return "Moderator";
    default:
      return "Staff";
  }
}

/**
 * Social-style identity badges, shown next to a display name anywhere it
 * appears (header, profile, channel page, cards, comments):
 *
 * - Gold tick  — DataCampus staff (moderator / admin / owner)
 * - Blue tick  — verified student identity (profiles.is_verified)
 *
 * Both can render together (staff first, then verified) since a staff
 * member can also be an identity-verified student.
 */
export default function VerifiedBadge({
  role,
  isVerified,
  size = "sm",
  className = "",
}: {
  role?: string | null;
  isVerified?: boolean | null;
  size?: Size;
  className?: string;
}) {
  const staff = isStaffRole(role);
  if (!staff && !isVerified) return null;

  const sizeClass = SIZE_MAP[size];

  return (
    <span className={`inline-flex items-center gap-0.5 align-middle ${className}`}>
      {staff && (
        <span title={`DataCampus ${staffLabel(role)}`} className="inline-flex">
          <BadgeCheck
            className={`${sizeClass} text-amber-500 shrink-0 drop-shadow-[0_0_3px_rgba(251,191,36,0.55)]`}
            strokeWidth={2.25}
            aria-label={`DataCampus ${staffLabel(role)}`}
          />
        </span>
      )}
      {isVerified && (
        <span title="Verified student" className="inline-flex">
          <BadgeCheck
            className={`${sizeClass} text-sky-500 shrink-0 drop-shadow-[0_0_3px_rgba(56,189,248,0.5)]`}
            strokeWidth={2.25}
            aria-label="Verified student"
          />
        </span>
      )}
    </span>
  );
}
