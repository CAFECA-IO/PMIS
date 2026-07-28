import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Sidebar } from "@/components/sidebar";
import { AppHeader } from "@/components/app-header";
import { ShellProvider } from "@/components/shell-context";
import { AiPanel } from "@/components/ai-panel";
import { NotificationProvider } from "@/components/ui/notification";
import { ConfirmProvider } from "@/components/ui/confirm-provider";
import { AiAssistantProvider } from "@/components/ai-assistant-context";
import { getCurrentUser } from "@/service/auth.service";
import {
  getUserModulePermissions,
  accessibleRoutes,
} from "@/service/access.service";
import { listProjectOptions } from "@/service/project.service";
import { listNotifications } from "@/service/notification.service";
import { markReadAction, togglePinAction } from "@/app/notifications/actions";

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
  const allowedRoutes = user
    ? accessibleRoutes(await getUserModulePermissions(user))
    : [];
  const projectOptions = user
    ? await listProjectOptions({ id: user.id, role: user.role })
    : [];
  // 系統通知常駐於側邊欄，於版面層取一次即可
  const notifications = user
    ? await listNotifications()
    : { pinned: [], inbox: [], unreadCount: 0 };

  return (
    <html
      lang="zh-Hant"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      {/* 視窗寬於 1680px 時，介面兩側的留白以較暗底色襯托置中的操作區 */}
      <body className="h-full overflow-hidden bg-muted/40">
        <AiAssistantProvider>
          <ConfirmProvider>
          <NotificationProvider>
            {user ? (
              /*
                大螢幕可讀性：整個操作介面（側邊欄 + 內容）最寬 1680px，
                視窗更寬時停止延展並置中，兩側留白由 body 底色填滿。
              */
              <ShellProvider>
                <div className="mx-auto flex h-screen w-full max-w-[1680px] border-x bg-background">
                  <Sidebar
                    allowedRoutes={allowedRoutes}
                    projects={projectOptions}
                  />
                  {/* 內容欄：頂列常駐於上，內容於下捲動 */}
                  <div className="flex min-w-0 flex-1 flex-col">
                    <AppHeader
                      user={{
                        name: user.name,
                        email: user.email,
                        role: user.role,
                      }}
                      notifications={[
                        ...notifications.pinned,
                        ...notifications.inbox,
                      ]}
                      onMarkRead={markReadAction}
                      onTogglePin={togglePinAction}
                    />
                    <main className="min-w-0 flex-1 overflow-y-auto bg-background">
                      {children}
                    </main>
                  </div>
                  <AiPanel />
                </div>
              </ShellProvider>
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
