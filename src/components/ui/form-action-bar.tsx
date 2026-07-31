"use client";

import type { ReactNode } from "react";

import { cn } from "@/lib/utils";
import { DOCK_RESERVE } from "@/lib/faith-dock";
import { useAiAssistant } from "@/components/ai-assistant-context";

/**
 * 表單底部的動作列。
 *
 * 版面規則 ——
 * 主要動作靠右（長表單填到底才送出，動作在右下最順手），左側放提示與確認資訊。
 * 但右下角是費思的位置，所以動作列在**費思收合時**於右端讓出一塊保留區，
 * 按鈕往左移；費思展開時它是版面裡真正的一欄、不再浮在內容上，保留區即取消。
 *
 * 為何要做成共用元件而非各頁自己加 padding ——
 * 這個衝突的症狀（按鈕被蓋住）在程式碼裡完全看不出來，只有真的把畫面
 * 拉到那個寬度才會發現。集中在一處，之後新增的表單就不必再踩一次。
 */
export function FormActionBar({
  /** 左側提示或確認資訊（如「將建立 28 項履約事項」）。 */
  hint,
  /** 右側動作按鈕，依重要性由左至右排列，主要動作在最右。 */
  children,
  className,
}: {
  hint?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const { expanded } = useAiAssistant();

  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t px-4 py-3",
        className,
      )}
      // 收合時右端讓出費思的位置；展開時面板已是一欄，無需讓位
      style={expanded ? undefined : { paddingRight: DOCK_RESERVE }}
    >
      {hint ? (
        <div className="min-w-0 flex-1 text-xs text-muted-foreground">{hint}</div>
      ) : (
        <span className="flex-1" />
      )}
      <div className="flex shrink-0 items-center gap-3">{children}</div>
    </div>
  );
}
