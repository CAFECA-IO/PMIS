# AI 彙整報告生成流程重新設計（白名單數據集 / LLM 主導本體）

> 取代舊流程「程式主導、LLM 只寫一段摘要」。目標：讓 LLM 視情況把數據整理成圖表，同時嚴守零捏造。
> 日期：2026-08-03 ｜ 本文精修並取代 `isunfa-ai-chart-report-integration-plan.md` 的「生成模式」段落。

## 舊流程為何不堪用

現況是「程式主導、LLM 打工」：`report.service.generateReport()` 把數字算好、把 `pie()` 圖表寫死、把 markdown 組好，只把「摘要」外包給 LLM，且 prompt 明令「不要輸出圖表」。LLM 的輸出是死路——它決定不了報告結構與圖表，因此無法「視情況把數據整理成圖表」。要達成期望，主從關係必須反轉。

## 核心決策：白名單數據集

讓 LLM 主導報告本體（決定文字／表格／圖表的取捨與圖種），但**它不打任何數字**。程式先算好一組「具名、已驗證的數據集」，LLM 只能「選哪一組、畫成哪種圖」，數字一律由程式填入。如此同時滿足「LLM 主導視覺化」與「零捏造」。

## 新流程（四步）

### 1. 備料 — 程式產出白名單數據集

`report.service`（可抽 `report-datasets.ts`）決定論算好該期所有數字，整理成數據集陣列，每筆：

```ts
interface ReportDataset {
  id: string; // 穩定代號，供 LLM 引用，如 "defects_period_compare"
  title: string; // 人類可讀標題
  summary: string; // 一句話說明這組數據代表什麼
  allowedCharts: ChartKind[]; // 允許畫成哪些圖（pie / custom-tornado / custom-matrix / custom-histogram / custom-boxplot）
  data: unknown; // 已驗證的結構化資料（程式之後據此展開 DSL）
}
```

只放「本期真的有資料」的數據集。候選：

| id                              | 內容                            | 允許圖種                |
| ------------------------------- | ------------------------------- | ----------------------- |
| `work_item_status`              | 工程分項狀態分布                | pie                     |
| `inspection_result`             | 本期查驗結果分布                | pie                     |
| `defects_period_compare`        | 本期 vs 上期 缺失/查驗/送審件數 | custom-tornado(compare) |
| `risk_matrix`                   | 未結案缺失 機率×嚴重            | custom-matrix           |
| `inspection_value_distribution` | 查驗/量測值已分箱分布           | custom-histogram        |
| `metric_dispersion`             | 各分項某指標五數綜合            | custom-boxplot          |

### 2. 撰寫 — LLM 主導報告本體

改寫 `AI_REPORT_PROMPT`。輸入：數據集目錄（id、title、summary、allowedCharts，以及實際數值供其在文字/表格引用）＋ facts。指令要點：

- 用繁體中文撰寫完整報告本體（前言／分析／視覺化／結論），自行判斷何處用文字、表格或圖表。
- 要放圖時，**只輸出一段引用指令圍欄**，不得自己填數字：

  ````
  ```pmis-chart
  dataset: defects_period_compare
  type: custom-tornado
  ```
  ````

- `type` 必須取自該 dataset 的 `allowedCharts`；行文中引用數字只能用目錄提供的數值。

### 3. 展開 + 驗證 — 程式把指令換成真數據 DSL

