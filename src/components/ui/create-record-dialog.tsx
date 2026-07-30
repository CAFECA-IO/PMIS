"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, Sparkles, UploadCloud, X, FileText } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-provider";
import { useFormAssist } from "@/components/use-form-assist";
import type { FormAssistId } from "@/constant/form-assist";
import { cn } from "@/lib/utils";

/**
 * 全站共用的「新建紀錄」元件（一致邏輯）：
 *  - 橘色新建按鈕（品牌主色）。
 *  - 點擊出現置中 Modal 表單（欄位由各模組以 children 提供）。
 *  - 可選的拖曳上傳區（檔案以 fileFieldName 併入 FormData）。
 *  - 表單下方固定「取消 / 儲存」。
 *  - 未儲存而關閉或離開頁面時，跳出 confirm 詢問。
 *  - 給定 assistId 時，開啟表單即主動詢問是否要費思代填（見下）。
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
  assistId,
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
  /** 給定時啟用費思表單助手；欄位規格由 constant/form-assist 依此 id 查表。 */
  assistId?: FormAssistId;
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
  const formRef = useRef<HTMLFormElement | null>(null);

  // 費思表單助手：主動詢問、右下角入口、判讀期間鎖定，與細節頁共用同一套
  const { spec, assisting, locked, handToFaith } = useFormAssist({
    assistId,
    active: open,
    formRef,
    // 有寫入就算有未儲存變更，關閉時才會出現確認
    onFilled: () => setDirty(true),
  });

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
              ref={formRef}
              action={submit}
              onChange={() => setDirty(true)}
              className="flex min-h-0 flex-1 flex-col"
            >
              <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
                {/* 助手狀態列：未啟用時提供入口，判讀中則說明表單為何鎖住 */}
                {spec ? (
                  <div
                    className={cn(
                      "flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-xs",
                      locked
                        ? "border-primary/40 bg-primary/5"
                        : "border-dashed",
                    )}
                  >
                    <span
                      className="flex items-center gap-1.5 text-muted-foreground"
                      role="status"
                      aria-live="polite"
                    >
                      {locked ? (
                        <>
                          <Loader2 className="size-3.5 shrink-0 animate-spin text-primary" />
                          費思正在判讀，表單暫時鎖定，請於右側對話操作
                        </>
                      ) : assisting ? (
                        <>
                          <Sparkles className="size-3.5 shrink-0 text-primary" />
                          費思正在協助此表單，可於右側對話上傳文件或描述內容
                        </>
                      ) : (
                        <>
                          <Sparkles className="size-3.5 shrink-0" />
                          可讓費思讀取文件代填欄位
                        </>
                      )}
                    </span>
                    {!assisting ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handToFaith}
                      >
                        <Sparkles className="size-3.5" />
                        請費思協助
                      </Button>
                    ) : null}
                  </div>
                ) : null}

                {/*
                  判讀期間淡化並停止輸入：使用者與 AI 同時寫入同一欄位會互相
                  覆蓋，且此時的注意力應在右側對話。inert 一併移出 tab 順序。
                */}
                <div
                  inert={locked}
                  className={cn(
                    "grid grid-cols-1 gap-3 transition-opacity duration-200 sm:grid-cols-2",
                    locked && "pointer-events-none opacity-40",
                  )}
                >
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
                <Button type="submit" disabled={saving || locked}>
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
