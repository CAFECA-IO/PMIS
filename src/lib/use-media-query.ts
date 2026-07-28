"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * 訂閱 CSS media query 的結果。
 *
 * 以 useSyncExternalStore 實作，而非 useEffect + setState：
 * 避免在 effect 內同步設定狀態造成連鎖 render，並提供 SSR 快照。
 * 伺服器端一律回傳 false（無視窗可量測），由客戶端 hydrate 後校正。
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const mql = window.matchMedia(query);
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    },
    [query],
  );

  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false,
  );
}