掃描 LLM 輸出的 `pmis-chart` 指令：查表取得 dataset → 驗證 `type ∈ allowedCharts` → **由程式**把該數據集決定論展開成對應的 ```custom-* DSL 圍欄（數字全來自 `data`）。未知 id / 不允許的 type → 移除並留註記。其餘散文、表格原樣通過。

> 這一步是零捏造的關鍵閘門：LLM 從頭到尾碰不到數字，只能挑「哪組資料、畫哪種圖」。

### 4. 渲染 — 沿用圖表管線

展開後的 markdown 交給 `<Markdown>` → parser 解析 `custom-*` 圍欄 → 已移植的四種圖表元件渲染（渲染層基礎見文末〈附錄一：渲染層基礎（Phase A）〉）。

## 資料流

````
generateReport
  → 備料：算好 ReportDataset[]（具名、已驗證）
  → faith：把「數據集目錄 + facts + 規則」給 LLM
        LLM 產出報告本體，圖表處只留 ```pmis-chart(dataset,type) 指令
  → 展開：程式查表 + 驗證 type，決定論展開成 ```custom-* DSL（數字來自 data）
  → 渲染：Markdown → parser → 圖表元件
````

## 與圖表移植成果的關係

- **渲染層基礎（Phase A：parser + 常數 + `markdown.tsx` 掛勾）是本設計的共用前提，先做**；技術細節見文末〈附錄一〉（原獨立整合計劃已併入此處）。
- 四種純 SVG 圖表元件與 `chart-primitives.ts` 已於前一階段移植完成並通過驗證，本設計直接沿用。
- 早期草案曾規劃「決定論固定圖 + AI 選配補充」的混合模式，已被本文「白名單數據集 + LLM 選圖 + 程式展開」取代；當時設想的四個 `pie()`-style helper，於本設計中演變為第 3 步的「數據集 → DSL 展開器」，不再把圖寫死在報告裡。

## 需再確認 / 風險

- **數據集清單與 allowedCharts 對應**需逐一定案（尤其 risk_matrix 的機率×嚴重對映、histogram 分箱規則、boxplot 指標來源）。
- **上一期查詢**（tornado compare）需新增 repo。
- **LLM 亂引用**：未知 id / 不允許 type 一律安全丟棄，報告不因此崩壞。
- **指令圍欄語言標籤**用 `pmis-chart`（與最終渲染用的 `custom-*` 區隔，避免 LLM 直接冒充 custom-_ 塞數字——渲染前只信任程式展開出來的 custom-_）。

## 對齊 `AI流程優化設計.md` 的治理要求

本設計歸屬 `AI流程優化設計.md` 的 **PMIS-08 監造報表自動生成**（導入第一階段）。以下逐條對齊該文件的設計原則（§一）與幻覺控管（§六），作為實作時的硬性要求：

- **數值以規則引擎為準、LLM 僅作說明（§六）**：白名單數據集正是此原則的落實——所有數字由程式（規則引擎）算出，LLM 只挑「哪組資料、畫哪種圖」並撰寫說明，永不產生數值。
- **強制附來源引用（§六）**：每張展開的圖與其引用的段落，須帶對應 `dataset.id` 與資料來源（如「本期查驗紀錄」）。展開器在 `custom-*` 區塊附註來源，報告末尾可彙整「資料來源」清單。
- **標註「AI 生成」（§一.2）**：報告整體標記為 AI 生成草稿；AI 撰寫的敘述與其選配的圖表在 UI 上明確標示，供查核委員辨識。
- **人在迴路（§一.1）**：生成結果為**草稿**，須經監造人員確認後才可定稿；AI 不介入核定與數位簽章。報告應有「草稿 / 已確認」狀態，未確認前不得當正式文件歸檔。
- **可稽核、可回溯（§一.2）**：每次生成保存輸入來源（用了哪些 dataset）、模型版本、（可得時）信心分數與時間戳，留存稽核軌跡。
- **不取代既有表單格式（§一.3）**：定稿後須能匯出工程會標準格式（WORD / PDF / ODT）；圖表以向量（SVG）嵌入以確保列印品質。此為後續「報告匯出」階段的需求，先在資料模型預留欄位。

> 這些要求不改變前述四步流程，而是為它加上治理配套：來源引用、AI 標註、草稿-人工確認、稽核留存、標準格式匯出。

## 建議下一步

先做 Phase A 打通「custom-* → 渲染」，再實作「數據集 → DSL 展開器」與新 prompt，最後補上治理配套（AI 標註、草稿狀態、來源與稽核欄位）。每步可獨立驗收。

## 實作進度（Phase A–D）

> 施作拆分與狀態。截至 2026-08-03：Phase A、B 完成；Phase C、D 未開始。

### Phase A — 渲染層基礎 ✅ 完成

| 步驟 | 內容 | 產出檔案 | 狀態 |
| --- | --- | --- | --- |
| A1 | 圖表 DSL 常數（fence 語言、設定鍵、錯誤碼、格式） | `src/constant/custom-chart.ts` | ✅ |
| A2 | DSL parser（`parseCustomChart`／`detectCustomChartType`，zod 改手寫守衛） | `src/lib/csv.ts`、`src/lib/custom-chart-parser.ts`（+ `.test.ts`，9/9 通過） | ✅ |
| A3 | `CustomChart` 派發元件 + `markdown.tsx` 掛勾；範例報告頁 | `src/components/custom-chart.tsx`、修改 `src/components/markdown.tsx`（+ `.test.ts` 4/4 通過）、`src/app/report-demo/page.tsx` | ✅ |

驗收：lint／`tsc --noEmit` 乾淨；`/report-demo` 可見 mermaid + 四種自訂圖 + 畸形 fallback。

### Phase B — 白名單數據集與展開器 ✅ 完成

| 步驟 | 內容 | 產出檔案 | 狀態 |
| --- | --- | --- | --- |
| B1 | `ReportDataset` 型別與白名單、`ChartKind`、`DatasetData` 判別聯集 | `src/service/report-datasets.ts` | ✅ |
| B2 | 純函式 `assembleDatasets` + 統計助手（`quantile`／`fiveNumberSummary` Tukey 離群／`binValues` 決定論分箱／`diffDays`）；報表 repo 補查詢 | `src/service/report-datasets.ts`、修改 `src/repository/report.repository.ts`（+`defectsResolvedInPeriod`、`submittalsReviewedInPeriod`） | ✅ |
| B3 | `datasetToDsl` 序列化 + `expandChartDirectives`（處理 `pmis-chart` 指令、未知 id／不允許 type 安全降級、圖後附來源引用） | `src/service/report-chart-expander.ts`（+ `.test.ts` 4/4 通過，含序列化↔解析 round-trip） | ✅ |

六個數據集與對映（皆決定論、數字來自 DB）：`work_item_status`（圓餅）、`inspection_result`（圓餅）、`defects_period_compare`（龍捲風，本期 vs 上期）、`open_defect_matrix`（矩陣，嚴重度×逾期天數）、`defect_resolution_histogram`（直方，改善耗時）、`submittal_review_boxplot`（箱型，審查天數 by 類別）。

### Phase C — LLM 主導本體 ✅ 完成

| 步驟 | 內容 | 產出檔案 | 狀態 |
| --- | --- | --- | --- |
| C1 | 白名單版報告本體 prompt（LLM 主導、要圖只輸出 `pmis-chart(dataset,type)`、不打數字） | `src/constant/ai.ts`（+`AI_REPORT_BODY_PROMPT`） | ✅ |
| C2 | 改寫 `generateReport`：備白名單數據集 → LLM 撰寫本體 → `expandChartDirectives` 展開 → 決定論 fallback | `src/service/faith.service.ts`（+`generateReportBody`）、`src/service/report.service.ts`（重寫） | ✅ |
| C3 | 治理配套：AI 草稿橫幅、資料來源清單、`GeneratedReport` 增 `isDraft`／`sources`／`aiAuthored` 稽核欄位（來源引用於 B3 落地） | `src/service/report.service.ts` | ✅ |

備註：完整「草稿 → 已確認」狀態機與匯出 WORD/PDF/ODT 屬後續資料模型 + UI 工作，本次先以 `isDraft` 標記與草稿橫幅落地。

### Phase D — 驗證 ✅（單元 + 靜態）／⏳（端到端待本機）

- ✅ ESLint 全數乾淨；`tsc --noEmit` src 無誤（僅 `.next` 過期產生檔誤報，`npm run build` 會重生）。
- ✅ 單元測試（隔離環境）全綠：parser 9、custom-chart 渲染 4、expander 4（含序列化↔解析 round-trip）、report-datasets 7、圖表元件 render 6 — 共 30 項。
- ⏳ 待本機：`npm run build`／`npm test`（沙盒無 better-sqlite3／tsx 原生模組）、真實 seed + LLM 的端到端週報與截圖、`/report-demo` 目視。

---

## 附錄一：iSunFA 探勘發現與渲染層基礎（Phase A）

> 原 `isunfa-ai-chart-report-integration-plan.md` 併入。此節與生成模式無關，是兩種來源共用的技術底座。

### 探勘發現：兩邊的圖表機制

**iSunFA 的 AI 圖表是 DSL 驅動**（與 mermaid 同套路）：LLM 產生的 markdown 內嵌 ```custom-matrix / custom-tornado / custom-histogram / custom-boxplot 圍欄，圍欄語言標籤即圖種；`custom_chart_parser.ts` 把圍欄內的 DSL 文字解析成 AST（zod 驗證、永不 throw、回傳 `{ok:true,ast} | {ok:false,code,message}`）；圖表元件渲染 AST。LLM 被 `CUSTOM_CHART_RULES` 嚴格約束「只用來源資料裡已存在的數字，禁止自行計算/估算/分箱」。

