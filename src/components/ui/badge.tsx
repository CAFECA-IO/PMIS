import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";
import type { BadgeVariant } from "@/constant/badge";

/**
 * 標籤是「資訊」而非「行動」，因此一律低調：中性灰或低彩度底色。
 * 只有 destructive（需要立即處理）保留填滿高彩度，讓它在畫面上是唯一的紅點。
 * 品牌橘留給按鈕與連結等可操作元素，不用在標籤上。
 */
const badgeVariants = cva(
  "inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium w-fit whitespace-nowrap",
  {
    variants: {
      variant: {
        // 需強調但非緊急：僅以品牌色描邊與文字，不填滿
        default: "border-primary/30 bg-transparent text-primary",
        secondary: "border-transparent bg-secondary text-secondary-foreground",
        // 唯一的填滿高彩度：逾期、失敗、嚴重
        destructive: "border-transparent bg-destructive text-white",
        outline: "border-border bg-transparent text-muted-foreground",
        success: "border-transparent bg-success-soft text-success",
        warning: "border-transparent bg-warning-soft text-warning",
        info: "border-transparent bg-info-soft text-info",
        muted: "border-transparent bg-muted text-muted-foreground",
        // satisfies：漏掉任一 variant 會在編譯期報錯，避免型別與樣式漂移
      } satisfies Record<BadgeVariant, string>,
    },
    defaultVariants: {
      variant: "muted",
    },
  },
);

function Badge({
  className,
  variant,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return (
    <span className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
