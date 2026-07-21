"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

import { useNotification } from "@/components/ui/notification";

/**
 * Info: (20260721 - Luphia)
 * 每次切換畫面時向 API 取得當前畫面重點，並以對話氣泡通知呈現；本身不渲染內容。
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
        // Info: (20260721 - Luphia) 不應因此阻擋導航；忽略 fetch/abort 錯誤
      }
    })();

    return () => controller.abort();
  }, [pathname, notify]);

  return null;
}
