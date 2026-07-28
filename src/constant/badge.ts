/**
 * 標籤樣式的單一定義（與 components/ui/badge.tsx 的 variants 對應）。
 *
 * 強調層級由弱到強：
 *   outline / muted / secondary  分類資訊，中性灰
 *   success / warning / info     有狀態意義，低彩度底色
 *   default                      需留意但不緊急，品牌色描邊
 *   destructive                  唯一填滿高彩度，只給需要立即處理的事
 */
export type BadgeVariant =
  | "default"
  | "secondary"
  | "destructive"
  | "outline"
  | "success"
  | "warning"
  | "info"
  | "muted";

export type BadgeMeta = { label: string; variant: BadgeVariant };
