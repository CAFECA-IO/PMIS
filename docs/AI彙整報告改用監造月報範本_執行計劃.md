# AI 彙整報告改用監造月報範本 — 執行計劃

> 任務：把 `/logs` 的「AI 彙整報告（週／月／季／年）」輸出，從目前的自由格式改為**五層式監造月報範本**。
> 日期：2026-08-04
> 前置：`監造月報範本（五層式）.md`（版面已定案）、`AI彙整報告生成流程重新設計.md`（白名單數據集流程，Phase A–C 已完成）

> **後續定案（2026-08-05，詳見 `日報月報計劃整合檢視.md`）**：`監造日報填報擴充規劃.md` 定案後，日報成為月報的**單一真實來源**，本文 M1–M8 已上線碼須配合回改——
> - **累計/逐工項完成**：改接**日報數量加總**（`SupervisionReportItem.dailyQty`），`WorkItem.completedQty` 由權威降為推導；下方 §C 的 `WorkItemPeriodSnapshot` 待辦**取消**（由日報 E1 取代）。
> - **S-Curve**：**實際線**改接日報加總；**預定線**改接新增的專案「預定進度設定」（取代 `periodProgressDelta` 履約事項權重推導）。
> - **工作日判定**：`classifyWorkDay()` **移除天氣訊號**（天氣僅供紀錄），改以日報 `summary` ＋ E5 `excludedFromDuration`／E3 `NO_WORK` 顯式旗標為準。
> - **逐日日誌**：隨日報 E2/E4 欄位拆分同步改讀新欄位（漸進遷移、legacy fallback）。

## 已確認決策

| 項目 | 決定 |
| --- | --- |
| 欄位缺口 | **分階段**：本次僅補「契約工期」一個欄位（工程概要改條列後已無缺口）；「逐工項本月完成」先顯示 `—` 並註明需月結快照，下一階段再做 |
| 週期適用 | **四種週期共用同一結構**，「本月」改為動態用詞（本期／本週／本月／本季／本年） |

## 現況與範本的落差

現行 `generateReport()` 產出的是「摘要 + 各模組小節 + mermaid 圓餅」的自由格式；範本要求固定五層結構、法定表格與逐日日誌。落差分三類：

**A. 已可直接供應**（改組裝即可）

| 範本欄位 | 現有來源 |
| --- | --- |
| 主辦單位／承攬廠商／監造單位／契約金額／開工日／預定完工日 | `Project.client / contractor / supervisor / budget / startDate / endDate` |
| 累計預定／完成進度、落差 | `rolledUpProgress()`（overall / planned / gap） |
| 累計進度趨勢 S-Curve | `dashboard.service.getSCurve()`（月度累計預定／實際／預測，由履約事項權重推導） |
| 逐日工作事項明細 | `SupervisionReport`（reportDate / weather / summary / keyNotes） |
| 工項明細表的累計欄位 | `WorkItem.wbsCode / unit / contractQty / unitPrice / completedQty / valuatedQty / progress` |

**B. 需補 schema（本次做，低成本）**

| 缺口 | 說明 | 補法 |
| --- | --- | --- |
| 契約工期（工作天） | 目前僅有起訖日期；「工作天」與「日曆天」在契約上不同義，累積／剩餘工期不可直接相減 | `Project` 新增 `contractWorkDays Int?` |

> **工程概要已無缺口**：範本改為「每項一句（品項＋數量）」逐項條列後，整句直接存於 `ContractScopeItem.title`（依 `sortOrder` 排序輸出），毋須新增 `quantity` / `unit` 欄位。本次 schema 改動因此只剩 `contractWorkDays` 一項。

**C. 需月結快照（本次不做，顯示 `—`）**

「逐工項本月完成百分比／金額」需要上期存底才能算差額，但 `WorkItem.completedQty` 是單一累計值、會被覆寫，schema 無任何快照或歷史表。本次於表格該欄顯示 `—`，並在報告加註「本期完成需月結快照，功能開發中」。同理，`custom-progress` 圖的「本期增量」欄留空（該圖已支援只給累計值）。

> 下一階段建議：新增 `WorkItemPeriodSnapshot`（projectId / workItemId / periodStart / completedQty / valuatedQty），於期末或報告生成時寫入，即可回推任一期間的差額。
>
> **【2026-08-05 取消】** 此快照方案改由日報 E1「逐日數量表」加總取代（本期完成量＝期間內該工項 `dailyQty` 之和），不再新建 `WorkItemPeriodSnapshot`。詳見 `日報月報計劃整合檢視.md` 決策 A。

## 目標架構

