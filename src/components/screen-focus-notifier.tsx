"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

import { useNotification } from "@/components/ui/notification";

/**
 * On every screen change, fetches the current screen's key points from the API
 * and surfaces them as a chat-bubble notification. Renders nothing itself.
 */
export function ScreenFocusNotifier() {
  const pathname = usePathname();
  const { notify } = useNotification();
  const lastRoute = useRef<string | null>(null);

  useEffect(() => {
    if (!pathname || pathname === "/login") return;
    if (lastRoute.current === pathname) return;
    lastRoute.current = pathname;

    const controller = new AbortController();
    (async () => {
      try {
        const res = await fetch(
          `/api/screen-focus?route=${encodeURIComponent(pathname)}`,
          { signal: controller.signal },
        );
        if (!res.ok) return;
        const data = (await res.json()) as { label?: string; text?: string };
        if (data.text) {
          notify({
            variant: "info",
            title: data.label ?? "畫面重點",
            description: data.text,
            duration: 8000,
          });
        }
      } catch {
        // navigation should never be blocked by this; ignore fetch/abort errors
      }
    })();

    return () => controller.abort();
  }, [pathname, notify]);

  return null;
}
