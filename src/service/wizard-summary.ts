import {
  STEP_ORDER,
  stepLabel,
  type StepProgress,
  type WizardStepId,
} from "./wizard-steps";

/**
 * 解析結束後費思在對話中留下的總結（純函式，無 I/O）。
 *
 * 為何以確定性方式組出、而非再向模型要一段文字：
 *  1. 各段解析本身已回傳一句 note，那已是模型的說法，直接引用即可；
 *  2. 總結必須忠實反映實際結果（幾項、哪段失敗），不能由模型改寫或臆測；
 *  3. 不多花一次呼叫，也不會在最後一步又失敗一次。
 */

/**
 * 單段的實際成果判定。
 *
 * 刻意與「執行狀態」分離：模型呼叫成功（state = done）不代表擷取到東西。
 * 例如基本資料只抓到 2/11 欄、或履約事項回 0 項，都是執行成功但成果不足，
 * 若一律標記為完成就會出現「回報說全部完成、畫面卻多半空白」的矛盾。
 */
export type StepVerdict =
  | "complete" // 執行成功且成果完整
  | "partial" // 執行成功但只取得部分（有 total 且未取滿）
  | "empty" // 執行成功但完全沒有取得資料
  | "failed"
  | "skipped";

export function verdictOf(p: StepProgress): StepVerdict {
  if (p.state === "failed") return "failed";
  if (p.state === "skipped") return "skipped";
  if (p.state !== "done") return "empty";

  const count = p.count ?? 0;
  if (count === 0) return "empty";
  // 有分母時才談得上完整度；未取滿即為部分擷取
  if (p.total != null && count < p.total) return "partial";
  return "complete";
}

const MARK: Record<StepVerdict, string> = {
  complete: "✅",
  partial: "◐",
  empty: "⚠️",
  failed: "⚠️",
  skipped: "➖",
};

export type RunSummaryInput = {
  progress: StepProgress[];
  /** 各段模型附帶的一句話說明。 */
  notes?: Partial<Record<WizardStepId, string>>;
  /** 仍缺少的必填欄位標籤（如 專案編號）。 */
  missingRequired?: string[];
  /** 基本資料中所有仍為空的欄位標籤，供明確指出尚缺哪些。 */
  missingFields?: string[];
  /** 本次解析的檔名，用於開頭句。 */
  fileName?: string | null;
  /** 僅重跑了這些段落（單段重試）。 */
  only?: WizardStepId[];
};

const byId = (progress: StepProgress[], id: WizardStepId) =>
  progress.find((p) => p.id === id);

/** 單段的結果描述，如「履約事項 7 項」「專案基本資料 2/11（尚缺 9 欄）」。 */
function resultPhrase(p: StepProgress, verdict: StepVerdict): string {
  const label = stepLabel(p.id);
  const count = p.count ?? 0;

  if (verdict === "failed") return `${label} 未完成`;
  if (verdict === "skipped") return `${label} 略過`;
  if (verdict === "empty") {
    return p.total != null
      ? `${label} 0/${p.total}　未取得任何資料`
      : `${label} 未取得任何資料`;
  }
  if (verdict === "partial" && p.total != null) {
    return `${label} ${count}/${p.total}（尚缺 ${p.total - count} 項）`;
  }
  return p.total != null ? `${label} ${count}/${p.total}` : `${label} ${count} 項`;
}

/**
 * 組出 Markdown 總結。回傳空字串代表無事可報（例如完全沒跑）。
 */
export function summarizeRun(input: RunSummaryInput): string {
  const {
    progress,
    notes = {},
    missingRequired = [],
    missingFields = [],
    fileName,
    only,
  } = input;

  const ran = STEP_ORDER.map((id) => byId(progress, id)).filter(
    (p): p is StepProgress => Boolean(p) && p!.state !== "pending",
  );
  if (ran.length === 0) return "";

  const withVerdict = ran.map((p) => ({ p, v: verdictOf(p) }));
  const complete = withVerdict.filter((x) => x.v === "complete");
  const thin = withVerdict.filter((x) => x.v === "partial" || x.v === "empty");
  const failed = withVerdict.filter((x) => x.v === "failed");
  const skipped = withVerdict.filter((x) => x.v === "skipped");

  const lines: string[] = [];

  const scope = only?.length
    ? `已重新解析「${only.map(stepLabel).join("、")}」`
    : fileName
      ? `已解析 **${fileName}**`
      : "文件解析完成";

  // 開頭句必須與實際成果一致：呼叫成功但沒抓到東西，不能說「全部完成」
  if (failed.length === 0 && thin.length === 0) {
    lines.push(`${scope}，${ran.length} 個階段全部完成。`);
  } else if (complete.length === 0 && thin.length === 0) {
    lines.push(`${scope}，但各階段均未能取得資料。`);
  } else {
    const parts: string[] = [];
    if (complete.length) parts.push(`${complete.length} 個階段完整取得`);
    if (thin.length) parts.push(`${thin.length} 個階段資料不完整`);
    if (failed.length) parts.push(`${failed.length} 個階段未完成`);
    lines.push(`${scope}，${parts.join("、")}。`);
  }
  lines.push("");

  // 逐段結果，附上模型當時的說法
  for (const { p, v } of withVerdict) {
    const note = notes[p.id]?.trim();
    const detail =
      (v === "failed" || v === "skipped") && p.error
        ? `：${p.error}`
        : note
          ? `　${note}`
          : "";
    lines.push(`- ${MARK[v]} **${resultPhrase(p, v)}**${detail}`);
  }

  // 後續動作：明確講出使用者現在該做什麼
  const actions: string[] = [];

  const profile = withVerdict.find((x) => x.p.id === "profile");
  if (
    profile &&
    (profile.v === "partial" || profile.v === "empty") &&
    missingFields.length > 0
  ) {
    actions.push(`基本資料尚缺：**${missingFields.join("、")}**，請補填或告訴我。`);
  }

  if (thin.some((x) => x.p.id !== "profile")) {
    const names = thin
      .filter((x) => x.p.id !== "profile")
      .map((x) => stepLabel(x.p.id));
    actions.push(
      `「${names.join("、")}」擷取到的內容偏少，可能是文件未載明；可補充說明後點該段的**重新解析此段**。`,
    );
  }

  if (failed.length > 0) {
    actions.push(
      `「${failed.map((x) => stepLabel(x.p.id)).join("、")}」可在解析結果清單點**重新解析此段**，已取得的資料不會受影響。`,
    );
  }
  if (skipped.length > 0) {
    actions.push(
      `「${skipped.map((x) => stepLabel(x.p.id)).join("、")}」因缺少前置資料而略過，補齊後可再執行。`,
    );
  }
  if (missingRequired.length > 0) {
    actions.push(`建立專案前仍需補上：**${missingRequired.join("、")}**。`);
  }

  lines.push("");
  if (actions.length > 0) {
    for (const a of actions) lines.push(a);
  } else {
    lines.push("請核對內容後即可建立專案。");
  }

  return lines.join("\n");
}

/**
 * 進行中的一行狀態文字（顯示於暫時性的工作指示區，不寫入對話）。
 * 回傳 null 表示目前沒有正在執行的段落。
 */
export function activityLine(progress: StepProgress[]): string | null {
  const running = progress.find((p) => p.state === "running");
  if (!running) return null;
  const index = STEP_ORDER.indexOf(running.id) + 1;
  return `（${index}/${STEP_ORDER.length}）正在解析${stepLabel(running.id)}…`;
}