延續既有的白名單數據集流程，但**報告骨架改為由程式決定論組裝**，LLM 只負責敘述層：

```
generateReport(type, refDate)
  ├─ 程式：組出五層骨架（識別表、法定表格、逐日日誌、簽章）      ← 決定論、100% 可控
  ├─ 程式：算好白名單數據集 → 展開 custom-scurve / custom-progress 等圍欄
  ├─ LLM ：只寫「二、本月摘要」的評述段（3–6 句，就既有數字說明）
  └─ 組裝：骨架 + 圖表 + 評述 → markdown
```

**與先前設計的差異**：先前是「LLM 主導本體、程式展開圖表」；範本化後，**報告結構是法定格式、不容 LLM 自由發揮**，故骨架收回程式端，LLM 職責縮小為單一段落的評述。這同時大幅降低 LLM 成本與格式風險。

## Prompt 調整計劃

現有兩個相關 prompt 需調整：

### P1. `AI_REPORT_BODY_PROMPT`（白名單版本體 prompt）→ 停用

該 prompt 讓 LLM 主導整份報告結構並自選圖表。範本化後結構固定，**此 prompt 於報告路徑停用**（保留常數以免其他路徑引用，但 `generateReport` 不再呼叫）。相應的 `faith.generateReportBody()` 亦不再用於報告主線。

### P2. 新增 `AI_REPORT_REVIEW_PROMPT`（期間評述）

取代原本的 `AI_REPORT_PROMPT`（摘要段），但約束更嚴，因為評述會出現在法定文件中。要點：

- **角色**：監造月報的「本期評述」撰寫者。
- **輸入**：僅給第 1 層摘要層的既算數字（本期／累計預定與完成、落差、工期使用、雨天停工天數、逐日日誌摘要）。
- **輸出**：3–6 句自然段落，聚焦「趨勢、風險、應注意事項」，並給 1–2 點具體建議。
- **硬性禁止**：
  - 不得引入輸入以外的任何數字（零捏造）。
  - 不得自行計算比率、達成率、換算（差額已由程式算好）。
  - 不得輸出標題、條列符號、markdown 區塊、圖表或程式碼圍欄。
  - 不得使用「達成率」等未經確認的自創指標用語；落差一律用「超前／落後 N 個百分點」。
- **語氣**：客觀、專業，避免絕對化論斷（如「必將延誤」）；不確定處以「宜持續追蹤」表述。
- **週期用詞**：以傳入的週期標籤（本週／本月／本季／本年）為準，不可寫死「本月」。

### P3. 動態週期用詞

範本目前寫死「本月」。改為由程式依 `ReportType` 注入用詞（`PERIOD_LABEL`：週報→本週、月報→本月、季報→本季、年報→本年），標題與各節同步替換；prompt 亦接收該標籤。

### P4. 護欄不變

評述仍走既有的失敗回退（`faith` 拋錯或空回覆時，以模板句回退），並沿用 `isDraft` / `sources` / `aiAuthored` 稽核欄位。

## 施作拆解

| 步驟 | 內容 | 主要檔案 | 依賴 |
| --- | --- | --- | --- |
| **M1** | schema 補欄位：`Project.contractWorkDays`；`prisma db push` + `generate`（本機執行） | `prisma/schema.prisma` | — |
| **M2** | Repository：報告所需的整批查詢（專案識別、契約標的含數量單位、工項台帳、逐日日誌、履約事項） | `src/repository/report.repository.ts` | M1 |
| **M3** | 週期常數與工具：`PERIOD_LABEL`、期間起訖（沿用 `periodRange`）、工期計算（累積／剩餘，依 `contractWorkDays`）、工作日統計（施工／雨天停工／例假日，自逐日日誌判定） | `src/constant/pmis.ts`、`src/service/report-period.ts`（新） | — |
| **M4** | 骨架組裝器：依五層產出 markdown（識別表、概要表、摘要指標表、進度表、工項明細表含合計、工作統計、逐日表格、簽章） | `src/service/report-template.ts`（新） | M2 M3 |
| **M5** | 圖表接線：S-Curve 接 `getSCurve()`（改為單一專案版）、`custom-progress` 接工項累計（本期增量留空）、工作日組成 mermaid 圓餅 | `src/service/report-template.ts`、`src/service/report-chart-expander.ts` | M4 |
| **M6** | Prompt：停用 `AI_REPORT_BODY_PROMPT` 於報告路徑；新增 `AI_REPORT_REVIEW_PROMPT`；`faith` 新增 `generatePeriodReview()` | `src/constant/ai.ts`、`src/service/faith.service.ts` | — |
| **M7** | 改寫 `generateReport`：骨架 + 圖表 + 評述組裝，移除舊的自由格式組裝與 `pie()` 呼叫；保留決定論 fallback | `src/service/report.service.ts` | M4 M5 M6 |
| **M8** | 驗證：骨架單元測試（法定欄位不遺漏、合計正確、四週期用詞正確）、圖表圍欄 round-trip、空資料不崩；lint／tsc／build；`/report-demo` 改為渲染真實生成結果 | 對應 `.test.ts` | M7 |

