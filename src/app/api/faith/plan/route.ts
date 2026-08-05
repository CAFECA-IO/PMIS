import { NextResponse } from "next/server";

import * as faith from "@/service/faith.service";
import type { FaithMessage, ResponseSchema } from "@/service/faith.service";
import * as projectService from "@/service/project.service";
import * as designService from "@/service/designVersion.service";
import { getCurrentUser } from "@/service/auth.service";
import { withLogContext } from "@/service/faithLog.service";
import { toFaithError } from "@/service/faith-error";

export const runtime = "nodejs";

/**
 * 費思・3D 施工設計生成（串流、分段回報進度）。
 *
 * 使用者在 3D 工程視覺頁不選擇專案，改由目前鎖定的專案提供資訊。
 * 本端點於伺服器端讀取該專案，並把「生成」拆成數個小步驟逐一回報：
 *   1) 讀取專案資訊  2) 規劃工程分項  3) 規劃時程里程碑  4) 整合施工設計
 * 前端據事件顯示目前進度與各步驟耗時，最後以 result 事件交付完整設計。
 *
 * 這是設計輔助，不寫入資料庫；定案後由「專案建置」流程正式建立分項。
 */

type Body = {
  messages?: FaithMessage[];
  projectId?: string | null;
  /**
   * revise：基於 baseVersion 那一版繼續修改（保留其風格與結構）。
   * new：完全重做，不參考任何既有版本。
   */
  mode?: "new" | "revise";
  /** 修訂基礎的版號；mode 為 revise 時必要，找不到則退回從零生成。 */
  baseVersion?: number | null;
  conversationId?: string;
  turnId?: string;
};

const S = (description: string) => ({ type: "STRING", description });
const KIND_ENUM = ["wall", "dredge", "pipe", "generic"];

const WORKITEMS_SCHEMA: ResponseSchema = {
  type: "OBJECT",
  properties: {
    reply: S("一兩句繁體中文說明本次設計的重點與依據"),
    workItems: {
      type: "ARRAY",
      description: "施工設計的工程分項，依施工先後排序",
      items: {
        type: "OBJECT",
        properties: {
          name: S("工程分項名稱"),
          category: S("類別，如 結構、土方、管線、假設工程"),
          kind: {
            type: "STRING",
            enum: KIND_ENUM,
            description:
              "3D 表現類型：wall=護岸/擋土/結構牆體、dredge=疏濬/土方開挖、pipe=管線/涵管、generic=其他",
          },
          unit: S("計量單位，如 m、m3、式、座；不確定留空"),
          quantity: S("概估數量（字串，可含約略描述）；不確定留空"),
          start: S("預定開始 YYYY-MM 或 YYYY-MM-DD"),
          end: S("預定完成 YYYY-MM 或 YYYY-MM-DD"),
          note: S("施工要點或與動畫流程的對應說明，一句"),
        },
        required: ["name", "kind"],
        propertyOrdering: ["name", "category", "kind", "unit", "quantity", "start", "end", "note"],
      },
    },
  },
  required: ["workItems"],
  propertyOrdering: ["workItems", "reply"],
};

const MILESTONES_SCHEMA: ResponseSchema = {
  type: "OBJECT",
  properties: {
    milestones: {
      type: "ARRAY",
      description: "時程里程碑，依期限先後排序",
      items: {
        type: "OBJECT",
        properties: {
          title: S("里程碑名稱"),
          phase: S("所屬施工階段"),
          dueDate: S("預定達成日 YYYY-MM 或 YYYY-MM-DD"),
          weight: { type: "INTEGER", description: "進度權重（正整數，全部相加宜接近 100）" },
          note: S("認定或查核重點，一句"),
        },
        required: ["title"],
        propertyOrdering: ["title", "phase", "dueDate", "weight", "note"],
      },
    },
  },
  required: ["milestones"],
  propertyOrdering: ["milestones"],
};

const ITEMS_INSTRUCTION = `你是「PMIS 智慧監造管理系統」的工程施工設計助理。使用者正在檢視某工程專案的 3D 施工動畫，希望你「從零」讀取專案資訊後規劃工程分項。

請根據專案資訊規劃**工程分項**：
- 先讀「工程摘要」與「關鍵要求重點」——這兩項是本案的實際條件，規劃須據以展開。關鍵要求若指定了施工方式（分段、分區、停工期間、指定工法），分項的拆法與起訖日期都要與之相符（例如要求分兩段施工，就拆成兩段分項）。
- 把工程拆解為具體、可施作的工程分項（如假設工程、基礎、主體結構、附屬、清理復原），並補上必要但未明列的工項（交通維持、環境保護等）。
- 每一項務必標註 kind（wall／dredge／pipe／generic）供 3D 動畫表現：護岸/擋土/結構/混凝土牆體→wall；疏濬/清淤/土方/開挖→dredge；管線/涵管/排水路管→pipe；其餘→generic。
- 尊重使用者在對話中補充的條件（如汛期停工、分段施工）。日期須落在專案開工與竣工區間內。
- 繁體中文；不確定的數量與日期留空，勿杜撰。僅輸出 JSON。`;

