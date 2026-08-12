"use client";

import React from "react";
import { usePathname } from "next/navigation";
import SiteBanner from "@/components/SiteBanner";

/**
 * The public site is padded, max-width constrained, and shows the promo
 * SiteBanner. The admin Control Center is a full-bleed dark shell with its
 * own chrome (see src/app/admin/layout.tsx), so it must escape that
 * constraint entirely instead of being squeezed into the public frame.
 *
 * People + Inbox use an immersive wide layout so split-pane chat isn't
 * crushed when the desktop sidebar is expanded.
 */
export default function AppFrame({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAdmin = pathname?.startsWith("/admin");
  const isImmersiveChat =
    pathname?.startsWith("/people") ||
    pathname?.startsWith("/inbox");

  if (isAdmin) {
    return <>{children}</>;
  }

  if (isImmersiveChat) {
    return (
      <div className="w-full max-w-[100rem] mx-auto px-2 sm:px-3 md:px-4 pt-0 md:pt-3 pb-[calc(4.5rem+env(safe-area-inset-bottom))] md:pb-4">
        {children}
      </div>
    );
  }

  return (
    <div className="w-full max-w-7xl mx-auto px-3 md:px-8 pt-0 md:pt-6 pb-[calc(4.5rem+env(safe-area-inset-bottom))] md:pb-8">
      <SiteBanner />
      {children}
    </div>
  );
}
