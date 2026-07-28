"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

/**
 * 外殼狀態共享。
 *
 * 手機版的選單開合由 header 的漢堡鈕觸發、由 sidebar 的抽屜呈現，
 * 兩者是不同元件，故把狀態提到 context 而非各自持有。
 */
type Ctx = {
  navOpen: boolean;
  setNavOpen: (v: boolean) => void;
  toggleNav: () => void;
};

const ShellContext = createContext<Ctx | null>(null);

export function useShell() {
  const ctx = useContext(ShellContext);
  if (!ctx) throw new Error("useShell 必須在 ShellProvider 內使用");
  return ctx;
}

export function ShellProvider({ children }: { children: ReactNode }) {
  const [navOpen, setNavOpen] = useState(false);
  const toggleNav = useCallback(() => setNavOpen((v) => !v), []);
  const value = useMemo(
    () => ({ navOpen, setNavOpen, toggleNav }),
    [navOpen, toggleNav],
  );
  return (
    <ShellContext.Provider value={value}>{children}</ShellContext.Provider>
  );
}