const SCHEDULE_INSTRUCTION = `你是「PMIS 智慧監造管理系統」的工程時程規劃助理。已有一份工程分項清單，請據以規劃**時程里程碑**：
- 里程碑對應關鍵完工節點（如各主要分項完成、通水、竣工驗收），依期限先後排序。
- 期限須落在專案開工與竣工區間內，並與工程分項的起訖一致。
- 權重為正整數、總和宜接近 100。繁體中文；不確定的日期留空。僅輸出 JSON。`;

/**
 * 第三段：把施工設計畫成一份自成一體的 3D 動畫網頁。
 *
 * 產出會以 iframe（sandbox）嵌入頁面，故要求「單一 HTML、不依賴外部狀態」。
 * 明確禁止對外通訊與儲存 API：沙箱本來就會阻擋，但把規則寫進提示詞，
 * 模型才不會產出一堆被擋掉、看起來像壞掉的程式碼。
 */
const HTML_INSTRUCTION = `你是資深 WebGL 視覺化工程師，專長是工程施工的**數位孿生（digital twin）**。請依提供的工程專案與施工設計（JSON），產生**一份完整、自成一體的 HTML 檔案**，以 3D 動畫模擬真實世界的施工過程。

數位孿生要求（最重要）：
- 這不是抽象圖示，而是要**盡可能貼近真實工地**：依「工程摘要」與「關鍵要求重點」還原現地條件與施工方式。
- 場景須具備可辨識的真實構件：地形與現況地物、施工中的結構本體、施工機具（挖土機／吊車／卡車等，依工項性質選用）、施工便道、圍籬與交通維持設施、必要的假設工程（支撐、擋土、鷹架、圍堰）。
- **嚴格遵守「關鍵要求重點」**：例如載明分段施工就要看得出分段順序與界線；載明汛期停工，該期間河道內就不應有施工活動（動畫應停頓或撤離機具）；載明鄰房保護就要出現擋土支撐或監測設施；載明交通維持就要有改道或半半施工。這些條件是模擬是否寫實的關鍵，不可忽略。
- 施工要呈現**過程**而非只有結果：構件依施工順序逐段／逐層生成，機具跟隨施工前緣移動並有作業動作，土方開挖與回填、材料進場都應看得出來。
- 比例與尺度盡量依實際數量（如長度 1,800 m、土方 42,000 m³）換算，讓畫面比例接近真實；標註主要尺寸。
- 加入基本環境感：天空或環境光、陰影、水體（若有）、必要的植被或鄰近建物輪廓，讓場景像一個真實地點而非空白平面。

技術要求：
- 單一 HTML 檔，包含所有 CSS 與 JavaScript；不可拆檔。
- 使用 Three.js r128，且只能從此網址載入：https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js
- 不得使用 THREE.CapsuleGeometry（r128 沒有），不得使用 OrbitControls（未隨該檔提供）；需要滑鼠旋轉／縮放請自行以 pointer 與 wheel 事件實作。
- 不得使用 localStorage、sessionStorage、cookie、fetch、XMLHttpRequest 或任何對外請求（CDN 的 Three.js 除外）；不得試圖存取 parent 或 top window。
- 版面自適應（監聽 resize，使用 100% 寬高），背景深色（#0b1220），不要有外距造成的滾動條。

內容要求：
- 依施工分項的 kind 表現：wall=沿渠道兩岸逐段升起的護岸牆體、dredge=河床淤泥逐段移除並加深、pipe=管線／涵管敷設、generic=區塊式構造物。
- 依每項的預定起訖換算時間軸位置，讓各分項在自己的施工期間內生長；里程碑在時間軸上以標記呈現，達成時點亮。
- 內建時間軸播放控制：播放／暫停鈕、可拖曳的進度軸、里程碑標記、目前日期與當前施工階段名稱、以及 0.5×／1×／2× 速度切換。
- 畫面上以繁體中文標示專案名稱、目前階段與日期；並在角落列出正在施作的分項名稱。
- 若有 dredge 類分項，疏濬完成後應可看出水位恢復與水流往下游流動（通水）。
- 若「關鍵要求重點」含停工期間，時間軸上該區間請以不同底色標示並註明原因（如「汛期停工」）。

輸出要求：**只輸出 HTML 原始碼本身**，從 <!DOCTYPE html> 開始、以 </html> 結束。不要加上任何說明文字，也不要用 Markdown 程式碼區塊包裹。`;

