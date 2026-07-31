"use client";

import { useCallback, useEffect, useRef, type RefObject } from "react";

import { useAiAssistant } from "@/components/ai-assistant-context";
import { useFaithOffer } from "@/components/use-faith-offer";
import { findAssistSpec, type FormAssistId } from "@/constant/form-assist";
import {
  fillSummary,
  offerCopy,
  planFill,
  type Patch,
} from "@/service/form-assist";

/**
 * 把一張表單交給費思當助手（共用邏輯）。
 *
 * originally 只存在於 CreateRecordDialog 裡。履約事項細節頁也需要同一套
 * 行為（主動詢問一次、註冊右下角入口、判讀期間鎖定、已填欄位不覆蓋），
 * 抽出來共用而非複製一份 —— 這段邏輯的細節（例如「問過就不再問」要跨
 * 元件卸載保留）光看程式碼不明顯，兩份實作必然漂移。
 */

export type FormAssist = {
  /** 欄位規格；未指定 assistId 時為 null。 */
  spec: ReturnType<typeof findAssistSpec>;
  /** 費思目前是否正在協助這張表單。 */
  assisting: boolean;
  /** 判讀期間應淡化並鎖定表單。 */
  locked: boolean;
  /** 手動把表單交給費思。 */
  handToFaith: () => void;
};

export function useFormAssist({
  assistId,
  active,
  formRef,
  onFilled,
  offer = true,
}: {
  assistId?: FormAssistId;
  /** 表單目前是否在畫面上（對話框開啟／頁面掛載）。 */
  active: boolean;
  formRef: RefObject<HTMLFormElement | null>;
  /** 實際寫入欄位後的回呼（如標記為有未儲存變更）。 */
  onFilled?: (count: number) => void;
  /**
   * 是否主動以通知詢問。
   *
   * 編輯既有紀錄時，若所有欄位都已有值，費思能填的是零個 ——
   * 此時詢問只是噪音，呼叫端可傳 false 關掉主動詢問，
   * 但表單內的「請費思協助」按鈕仍然可用。
   */
  offer?: boolean;
}): FormAssist {
  const { task, startTask, endTask, working } = useAiAssistant();

  const spec = findAssistSpec(assistId);
  const aiTaskId = spec ? `form-assist:${spec.id}` : null;
  const assisting = aiTaskId != null && task?.id === aiTaskId;
  const locked = assisting && working;

  /*
    呼叫端多以行內箭頭函式傳入 onFilled，每次 render 都是新的識別。
    直接列入相依會讓下方的註冊 effect 每次 render 解除再註冊一次，
    故以 ref 保存；寫入放在 effect 內（render 期間寫 ref 為 React 所禁）。
  */
  const onFilledRef = useRef(onFilled);
  useEffect(() => {
    onFilledRef.current = onFilled;
  }, [onFilled]);

  /**
   * 讀出表單目前各欄位的值。
   *
   * 直接讀 DOM 而非維護一份 React state：表單欄位由各呼叫端自由提供且
   * 皆為非受控輸入（靠 FormData 送出）。要判斷「使用者是否已填」
   * 只能問 DOM，這也是唯一與所有呼叫端都相容的做法。
   */
  const currentValues = useCallback((): Record<string, string> => {
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
  }, [formRef, spec]);

  /** 把費思判讀的值寫進表單。已填欄位不覆蓋（由 planFill 決定）。 */
  const applyPatch = useCallback(
    (patch: Patch, rejected: string[], reply?: string) => {
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
      if (plan.fill.length > 0) onFilledRef.current?.(plan.fill.length);

      return fillSummary(plan, rejected, reply);
    },
    [currentValues, formRef, spec],
  );

  const handToFaith = useCallback(() => {
    if (!spec || !aiTaskId) return;

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
  }, [aiTaskId, applyPatch, spec, startTask]);

  /*
    邀請與右下角入口交由共用 hook：註冊入口、每次出現只邀請一次、
    離開後重置、被接手後撤回通知。三個呼叫端行為因此一致。
  */
  useFaithOffer({
    taskId: aiTaskId ?? "form-assist:none",
    title: spec?.title ?? "",
    active: active && Boolean(spec),
    accepted: assisting,
    start: handToFaith,
    invitation: offer && spec ? offerCopy(spec) : undefined,
  });

  /** 表單離開畫面時一併結束助手任務，費思不該停在一張已消失的表單上。 */
  useEffect(() => {
    if (active || !assisting) return;
    endTask();
  }, [active, assisting, endTask]);

  return { spec, assisting, locked, handToFaith };
}