**PMIS 的報告原為決定論組裝**：`report.service.ts` 的 `generateReport()` 把數字在 TypeScript 算好，`faith`（Gemini 封裝）只寫「摘要」散文，圖表（mermaid 圓餅）由 `pie()` 決定論產生。`markdown.tsx` 在 `pre()` 偵測 `language-mermaid` 就渲染 `<Mermaid/>`。整合點因此非常乾淨：在同一處比照 mermaid 掛上四種 `custom-*` 圍欄即可。

### Phase A 渲染層基礎（兩種來源共用，最先做）

**A1. 常數 `src/constant/custom-chart.ts`**：搬移並精簡 iSunFA `constants/custom_chart.ts` 必要項——`CustomChartType`（四個 fence 語言字串）、`CustomChartConfigKey`、`CustomChartParseErrorCode`、`TornadoMode`、`HistogramTrendType`、`HEX_COLOR_REGEX`、`CUSTOM_CHART_COMMENT_PREFIX`、pair 分隔符。比照 PMIS「魔法字串抽常數」慣例。

**A2. 解析器 `src/lib/custom-chart-parser.ts`**：移植 `parseCustomChart(content, type)` 與 `detectCustomChartType(lang)`，契約不變（永不 throw、回結果物件、附錯誤碼）。輸出 AST 對接已移植的 `chart-primitives.ts` 型別（`MatrixChartData` 等），核對欄位命名差異並加薄轉接層。

