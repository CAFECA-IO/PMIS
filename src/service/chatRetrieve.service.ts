import * as faith from "@/service/faith.service";
import type { FaithAttachment, FaithMessage } from "@/service/faith.service";
import {
  applyBudget,
  contextBlock,
  datasetIds,
  describeManifest,
  planSummary,
  resolvePlan,
  retrievalNote,
  type ContextSection,
} from "@/service/chat-retrieval";
import {
  buildProjectManifest,
  loadDatasets,
  loadFiles,
  type ChatViewer,
} from "@/service/chatContext.service";

/**
 * 對話檢索的編排：清冊 → 規劃 → 讀取 → 交還給回答那一段。
 *
 * 整段刻意設計成「失敗就當沒檢索」——
 * 檢索是為了讓回答有依據，不是回答的前提。清冊建不起來、規劃解析不了、
 * 檔案讀不到，都應該讓對話照常進行，而不是回一個錯誤給使用者。
 * 唯一不能妥協的是誠實：讀不到就要在來源說明裡寫出來。
 */

export type Retrieval = {
  /** 注入回答那一輪的文字上下文。 */
  context?: string;
  /** 以原檔交模型判讀的附件。 */
  attachments?: FaithAttachment[];
  /** 附在回答下方的來源說明；沒讀任何東西時為 null。 */
  note: string | null;
  /** 紀錄用的一行摘要。 */
  log: string;
};

const NOTHING: Retrieval = { note: null, log: "未檢索" };

/**
 * 外部依賴以參數注入。
 *
 * 不是為了抽象而抽象：清冊與載入都要打資料庫，若寫死在函式裡，
 * 這段編排（規劃解讀、上限套用、失敗回報）就只能靠實際資料庫才驗得到，
 * 而那正是最容易出錯、也最該有測試的部分。
 */
export type RetrieveDeps = {
  manifest: typeof buildProjectManifest;
  loadFiles: typeof loadFiles;
  loadDatasets: typeof loadDatasets;
  plan: typeof faith.planRetrieval;
};

const DEFAULT_DEPS: RetrieveDeps = {
  manifest: buildProjectManifest,
  loadFiles,
  loadDatasets,
  plan: faith.planRetrieval,
};

/** 取最後一則使用者訊息作為要規劃的問題。 */
function questionOf(messages: FaithMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role === "user" && m.text.trim()) return m.text.trim();
  }
  return "";
}

/**
 * 依當下專案決定要不要讀資料，並把讀到的內容備好。
 *
 * @param projectId 目前鎖定的專案；未鎖定時直接不檢索（跨全部專案的檢索
 *   會讓答案混入別案的數字，比不檢索更糟）
 */
export async function retrieveForChat(
  input: {
    projectId: string | null | undefined;
    messages: FaithMessage[];
    viewer: ChatViewer;
  },
  deps: RetrieveDeps = DEFAULT_DEPS,
): Promise<Retrieval> {
  const projectId = input.projectId?.trim();
  if (!projectId) return { note: null, log: "未鎖定專案，不檢索" };

  const question = questionOf(input.messages);
  if (!question) return NOTHING;

  let manifest;
  try {
    manifest = await deps.manifest(projectId, input.viewer);
  } catch {
    return { note: null, log: "清冊建立失敗" };
  }
  if (!manifest) return { note: null, log: "無權存取此專案，不檢索" };
  if (manifest.files.length === 0 && manifest.datasets.length === 0) {
    return { note: null, log: "本專案無可調閱資料" };
  }

  // 規劃失敗一律退回一般對話：多花一次呼叫的成本，勝過整段對話報錯
  let raw = null;
  try {
    raw = await deps.plan({
      question,
      manifest: describeManifest(manifest),
      datasetIds: datasetIds(manifest.datasets),
    });
  } catch {
    return { note: null, log: "檢索規劃失敗，退回一般對話" };
  }

  const plan = resolvePlan(manifest, raw);
  const budgeted = applyBudget(plan);
  if (!plan.needed) return { note: null, log: planSummary(plan, budgeted) };

  const [files, sets] = await Promise.all([
    deps.loadFiles(budgeted, input.viewer),
    deps.loadDatasets(budgeted, projectId, input.viewer),
  ]);

  const sections: ContextSection[] = [...files.sections, ...sets.sections];
  const context = contextBlock(sections) ?? undefined;
  const failed = [...files.failed, ...sets.failed];

  // 讀取失敗的部分要接到來源說明後面，否則使用者會以為那些也讀了
  const base = retrievalNote(budgeted);
  const note =
    failed.length > 0
      ? [base, `讀取失敗：${failed.map((f) => `${f.name}（${f.why}）`).join("、")}`]
          .filter(Boolean)
          .join("｜")
      : base;

  return {
    context,
    attachments: files.attachments.length > 0 ? files.attachments : undefined,
    note,
    log: `${planSummary(plan, budgeted)}｜注入 ${sections.length} 段${
      failed.length > 0 ? `｜失敗 ${failed.length}` : ""
    }`,
  };
}
