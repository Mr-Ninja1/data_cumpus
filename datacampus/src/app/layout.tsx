import type { Metadata } from "next";
import { Suspense } from "react";
import { Inter } from "next/font/google";
import "./globals.css";
import Header from "@/components/Header";
import Sidebar from "@/components/Sidebar";
import Toast from "@/components/Toast";
import MobileTabBar from "@/components/MobileTabBar";
import ClientExtras from "@/components/ClientExtras";
import AppFrame from "@/components/AppFrame";
import { PreferencesProvider } from "@/hooks/usePreferences";
import { LibraryProvider } from "@/hooks/useLibrary";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "DataCampus",
  description: "Access university past papers and resources.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${inter.variable} font-sans antialiased bg-white dark:bg-gray-950 md:bg-gray-50 md:dark:bg-gray-950`}>
        <PreferencesProvider>
          <LibraryProvider>
            <div className="min-h-screen flex flex-col">
              <Header />
              <div className="flex flex-1">
                <Sidebar />
                <main className="min-w-0 flex-1 w-full bg-white dark:bg-gray-950 md:bg-gray-50 md:dark:bg-gray-950">
                  <AppFrame>{children}</AppFrame>
                </main>
              </div>
            </div>
            <Toast />
            <Suspense fallback={null}>
              <MobileTabBar />
            </Suspense>
            <ClientExtras />
          </LibraryProvider>
        </PreferencesProvider>
      </body>
    </html>
  );
}
