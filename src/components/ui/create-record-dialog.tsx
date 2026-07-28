"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Plus, UploadCloud, X, FileText } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-provider";
import { cn } from "@/lib/utils";

/**
 * 全站共用的「新建紀錄」元件（一致邏輯）：
 *  - 橘色新建按鈕（品牌主色）。
 *  - 點擊出現置中 Modal 表單（欄位由各模組以 children 提供）。
 *  - 可選的拖曳上傳區（檔案以 fileFieldName 併入 FormData）。
 *  - 表單下方固定「取消 / 儲存」。
 *  - 未儲存而關閉或離開頁面時，跳出 confirm 詢問。
 *
 * 各模組只需提供 action（server action）與表單欄位，即可獲得一致的新建體驗。
 */
export function CreateRecordDialog({
  title,
  action,
  children,
  triggerLabel = "新建",
  triggerVariant = "default",
  triggerSize = "default",
  submitLabel = "儲存",
  fileFieldName,
  fileAccept,
  fileRequired = false,
  fileMultiple = false,
  fileHint,
}: {
  title: string;
  action: (formData: FormData) => Promise<unknown> | unknown;
  children: ReactNode;
  triggerLabel?: string;
  triggerVariant?: "default" | "outline" | "secondary" | "ghost";
  triggerSize?: "default" | "sm";
  submitLabel?: string;
  fileFieldName?: string;
  fileAccept?: string;
  fileRequired?: boolean;
  fileMultiple?: boolean;
  fileHint?: string;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const [open, setOpen] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const fileLabel = (files: FileList) =>
    files.length > 1 ? `${files.length} 個檔案` : files[0]?.name ?? null;

  // 未儲存時，阻止整頁卸載（重新整理／關閉分頁／外部連結）
  useEffect(() => {
    if (!open || !dirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [open, dirty]);

  function reset() {
    setDirty(false);
    setSaving(false);
    setError(null);
    setFileName(null);
    setDragOver(false);
  }

  async function attemptClose() {
    if (dirty) {
      const ok = await confirm({
        title: "尚未儲存",
        description: "此表單有未儲存的內容，確定要放棄並關閉嗎？",
        confirmLabel: "放棄",
        cancelLabel: "繼續編輯",
        danger: true,
      });
      if (!ok) return;
    }
    setOpen(false);
    reset();
  }

  function pickFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    if (fileInputRef.current) fileInputRef.current.files = files;
    setFileName(fileLabel(files));
    setDirty(true);
  }

  async function submit(formData: FormData) {
    setSaving(true);
    setError(null);
    try {
      const res = await action(formData);
      // 若 action 回傳 { error }，視為驗證失敗：顯示訊息並保持開啟
      if (
        res &&
        typeof res === "object" &&
        "error" in res &&
        typeof (res as { error?: unknown }).error === "string" &&
        (res as { error: string }).error
      ) {
        setError((res as { error: string }).error);
        return;
      }
      setOpen(false);
      reset();
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Button
        type="button"
        variant={triggerVariant}
        size={triggerSize}
        onClick={() => setOpen(true)}
      >
        <Plus className="size-4" />
        {triggerLabel}
      </Button>

      {open && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
        >
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => void attemptClose()}
          />
          <div className="relative z-10 flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-xl border bg-card shadow-overlay">
            <div className="flex items-center justify-between border-b px-5 py-3">
              <h2 className="text-base font-semibold">{title}</h2>
              <button
                type="button"
                aria-label="關閉"
                onClick={() => void attemptClose()}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            </div>

            <form
              action={submit}
              onChange={() => setDirty(true)}
              className="flex min-h-0 flex-1 flex-col"
            >
              <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {children}
                </div>

                {fileFieldName && (
                  <div className="space-y-1">
                    <div
                      onClick={() => fileInputRef.current?.click()}
                      onDragOver={(e) => {
                        e.preventDefault();
                        setDragOver(true);
                      }}
                      onDragLeave={() => setDragOver(false)}
                      onDrop={(e) => {
                        e.preventDefault();
                        setDragOver(false);
                        pickFiles(e.dataTransfer.files);
                      }}
                      className={cn(
                        "flex cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed px-4 py-6 text-center text-sm transition-colors",
                        dragOver
                          ? "border-primary bg-primary/5"
                          : "border-input hover:bg-accent",
                      )}
                    >
                      {fileName ? (
                        <span className="flex items-center gap-2 font-medium">
                          <FileText className="size-4" />
                          {fileName}
                        </span>
                      ) : (
                        <>
                          <UploadCloud className="size-6 text-muted-foreground" />
                          <span className="text-muted-foreground">
                            拖曳檔案到此，或點擊選擇
                          </span>
                        </>
                      )}
                      {fileHint ? (
                        <span className="text-xs text-muted-foreground">
                          {fileHint}
                        </span>
                      ) : null}
                    </div>
                    <input
                      ref={fileInputRef}
                      type="file"
                      name={fileFieldName}
                      accept={fileAccept}
                      required={fileRequired}
                      multiple={fileMultiple}
                      className="hidden"
                      onChange={(e) => {
                        const files = e.target.files;
                        setFileName(files && files.length ? fileLabel(files) : null);
                        setDirty(true);
                      }}
                    />
                  </div>
                )}
              </div>

              {error ? (
                <div className="mx-5 mb-1 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {error}
                </div>
              ) : null}

              <div className="flex items-center justify-end gap-2 border-t px-5 py-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void attemptClose()}
                  disabled={saving}
                >
                  取消
                </Button>
                <Button type="submit" disabled={saving}>
                  {saving ? "儲存中…" : submitLabel}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
