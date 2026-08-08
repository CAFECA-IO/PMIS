import "dotenv/config";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "../src/generated/prisma/client";
/*
  期間鍵的算法與應用程式**共用同一份**。

  這裡先前是手抄的第二份實作，靠註解約定「必須與 periodRange 完全一致」——
  兩份今天一致，但沒有任何東西在其中一份改動時攔下來，
  而不一致的後果是回填出來的鍵永遠對不上，且定稿無法在產品內修正。
  `period-key.ts` 刻意零相依（不引用任何 `@/` 別名），故此處可用相對路徑匯入。
*/
import {
  labelForKey,
  periodKeyFor,
  type PeriodKeyType,
} from "../src/service/period-key";

/**
 * 回填 `GeneratedReport.periodKey` 與 `confirmedPeriodKey`（2026-08-08）。
 *
 * 背景：期間身分原本用 `periodStart` 相等比對，而該值由伺服器時區推導，
 * 部署時區一改就對不上，「同期只有一份定稿」的守門會靜默失效。
 * 改以文字鍵 `periodKey`（如 `MONTHLY:2026-08`）為身分後，既有列需要回填。
 *
 * 為何不重置資料庫：裡面有已定稿的報表，那是送審依據的留存。
 *
 * 用法：
 *   npm run db:backfill              # 只列出將要做的事，不寫入
 *   npm run db:backfill -- --apply   # 實際寫入
 *
 * ⚠️ **必須以當初寫入這些資料的時區執行**，例如
 *   TZ=Asia/Taipei npm run db:backfill -- --apply
 * `periodStart` 存的是絕對時點，本腳本以本地取值把它讀回日曆日；
 * 時區不同會推出相鄰期間的鍵，而那個錯誤在產品內無法修正（定稿不可刪改）。
 * 腳本會拿推導鍵與既有的 `periodLabel` 比對，不一致即中止並提示。
 *
 * 可重複執行：已回填的列會被跳過。
 *
 * ── 為什麼這個檔案還留著 ──────────────────────────────────
 *
 * 本專案採純 `prisma db push`，沒有 `prisma/migrations`，
 * 所以這個腳本**就是**該次結構變更的唯一遷移紀錄。
 * 主開發資料庫已於 2026-08-08 完成回填，但任何在該日之前建立、
 * 且 `GeneratedReport` 已有資料的資料庫，直接 `db push` 都會被擋：
 *
 *   Added the required column `periodKey` … without a default value.
 *
 * 遇到時請照以下三步，**不要用 `--accept-data-loss`**（會失去已定稿的報表）：
 *
 *   1. 在 schema 的 `periodKey` 暫時加上 `@default("")`，
 *      執行 `npx prisma db push && npx prisma generate`
 *   2. `npx tsx prisma/backfill-period-key.ts`（先看）
 *      → `npx tsx prisma/backfill-period-key.ts --apply`
 *   3. 移除該 `@default("")`，再 `npx prisma db push && npx prisma generate`
 *
 * 待所有既有資料庫都完成回填後，本檔即可刪除。
 */

const adapter = new PrismaBetterSqlite3({
  url: process.env.DATABASE_URL ?? "file:./prisma/dev.db",
});
const prisma = new PrismaClient({ adapter });

const APPLY = process.argv.includes("--apply");

/**
 * 由 `type` 與 `periodStart` 推回期間鍵。
 *
 * 算法取自 `period-key.periodKeyFor`，不在此另寫一份。
 * `periodStart` 當初即以本地建構子寫入，故此處同樣以本地取值還原
 * —— 這個前提由下方的 periodLabel 一致性檢查把關。
 */
function periodKeyOf(type: string, periodStart: Date): string {
  return periodKeyFor(type as PeriodKeyType, periodStart);
}