/** 修訂既有版本時附加的規則：以該版為底改，而非重寫。 */
const REVISE_SUFFIX = `

本次為**修訂既有版本**：使用者提供了目前版本的 HTML。請以它為基礎進行修改 ——
- 保留原有的整體結構、視覺風格與操作方式，只改動使用者要求之處與必要的連動部分。
- 不要重新從零設計；未被要求變更的部分應與原版一致。
- 仍須輸出**完整**的 HTML 檔（不是差異或片段）。`;

/** HTML 產出的長度上限，避免超大回應拖垮頁面（約 400KB）。 */
const MAX_HTML_CHARS = 400_000;

/**
 * 清理模型回傳的 HTML。
 *
 * 模型常不顧指示而用 ```html 包裹，或在前面加一句「以下是…」；
 * 這裡剝掉圍籬並從第一個 <!DOCTYPE 或 <html 起裁切。
 * 回 null 表示看起來不是 HTML，由呼叫端當作該段失敗處理。
 */
function cleanHtml(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let s = raw.trim();

  // 去掉 Markdown 程式碼圍籬
  const fence = s.match(/^```(?:html)?\s*\n([\s\S]*?)\n?```\s*$/i);
  if (fence) s = fence[1].trim();

  // 從文件起點裁切，丟掉前面的贅述
  const start = s.search(/<!DOCTYPE\s+html|<html[\s>]/i);
  if (start > 0) s = s.slice(start);
  else if (start < 0) return null;

  // 裁到 </html> 為止，丟掉後面的贅述
  const end = s.toLowerCase().lastIndexOf("</html>");
  if (end >= 0) s = s.slice(0, end + "</html>".length);

  if (s.length > MAX_HTML_CHARS) return null;
  return s.trim() || null;
}

const iso = (d: Date | null | undefined) => (d ? new Date(d).toISOString().slice(0, 10) : null);

/** 最後一則使用者訊息，作為此版本的「本次要求」摘要。 */
function lastUserInstruction(messages: FaithMessage[]): string | null {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const m = messages[i];
    if (m.role === "user" && m.text.trim()) return m.text.trim().slice(0, 200);
  }
  return null;
}

