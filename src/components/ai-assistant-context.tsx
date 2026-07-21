"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

/**
 * Info: (20260721 - Luphia)
 * 浮動 AI 助理的開合狀態共享，讓其他 UI（如通知氣泡）可依助理卡是否展開而調整。
 */
const AiAssistantContext = createContext<{
  expanded: boolean;
  setExpanded: (v: boolean) => void;
} | null>(null);

export function useAiAssistant() {
  const ctx = useContext(AiAssistantContext);
  if (!ctx) {
    throw new Error("useAiAssistant 必須在 AiAssistantProvider 內使用");
  }
  return ctx;
}

export function AiAssistantProvider({ children }: { children: ReactNode }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <AiAssistantContext.Provider value={{ expanded, setExpanded }}>
      {children}
    </AiAssistantContext.Provider>
  );
}