async function main() {
  const rows = await prisma.generatedReport.findMany({
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      projectId: true,
      project: { select: { code: true, name: true } },
      type: true,
      periodStart: true,
      periodLabel: true,
      status: true,
      periodKey: true,
      confirmedPeriodKey: true,
      generatedAt: true,
      createdAt: true,
    },
  });

  console.log(`共 ${rows.length} 筆 GeneratedReport。`);
  if (rows.length === 0) {
    console.log("無需回填。");
    return;
  }

  const planned = rows.map((r) => ({
    ...r,
    nextKey: periodKeyOf(r.type, r.periodStart),
  }));

  /*
    ── 時區前提的自我檢查（必要，不是保險）─────────────────────

    `periodStart` 在資料庫裡是**絕對時點**，本腳本卻用本地取值把它讀回
    日曆日。這個還原只在「腳本執行的時區＝當初寫入的時區」時才正確。

    以台北寫入的 2026 年 8 月報表為例，`periodStart` 存成
    2026-07-31T16:00:00Z；若在 TZ=UTC 的容器裡跑，會推出
    `MONTHLY:2026-07`。而應用程式（同樣在 UTC）查八月時用的是
    `MONTHLY:2026-08` —— 這列定稿從此永遠查不到，
    「同期只有一份定稿」的守門靜默失效，而定稿不可刪不可改，
    產品內無從修正。

    `periodLabel` 是當初以正確時區產生的**文字**，不會隨執行環境改變。
    拿它與推導鍵比對，就能在寫入前把整批錯誤攔下來。
    僅對標籤格式固定的週期（月／季／年）檢查；日／週的標籤帶格式化日期，
    不在此判斷。
  */

  const mismatched = planned.filter((r) => {
    const expected = labelForKey(r.nextKey);
    return expected !== null && expected !== r.periodLabel;
  });
  if (mismatched.length > 0) {
    console.error(
      `\n⛔ 推導出的期間鍵與既有的 periodLabel 不一致（${mismatched.length} 筆）。`,
    );
    console.error(
      `   目前時區：${process.env.TZ ?? Intl.DateTimeFormat().resolvedOptions().timeZone}`,
    );
    for (const r of mismatched.slice(0, 20)) {
      console.error(
        `    - id=${r.id}  標籤「${r.periodLabel}」 → 推導鍵 ${r.nextKey}（應為「${labelForKey(r.nextKey)}」）`,
      );
    }
    if (mismatched.length > 20) {
      console.error(`    …另有 ${mismatched.length - 20} 筆`);
    }
    console.error(
      "\n這幾乎可以確定是**執行時區與當初寫入時不同**。" +
        "\n請以寫入這些資料的時區重跑，例如：" +
        "\n    TZ=Asia/Taipei npx tsx prisma/backfill-period-key.ts --apply" +
        "\n在錯誤時區下回填會產生永久對不上的鍵，且定稿無法在產品內修正。",
    );
    process.exitCode = 1;
    return;
  }

  /*
    先檢查同期是否已有多份定稿。

    舊的「先查再寫」擋不住並行確認，資料庫裡有可能已經存在兩份同期定稿；
    此時 `@@unique([projectId, confirmedPeriodKey])` 會在回填時擋下。
    與其讓它丟出難解的約束錯誤，不如在這裡先列出來讓人判斷保留哪一份。
  */
  const confirmedByKey = new Map<string, typeof planned>();
  for (const r of planned) {
    if (r.status !== "CONFIRMED") continue;
    const k = `${r.projectId}|${r.nextKey}`;
    const list = confirmedByKey.get(k);
    if (list) list.push(r);
    else confirmedByKey.set(k, [r]);
  }

  const conflicts = [...confirmedByKey.entries()].filter(
    ([, list]) => list.length > 1,
  );
  if (conflicts.length > 0) {
    console.error("\n⛔ 同一期間存在多份定稿，無法自動回填：");
    for (const [k, list] of conflicts) {
      console.error(`\n  ${k}`);
      for (const r of list) {
        console.error(
          `    - id=${r.id}  ${r.periodLabel}  建立於 ${r.createdAt.toISOString()}`,
        );
      }
    }
    console.error(
      "\n請先決定每個期間要保留哪一份定稿（其餘可改為 DRAFT 或刪除），再重跑本腳本。",
    );
    process.exitCode = 1;
    return;
  }

  const todo = planned.filter(
    (r) =>
      r.periodKey !== r.nextKey ||
      (r.status === "CONFIRMED"
        ? r.confirmedPeriodKey !== r.nextKey
        : r.confirmedPeriodKey !== null),
  );

  if (todo.length === 0) {
    console.log("所有列都已回填，無需變更。");
    return;
  }

  console.log(`\n將更新 ${todo.length} 筆：`);
  for (const r of todo) {
    const mark = r.status === "CONFIRMED" ? "［定稿］" : "［草稿］";
    console.log(
      `  ${mark} ${r.periodLabel.padEnd(16)} ${r.type.padEnd(10)} → ${r.nextKey}` +
        `  ${r.project.code}／${r.project.name}`,
    );
  }

  /*
    同專案同期間的重複草稿：不阻擋回填（草稿沒有唯一約束，也不會有資料損失），
    但必須講出來 —— 回填後 `findDraftForPeriod` 只會取其中最新的一筆，
    其餘幾筆會留在清單裡卻永遠不再被覆寫，看起來像同一個月有好幾份草稿。
    這些通常是「開啟頁面即自動產製」時代留下的殘骸。
  */
  const draftsByKey = new Map<string, typeof planned>();
  for (const r of planned) {
    if (r.status !== "DRAFT") continue;
    const k = `${r.projectId}|${r.nextKey}`;
    const list = draftsByKey.get(k);
    if (list) list.push(r);
    else draftsByKey.set(k, [r]);
  }
  const dupDrafts = [...draftsByKey.values()].filter((l) => l.length > 1);
  if (dupDrafts.length > 0) {
    console.warn("\n⚠️  同一專案同一期間有多份草稿（回填不受影響，但建議清理）：");
    for (const list of dupDrafts) {
      const sorted = [...list].sort(
        (a, b) => b.generatedAt.getTime() - a.generatedAt.getTime(),
      );
      console.warn(`\n  ${sorted[0].project.code} ${sorted[0].nextKey}`);
      sorted.forEach((r, i) => {
        console.warn(
          `    ${i === 0 ? "保留（最新）" : "多餘"}  id=${r.id}  產生於 ${r.generatedAt.toISOString()}`,
        );
      });
    }
    console.warn(
      "\n可於畫面上的「留存的報表」逐筆刪除多餘者；或先回填、之後再清理皆可。",
    );
  }

  if (!APPLY) {
    console.log("\n（未加 --apply，以上僅為預覽，未寫入任何資料）");
    return;
  }

  // 一次交易：要嘛全部回填，要嘛維持原狀，不留半套狀態
  await prisma.$transaction(
    todo.map((r) =>
      prisma.generatedReport.update({
        where: { id: r.id },
        data: {
          periodKey: r.nextKey,
          /*
            草稿一律把 confirmedPeriodKey 清為 null。
            該欄是「定稿唯一」約束的載體，草稿上殘留舊值會占用
            (projectId, confirmedPeriodKey) 這個位置，
            使該期間真正要定稿時撞上唯一約束卻找不到對應的定稿列。
          */
          ...(r.status === "CONFIRMED"
            ? { confirmedPeriodKey: r.nextKey }
            : { confirmedPeriodKey: null }),
        },
      }),
    ),
  );
  console.log(`\n✅ 已回填 ${todo.length} 筆。`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