**A3. 渲染掛勾 `src/components/markdown.tsx` + `src/components/custom-chart.tsx`**：新增 `CustomChart` 派發元件（依 type 呼叫 parser → 成功渲染對應圖表、失敗顯示友善訊息，包在灰階 frame）。在 `markdown.tsx` 的 `pre()` 比照 mermaid，偵測 `language-custom-matrix|custom-tornado|custom-histogram|custom-boxplot` 轉交 `CustomChart`。

> 注意：本設計中，LLM 只輸出 `pmis-chart` 指令圍欄，`custom-*` 圍欄一律由程式的展開器產生；渲染層只信任 `custom-*`，不直接渲染 LLM 冒充的 `custom-*`（若有）。

## 附錄二：相依缺口與驗證

- **相依缺口**：PMIS 無 zod / csv util → parser 的 AST 結構驗證改寫為**手寫型別守衛**、並自帶小工具 `parseCsvLine`（推薦，零新增相依）；若偏好與 iSunFA 一致，也可改為新增 `zod`。
- **資料來源待確認**：白名單數據集中 `risk_matrix` 的機率×嚴重對映、`inspection_value_distribution` 的分箱規則、`metric_dispersion` 的指標來源，需確認 PMIS 既有欄位；不足者先略過，不硬湊數字（符合零捏造）。`defects_period_compare` 需新增「上一期」聚合查詢（新 repo 工作量）。
- **驗證方式**：移植 parser 單元測試（iSunFA 有對應 `__tests__`）；新增渲染整合測試（四種圍欄各自 → 對應圖；畸形 DSL → fallback 而非崩潰）；跑 `npm run build` / lint / `npm test`；產生含四圖的範例報告並截圖檢視。高風險項可用子代理獨立複驗。
