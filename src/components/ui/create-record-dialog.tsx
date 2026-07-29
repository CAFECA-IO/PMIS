"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, Sparkles, UploadCloud, X, FileText } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-provider";
import { useNotification } from "@/components/ui/notification";
import { useAiAssistant } from "@/components/ai-assistant-context";
import { findAssistSpec, type FormAssistId } from "@/constant/form-assist";
import {
  fillSummary,
  offerCopy,
  planFill,
  type Patch,
} from "@/service/form-assist";
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

/**
 * 已詢問過的表單（本次瀏覽期間）。
 *
 * 放在模組層級而非元件狀態：對話框關閉即卸載，狀態會消失，
 * 使用者反覆開關同一表單就會被反覆詢問。改頁（client navigation）
 * 也不重置，符合「同一表單只問一次」。整頁重載才會歸零。
 *
 * 不另外記錄「已拒絕」：問過就不再問，兩者行為相同；
 * 想事後求助的人一律走表單內常駐的「請費思協助」。
 */
const asked = new Set<string>();

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
  const { notify } = useNotification();
  const { task, startTask, endTask, working, registerOffer } =
    useAiAssistant();
  const [open, setOpen] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const formRef = useRef<HTMLFormElement | null>(null);

  const spec = findAssistSpec(assistId);
  const aiTaskId = spec ? `form-assist:${spec.id}` : null;
  const assisting = aiTaskId != null && task?.id === aiTaskId;
  // 判讀期間表單淡化並停止輸入，避免與 AI 回填衝突
  const locked = assisting && working;

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

  /**
   * 讀出表單目前各欄位的值。
   *
   * 直接讀 DOM 而非維護一份 React state：本元件的欄位由各模組以 children
   * 自由提供且皆為非受控輸入（靠 FormData 送出）。要判斷「使用者是否已填」
   * 只能問 DOM，這也是唯一與所有呼叫端都相容的做法。
   */
  function currentValues(): Record<string, string> {
    const out: Record<string, string> = {};
    const form = formRef.current;
    if (!form || !spec) return out;
    for (const f of spec.fields) {
      const el = form.elements.namedItem(f.name);
      if (!el) continue;
      if (el instanceof HTMLInputElement && el.type === "checkbox") {
        out[f.name] = el.checked ? "on" : "";
      } else if (
        el instanceof HTMLInputElement ||
        el instanceof HTMLSelectElement ||
        el instanceof HTMLTextAreaElement
      ) {
        out[f.name] = el.value;
      }
    }
    return out;
  }

  /** 把費思判讀的值寫進表單。已填欄位不覆蓋（由 planFill 決定）。 */
  function applyPatch(patch: Patch, rejected: string[], reply?: string) {
    if (!spec) return;
    const plan = planFill(spec.fields, patch, currentValues());
    const form = formRef.current;

    for (const action of plan.fill) {
      const el = form?.elements.namedItem(action.name);
      if (el instanceof HTMLInputElement && el.type === "checkbox") {
        el.checked = action.value === "on";
      } else if (
        el instanceof HTMLInputElement ||
        el instanceof HTMLSelectElement ||
        el instanceof HTMLTextAreaElement
      ) {
        el.value = action.value;
      }
    }
    // 有寫入就算有未儲存變更，關閉時才會出現確認
    if (plan.fill.length > 0) setDirty(true);

    return fillSummary(plan, rejected, reply);
  }

  /** 把這張表單交給費思當助手。 */
  function handToFaith() {
    if (!spec || !aiTaskId) return;
    // 交給費思前先記為已詢問，避免助手回填後又跳出詢問
    asked.add(spec.id);

    startTask({
      id: aiTaskId,
      title: spec.title,
      greeting: [
        `好的，我來協助您填寫「${spec.title}」。`,
        "",
        spec.accept
          ? "您可以**上傳相關文件**（PDF、圖片、Word、Excel、PowerPoint、純文字），或直接用文字描述。"
          : "請用文字描述您要建立的內容。",
        "",
        `我會判讀出可對應的欄位並填入左側表單，共 ${spec.fields.length} 個欄位。**您已經填過的欄位我不會覆蓋。**`,
        "",
        "判讀結果請務必於表單上核對後再儲存。",
      ].join("\n"),
      endpoint: "/api/forms/assist",
      accept: spec.accept,
      buildBody: ({ messages, attachment }) => ({
        specId: spec.id,
        messages,
        attachment,
      }),
      // 回傳整理好的說明取代模型的 reply：只有這裡知道實際填了哪些欄位
      onResult: (data) => {
        const patch = (data.patch ?? {}) as Patch;
        const rejected = Array.isArray(data.rejected)
          ? (data.rejected as string[])
          : [];
        return applyPatch(
          patch,
          rejected,
          typeof data.reply === "string" ? data.reply : undefined,
        );
      },
    });
  }

  /*
    對話框開啟期間，向右下角的費思註冊協助入口 ——
    點費思等同啟動這張表單的代填，而不是開啟無關的一般問答。
    關閉時解除註冊，費思即回到一般待命。
  */
  useEffect(() => {
    if (!open || !spec || !aiTaskId) return;
    return registerOffer({
      taskId: aiTaskId,
      title: spec.title,
      start: () => handToFaith(),
    });
    // handToFaith 在本元件生命週期內穩定
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, spec?.id, aiTaskId, registerOffer]);

  /**
   * 開啟表單時主動詢問是否需要協助。
   *
   * 以彈出通知詢問而非直接接手：使用者可能只是要手動填兩個欄位，
   * 逕自展開費思並清空對話會打斷他。同一表單只問一次；
   * 按下通知的關閉鈕視為拒絕，之後不再詢問。
   */
  useEffect(() => {
    if (!open || !spec) return;
    // 費思已開啟而自動接手時不必再問
    if (assisting) return;
    if (asked.has(spec.id)) return;
    asked.add(spec.id);

    const copy = offerCopy(spec);
    notify({
      title: copy.title,
      description: copy.description,
      variant: "info",
      actionLabel: "好，交給費思",
      actionIcon: "sparkles",
      onAction: () => handToFaith(),
      // 比預設久一些：使用者剛打開表單，注意力還在左側欄位上
      duration: 12000,
    });
    // handToFaith 與 notify 在本元件生命週期內穩定，僅需在開啟時觸發一次
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, spec?.id, assisting]);

  /** 關閉表單時一併結束助手任務，費思不該停在一張已消失的表單上。 */
  useEffect(() => {
    if (open || !assisting) return;
    endTask();
  }, [open, assisting, endTask]);

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
