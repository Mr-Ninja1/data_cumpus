import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Header from "@/components/Header";
import Sidebar from "@/components/Sidebar";
import AuthGate from "@/components/AuthGate";
import PreferenceLauncher from "@/components/PreferenceLauncher";
import { PreferencesProvider } from "@/hooks/usePreferences";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
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
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased bg-gray-50 dark:bg-gray-950`}>
        <PreferencesProvider>
          <div className="min-h-screen flex flex-col">
            <Header />
            <AuthGate />
            <div className="flex flex-1">
              <Sidebar />
              <main className="flex-1 p-4 md:p-8 bg-gray-50 dark:bg-gray-950">
                {children}
              </main>
            </div>
            <PreferenceLauncher />
          </div>
        </PreferencesProvider>
      </body>
    </html>
  );
}
