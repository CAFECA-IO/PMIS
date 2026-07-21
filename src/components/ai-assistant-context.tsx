"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

/** Shared open/close state for the floating AI 助理, so other UI (e.g. the
 * notification bubbles) can react to whether the assistant card is expanded. */
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
