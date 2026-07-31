"use client";

import { useCallback, useEffect, useRef } from "react";

import { useNotification, type ToastHandle } from "@/components/ui/notification";
import { useAiAssistant } from "@/components/ai-assistant-context";

/**
 * 主動邀請費思協助某一張表單（共用邏輯）。
 *
 * 這段邏輯原本被抄了三份：專案建置頁、預警規則對話框、以及共用的表單助手。
 * 三份都要處理同樣四件事，而任何一份漏掉一項都會產生難以察覺的毛病：
 *
 *  1. 註冊右下角的入口 —— 點費思等同啟動這張表單的協助，而非開啟無關的問答。
 *  2. 每次出現只邀請一次 —— 否則每次 render 都跳一則通知。
 *  3. 表單離開畫面後重置 —— 下次開啟要重新邀請。先前記在模組層級，
 *     於是放棄建置再回來就再也不會被提議，而使用者往往正是因為手動填太慢
 *     才回來的。
 *  4. 被接手後撤回邀請 —— 邀請可從三個入口被接受（通知的按鈕、右下角的費思、
 *     費思已展開時的自動接手），只有第一個會自己關閉通知。漏掉這步，
 *     通知會留在畫面上邀請一件正在進行的事，按下去還會再啟動一次任務。
 *
 * 預警規則對話框先前就漏了第 4 項。集中一處，三邊都拿到相同行為。
 */
export function useFaithOffer({
  /** 任務識別，需與 startTask 時使用的 id 相同。 */
  taskId,
  /** 右下角狀態顯示的標題，如「專案建置」。 */
  title,
  /** 表單是否在畫面上（對話框開啟／頁面掛載）。 */
  active,
  /** 費思是否已接手這張表單。 */
  accepted,
  /** 啟動協助。 */
  start,
  /** 邀請通知的文案；未給則不主動邀請，只註冊右下角入口。 */
  invitation,
}: {
  taskId: string;
  title: string;
  active: boolean;
  accepted: boolean;
  start: () => void;
  invitation?: { title: string; description?: string };
}) {
  const { notify } = useNotification();
  const { registerOffer } = useAiAssistant();

  const toast = useRef<ToastHandle | null>(null);
  /** 本次出現是否已邀請過；表單離開畫面即重置。 */
  const asked = useRef(false);

  /*
    start 多以行內箭頭函式傳入，每次 render 都是新的識別。
    直接列入相依會讓註冊 effect 每次 render 解除再註冊一次，
    故以 ref 保存；寫入放在 effect 內（render 期間寫 ref 為 React 所禁）。
  */
  const startRef = useRef(start);
  useEffect(() => {
    startRef.current = start;
  }, [start]);

  /** 接受邀請：記為已問並啟動，避免接手後又跳出邀請。 */
  const accept = useCallback(() => {
    asked.current = true;
    startRef.current();
  }, []);

  // 表單在畫面上期間，向右下角的費思註冊協助入口
  useEffect(() => {
    if (!active) return;
    return registerOffer({ taskId, title, start: accept });
  }, [active, taskId, title, accept, registerOffer]);

  /**
   * 主動以通知邀請。
   *
   * 以通知詢問而非直接接手：使用者可能只是要手動填兩個欄位，
   * 逕自展開費思並清空對話會打斷他。
   */
  useEffect(() => {
    // 離開畫面即重置，下次出現重新邀請
    if (!active) {
      asked.current = false;
      return;
    }
    if (!invitation) return;
    // 費思已接手時不必再問，否則會在剛接手後立刻跳出邀請
    if (accepted) return;
    if (asked.current) return;
    asked.current = true;

    toast.current = notify({
      title: invitation.title,
      description: invitation.description,
      variant: "info",
      actionLabel: "好，交給費思",
      actionIcon: "sparkles",
      onAction: accept,
      // 比預設久一些：使用者剛打開表單，注意力還在欄位上
      duration: 12000,
    });
    // invitation 多為行內物件，僅需在出現與接手狀態變化時重跑
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, accepted, accept, notify]);

  /** 被接手或離開畫面後撤回邀請通知。 */
  useEffect(() => {
    if (active && !accepted) return;
    toast.current?.dismiss();
    toast.current = null;
  }, [active, accepted]);
}
