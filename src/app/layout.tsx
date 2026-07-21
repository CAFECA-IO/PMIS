import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Sidebar } from "@/components/sidebar";
import { AiPanel } from "@/components/ai-panel";
import { NotificationProvider } from "@/components/ui/notification";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "PMIS — 智慧監造管理系統",
  description: "AI-Powered Construction Supervision PMIS",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="zh-Hant"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="h-full overflow-hidden">
        <NotificationProvider>
          <div className="flex h-screen">
            <Sidebar />
            <main className="min-w-0 flex-1 overflow-y-auto bg-background">
              {children}
            </main>
            <AiPanel />
          </div>
        </NotificationProvider>
      </body>
    </html>
  );
}
