"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FolderInput, Loader2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn, formatDate } from "@/lib/utils";
import { assignUploadsToProjectAction } from "../actions";

export type UnassignedUpload = {
  id: string;
  fileName: string;
  size: number;
  taskTitle: string | null;
  createdAt: string;
};

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * 專案建立後的提示：使用者可能在建置前就用一般對話上傳過相關文件，
 * 那些檔案仍是「未指派」。此處列出並讓使用者選擇是否一併歸入本專案。
 *
 * 刻意預設「不勾選」：目前尚無取消歸屬的介面，一次全搬若搬錯不易復原。
 * 檔名、來源任務與上傳時間都列出，讓使用者自行判斷相關性。
 */
export function UnassignedUploadsPrompt({
  projectId,
  uploads,
}: {
  projectId: string;
  uploads: UnassignedUpload[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [dismissed, setDismissed] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [result, setResult] = useState<string | null>(null);

  if (dismissed || uploads.length === 0) return null;

  const allSelected = selected.size === uploads.length;

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(uploads.map((u) => u.id)));
  }

  function submit() {
    if (selected.size === 0) return;
    startTransition(async () => {
      const r = await assignUploadsToProjectAction(projectId, [...selected]);
      if (!r.ok) {
        setResult(r.error ?? "歸屬失敗。");
        return;
      }
      setResult(`已將 ${r.assigned} 個檔案歸入本專案。`);
      setSelected(new Set());
      router.refresh();
      // 全部處理完就收起提示
      if (r.assigned >= uploads.length) setDismissed(true);
    });
  }

  return (
    <Card className="border-primary/40">
      <CardContent className="space-y-3 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-sm font-medium">
              <FolderInput className="size-4 text-primary" />
              您還有 {uploads.length} 個未指派的費思上傳檔案
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              若其中有屬於本專案的文件，可勾選後一併歸入；未勾選者維持未指派，
              之後仍可在檔案管理查閱。
            </p>
          </div>
          <button
            type="button"
            aria-label="關閉提示"
            onClick={() => setDismissed(true)}
            className="shrink-0 text-muted-foreground hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="divide-y rounded-md border">
          {uploads.map((u) => (
            <label
              key={u.id}
              className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm transition-colors hover:bg-muted/50"
            >
              <input
                type="checkbox"
                checked={selected.has(u.id)}
                onChange={() => toggle(u.id)}
                className="size-4 shrink-0 rounded border-input"
              />
              <span className="min-w-0 flex-1 truncate font-medium">
                {u.fileName}
              </span>
              <span className="shrink-0 text-xs text-muted-foreground">
                {u.taskTitle ?? "一般對話"}
              </span>
              <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                {formatDate(u.createdAt)}
              </span>
              <span className="w-16 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                {formatSize(u.size)}
              </span>
            </label>
          ))}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            onClick={toggleAll}
            className="text-xs font-medium text-primary hover:underline"
          >
            {allSelected ? "取消全選" : "全選"}
          </button>
          <div className="flex items-center gap-3">
            {result ? (
              <span className="text-xs text-muted-foreground">{result}</span>
            ) : null}
            <Button
              type="button"
              size="sm"
              onClick={submit}
              disabled={selected.size === 0 || pending}
            >
              {pending ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <FolderInput className="size-3.5" />
              )}
              歸入本專案
              {selected.size > 0 ? (
                <span className={cn("ml-0.5 tabular-nums")}>
                  ({selected.size})
                </span>
              ) : null}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