function projectContext(p: NonNullable<Awaited<ReturnType<typeof projectService.getProject>>>): string {
  const info = {
    名稱: p.name,
    代碼: p.code,
    工程摘要: p.description,
    關鍵要求重點: p.keyRequirements,
    地點: p.location,
    業主: p.client,
    承攬廠商: p.contractor,
    契約金額: p.budget != null ? Number(p.budget) : null,
    開工: iso(p.startDate),
    竣工: iso(p.endDate),
    狀態: p.status,
    履約事項: p.obligations.map((o) => ({ 名稱: o.title, 權重: o.weight, 期限: iso(o.dueDate) })),
    既有工程分項: p.workItems.map((w) => ({
      名稱: w.name,
      類別: w.category,
      單位: w.unit,
      契約數量: w.contractQty != null ? Number(w.contractQty) : null,
      預定起: iso(w.plannedStart),
      預定迄: iso(w.plannedEnd),
    })),
  };
  return JSON.stringify(info, null, 2);
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "未登入" }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as Body;
  if (!body.projectId) {
    return NextResponse.json(
      { error: "尚未鎖定專案，請先於左上角選擇目前專案。" },
      { status: 400 },
    );
  }

  const encoder = new TextEncoder();
  const line = (obj: unknown) => encoder.encode(`${JSON.stringify(obj)}\n`);

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const step = (key: string, label: string, status: "start" | "done", extra?: object) =>
        controller.enqueue(line({ type: "step", key, label, status, ...extra }));

      try {
        await withLogContext(
          {
            conversationId: body.conversationId,
            turnId: body.turnId,
            route: "/api/faith/plan",
            userId: user.id,
            userName: user.name,
          },
          async () => {
            // 1) 讀取專案資訊
            step("load", "讀取專案資訊", "start");
            const project = await projectService.getProject(body.projectId!, user);
            if (!project) {
              controller.enqueue(line({ type: "error", message: "找不到專案或無權限存取。" }));
              return;
            }
            const ctx = projectContext(project);

            // 修訂模式：撈出作為基礎的那一版（找不到就退回從零生成）
            const base =
              body.mode === "revise"
                ? await designService.getBase(project.id, body.baseVersion)
                : null;
            step("load", "讀取專案資訊", "done", {
              detail: base ? `基於 v${base.version} 修訂` : "完全重做",
            });

            const messages = body.messages ?? [];
            const baseDesignCtx = base
              ? `\n\n作為修訂基礎的既有設計（v${base.version}，JSON）：\n` +
                JSON.stringify(
                  { workItems: base.design.workItems, milestones: base.design.milestones },
                  null,
                  2,
                ) +
                `\n請以此為基礎依使用者要求調整，未被要求變更的項目請保持一致。`
              : "";

            // 2) 規劃工程分項
            step("items", base ? "更新工程分項" : "規劃工程分項", "start");
            const itemsRes = await faith.askStructured<{ reply?: string; workItems?: unknown[] }>({
              instruction: ITEMS_INSTRUCTION,
              task: "plan-3d:items",
              messages,
              context: `以下為目前鎖定專案的資訊（JSON）：\n${ctx}${baseDesignCtx}`,
              schema: WORKITEMS_SCHEMA,
              maxOutputTokens: faith.WIZARD_MAX_TOKENS,
              fallbackPrompt: base
                ? "請依上述基礎設計與使用者要求，更新工程分項。"
                : "請依上述專案資訊，從零規劃工程分項，並標註每項的 kind。",
            });
            const workItems = Array.isArray(itemsRes?.workItems) ? itemsRes!.workItems : [];
            if (!workItems.length) {
              controller.enqueue(line({ type: "error", message: "費思未能規劃工程分項，請重試或補充條件。" }));
              return;
            }
            step("items", base ? "更新工程分項" : "規劃工程分項", "done", {
              count: workItems.length,
            });

            // 3) 規劃時程里程碑（以工程分項為輸入）
            step("schedule", base ? "更新時程里程碑" : "規劃時程里程碑", "start");
            const scheduleRes = await faith.askStructured<{ milestones?: unknown[] }>({
              instruction: SCHEDULE_INSTRUCTION,
              task: "plan-3d:schedule",
              messages,
              context:
                `專案資訊（JSON）：\n${ctx}\n\n已規劃的工程分項（JSON）：\n` +
                JSON.stringify(workItems, null, 2),
              schema: MILESTONES_SCHEMA,
              maxOutputTokens: faith.WIZARD_MAX_TOKENS,
              fallbackPrompt: "請依上述工程分項規劃時程里程碑。",
            });
            const milestones = Array.isArray(scheduleRes?.milestones) ? scheduleRes!.milestones : [];
            step("schedule", base ? "更新時程里程碑" : "規劃時程里程碑", "done", {
              count: milestones.length,
            });

            // 4) 產生 3D 動畫網頁（由模型直接寫出一份 HTML，前端以 iframe 嵌入）
            const htmlLabel = base ? "更新 3D 動畫網頁" : "產生 3D 動畫網頁";
            step("html", htmlLabel, "start");
            const design = { reply: itemsRes?.reply ?? "", workItems, milestones };
            const rawHtml = await faith.ask({
              instruction: base ? HTML_INSTRUCTION + REVISE_SUFFIX : HTML_INSTRUCTION,
              task: "plan-3d:html",
              messages,
              context:
                `專案資訊（JSON）：\n${ctx}\n\n施工設計（JSON）：\n` +
                JSON.stringify({ workItems, milestones }, null, 2) +
                (base
                  ? `\n\n目前版本（v${base.version}）的 HTML —— 請以它為基礎修改：\n${base.html}`
                  : ""),
              maxOutputTokens: faith.WIZARD_MAX_TOKENS,
              fallbackPrompt: base
                ? "請依上述要求修改目前版本的 HTML。"
                : "請依上述施工設計產生 3D 動畫的 HTML。",
            });
            const html = cleanHtml(rawHtml);
            step("html", htmlLabel, "done", {
              detail: html ? `${Math.max(1, Math.round(html.length / 1024))} KB` : "未產生",
            });

            if (!html) {
              // 設計本身已完成，仍交付出去；僅告知動畫網頁這段失敗
              controller.enqueue(line({ type: "result", design, html: null, saved: null }));
              controller.enqueue(
                line({ type: "error", message: "動畫網頁產生失敗（回傳內容不是 HTML），設計已保留，可重新生成。" }),
              );
              return;
            }

            // 5) 保存為新版本（永久留存，供日後切換與再修訂）
            step("save", "保存為新版本", "start");
            const saved = await designService.saveVersion({
              projectId: project.id,
              html,
              design,
              instruction: lastUserInstruction(messages),
              baseVersion: base?.version ?? null,
              actor: { id: user.id, role: user.role },
            });
            step("save", "保存為新版本", "done", {
              detail: saved.ok ? `v${saved.version}` : "未保存",
            });

            controller.enqueue(
              line({
                type: "result",
                design,
                html,
                saved: saved.ok ? { id: saved.id, version: saved.version } : null,
              }),
            );
            if (!saved.ok) {
              controller.enqueue(
                line({ type: "error", message: `版本保存失敗：${saved.error}（動畫仍可檢視與另存）` }),
              );
            }
          },
        );
      } catch (error) {
        controller.enqueue(line({ type: "error", message: toFaithError(error).message }));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
