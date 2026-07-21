import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Sidebar } from "@/components/sidebar";
import { AiPanel } from "@/components/ai-panel";
import { NotificationProvider } from "@/components/ui/notification";
import { ConfirmProvider } from "@/components/ui/confirm-provider";
import { AiAssistantProvider } from "@/components/ai-assistant-context";
import { getCurrentUser } from "@/service/auth.service";

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
  icons: { icon: "/logo.svg" },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const user = await getCurrentUser();

  return (
    <html
      lang="zh-Hant"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="h-full overflow-hidden">
        <AiAssistantProvider>
          <ConfirmProvider>
          <NotificationProvider>
            {user ? (
              <div className="flex h-screen">
                <Sidebar
                  user={{ name: user.name, email: user.email, role: user.role }}
                />
                <main className="min-w-0 flex-1 overflow-y-auto bg-background pt-14 lg:pt-0">
                  {children}
                </main>
                <AiPanel />
              </div>
            ) : (
              children
            )}
          </NotificationProvider>
          </ConfirmProvider>
        </AiAssistantProvider>
      </body>
    </html>
  );
}