建議順序：M1 → M3 → M2 → M4 → M5 → M6 → M7 → M8。M3／M6 可與 M2 並行。

## 執行進度

> 截至 2026-08-04：M1–M8 全部完成。全專案 lint／`tsc --noEmit` 乾淨；單元測試 34 項全綠；
> 骨架輸出的 `custom-scurve` / `custom-progress` 圍欄已通過端到端解析與渲染驗證。

| 步驟 | 狀態 | 產出 |
| --- | --- | --- |
| M1 | ✅ | `Project.contractWorkDays`（遷移已執行，DB 欄位與 generated client 皆確認） |
| M2 | ✅ | `getProject` 增 `scopeItems`（依 `sortOrder`，供工程概要） |
| M3 | ✅ | `src/service/report-period.ts`：`PERIOD_LABEL`／`summarizeDuration`／`classifyWorkDay`／`summarizeWorkDays`／`describeGap`／`periodProgressDelta`／`trimCurveWindow`／`monthLabel`（13 項測試） |
| M4 | ✅ | `src/service/report-template.ts`：五層骨架純函式（12 項測試） |
| M5 | ✅ | S-Curve 以 `buildSCurve` + `trimCurveWindow` 接單一專案；進度橫條接工項累計；工作日組成 mermaid 圓餅 |
| M6 | ✅ | `AI_REPORT_REVIEW_PROMPT`（含硬性禁止條款）、`faith.generatePeriodReview()`（含圍欄／標題剝除防禦） |
| M7 | ✅ | `generateReport` 改為「骨架 + 圖表 + 評述」，移除 `pie()`／`countBy()` 與自由格式組裝 |
| M8 | ✅ | lint／tsc／34 項單元測試／端到端圍欄渲染驗證 |

### 實作中的關鍵發現

**本期進度增量不需要期末快照。** 原計劃假設「本期完成」全都需要快照，但實作時發現：以「期間內到期／實際完成的履約事項權重占全案總權重」即可決定論算出本期預定與完成增量，且對週／月／季／年皆成立（`periodProgressDelta`）。故第 2 層摘要與 3.1 整體進度的本期欄位**都有真實數值**，僅 3.3 的「逐工項本期完成」仍缺快照而顯示 `—`。

### 後續事項

- `report-datasets.ts` 與 `report-chart-expander.ts`（前一版「LLM 主導本體」設計的產物）已不在報告主線上，但保留且測試仍綠，可供日後「AI 選配補充圖表」使用。若確定不需要，可另行移除。
- ~~待辦：`WorkItemPeriodSnapshot` 月結快照~~ → **取消**，改由日報 E1 數量表加總補齊逐工項本期完成（決策 A）。
- 待確認：工作日判定規則（雨天停工／例假日）宜請監造確認；`contractWorkDays` 於既有專案為空值，需提供填寫入口。

## 風險與待確認

- **M1 需本機執行遷移**：沙盒無 better-sqlite3 原生模組，schema 改動後的 `db push` / `generate` 需你在本機跑。
- **「本期完成」暫缺**：工項明細表該欄顯示 `—`。若審核方不接受空欄，替代方案是改列「累計完成」單一欄位並註明，待快照功能上線再補齊。
- **工作日判定規則**：施工／雨天停工／例假日的認定需定案。~~初版建議：日誌 `weather` 含「雨」且 `summary` 提及暫停 → 雨天停工~~。**【2026-08-05 定案 D】天氣不作判定依據（僅供紀錄）**；改以日報 `summary` ＋ E5 `excludedFromDuration`／E3 `NO_WORK` 顯式旗標為準，`summary` 為輔。此規則會影響工期展延爭議，宜請監造確認。
- **契約工期回填**：新增 `contractWorkDays` 後，既有專案該欄為空，累積／剩餘工期無法計算。需提供填寫入口或以日曆天暫代並標註。
- **S-Curve 目前為全案彙總**：`getSCurve()` 是跨專案 dashboard 用；需改寫為單一專案版本（或加參數）。
- **簽章欄位**：範本的簽章列目前是空白格。若需接既有簽核流程（`ApprovalDocument`），屬後續整合，本次僅保留版面。
