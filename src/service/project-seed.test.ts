import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  PROJECT_SEEDS,
  contractTotal,
  valuatedTotal,
  weightTotal,
} from "../../prisma/seeds/projects";

/**
 * 模擬資料的自洽性。
 *
 * 對不上的模擬資料比沒有資料更糟：畫面看起來正常，數字卻是假的，
 * 之後拿它驗證新功能會得到錯誤的結論。第一次跑這組檢查就抓到
 * 五個專案的契約金額都與分項合計不符、以及一個權重只加到 85。
 */

const ROOT = path.resolve(import.meta.dirname, "..", "..");

for (const p of PROJECT_SEEDS) {
  test(`${p.code} 契約金額等於各分項數量 × 單價之和`, () => {
    assert.equal(
      contractTotal(p),
      p.budget,
      `差 ${(p.budget - contractTotal(p)).toLocaleString()} 元 —— ` +
        "台帳上「累計估驗 / 契約金額」的百分比會是錯的",
    );
  });

  test(`${p.code} 履約事項權重合計為 100`, () => {
    assert.equal(weightTotal(p), 100, "權重不滿 100 時整體進度永遠到不了 100%");
  });

  test(`${p.code} 每項履約事項都有契約依據`, () => {
    const missing = p.obligations.filter((o) => !o.contractBasis.trim());
    assert.deepEqual(missing.map((o) => o.title), []);
  });

  test(`${p.code} 參照都指得到實際存在的項目`, () => {
    const scopeTitles = new Set(p.scope.map((s) => s.title));
    const obCodes = new Set(p.obligations.map((o) => o.code));
    for (const o of p.obligations) {
      if (o.scopeRef) assert.ok(scopeTitles.has(o.scopeRef), `${o.code} 的 scopeRef「${o.scopeRef}」不存在`);
    }
    for (const w of p.workItems) {
      if (w.scopeRef) assert.ok(scopeTitles.has(w.scopeRef), `${w.code} 的 scopeRef「${w.scopeRef}」不存在`);
      if (w.obligationRef) {
        assert.ok(obCodes.has(w.obligationRef), `${w.code} 的 obligationRef「${w.obligationRef}」不存在`);
      }
    }
  });

  test(`${p.code} 數量與日期合乎常識`, () => {
    for (const w of p.workItems) {
      assert.ok(w.completedQty <= w.contractQty, `${w.name} 完成量超過契約數量`);
      assert.ok(w.valuatedQty <= w.completedQty, `${w.name} 估驗量超過完成量`);
      // 已完成者進度必須是 100，反之亦然 —— 兩處不一致時畫面會自相矛盾
      if (w.status === "COMPLETED") assert.equal(w.progress, 100, `${w.name} 已完成但進度非 100`);
      if (w.progress === 100) assert.equal(w.status, "COMPLETED", `${w.name} 進度 100 但狀態非已完成`);
      if (w.plannedStart && w.plannedEnd) {
        assert.ok(w.plannedStart <= w.plannedEnd, `${w.name} 預定起訖顛倒`);
      }
      if (w.actualStart && w.actualEnd) {
        assert.ok(w.actualStart <= w.actualEnd, `${w.name} 實際起訖顛倒`);
      }
    }
    if (p.noticeDate) assert.ok(p.signedDate <= p.noticeDate, "簽約日不得晚於開工命令日");
    if (p.noticeDate && p.startDate) {
      assert.ok(p.noticeDate <= p.startDate, "開工命令日不得晚於開工日");
    }
    if (p.startDate && p.endDate) assert.ok(p.startDate < p.endDate, "開工日不得晚於完工日");
  });

  test(`${p.code} 完成的履約事項有實際完成日，未完成的沒有`, () => {
    for (const o of p.obligations) {
      if (o.status === "DONE") {
        assert.ok(o.actualDate, `${o.title} 標為完成卻沒有實際完成日`);
      } else {
        assert.ok(!o.actualDate, `${o.title} 未完成卻有實際完成日`);
      }
    }
  });
}

test("編號唯一，且涵蓋規劃中／施工中／已完工", () => {
  const codes = PROJECT_SEEDS.map((p) => p.code);
  assert.equal(new Set(codes).size, codes.length, "專案編號有 unique 約束");
  const statuses = new Set(PROJECT_SEEDS.map((p) => p.status));
  for (const s of ["PLANNING", "ACTIVE", "COMPLETED"]) {
    assert.ok(statuses.has(s as never), `缺少 ${s} 狀態的案例`);
  }
});

test("含一件服務型契約：履約事項全為定期或條件義務", () => {
  /*
    沒有這種案子，甘特圖與履約事項頁只會被施工節點填滿，
    那些定期義務（每月月報、每季督導）的呈現就從來沒被驗證過。
  */
  const service = PROJECT_SEEDS.find((p) => p.name.includes("監造技術服務"));
  assert.ok(service, "應有一件委託監造服務案");
  const periodic = service!.obligations.filter(
    (o) => o.triggerType === "RELATIVE_DUE" || o.triggerType === "CONDITION",
  );
  assert.ok(
    periodic.length >= service!.obligations.length - 2,
    "服務型契約的履約事項應以定期／條件義務為主",
  );
});

test("已完工的案子累計估驗達契約金額", () => {
  const done = PROJECT_SEEDS.filter((p) => p.status === "COMPLETED");
  assert.ok(done.length > 0);
  for (const p of done) {
    assert.equal(valuatedTotal(p), contractTotal(p), `${p.code} 已完工卻未估驗完`);
    assert.ok(
      p.workItems.every((w) => w.status === "COMPLETED"),
      `${p.code} 已完工卻有未完成的分項`,
    );
  }
});

test("規劃中的案子沒有任何實績", () => {
  for (const p of PROJECT_SEEDS.filter((x) => x.status === "PLANNING")) {
    assert.equal(valuatedTotal(p), 0, `${p.code} 尚未開工卻有估驗`);
    assert.ok(
      p.obligations.every((o) => o.status === "NOT_STARTED"),
      `${p.code} 尚未開工卻有已起算的履約事項`,
    );
  }
});

test("seed.ts 不再自行建立專案，一律走 seeds/projects.ts", () => {
  /*
    兩處都能建專案時，新增欄位只會補在其中一處 ——
    這正是這次要修的病：契約簽訂日、合約標的、數量單價在舊 seed 全是空的。
  */
  const source = readFileSync(path.join(ROOT, "prisma/seed.ts"), "utf8");
  assert.match(source, /await seedProjects\(prisma\)/);
  assert.ok(
    !source.includes("prisma.project.create"),
    "seed.ts 不該再自己建專案",
  );
  assert.ok(
    !source.includes("prisma.contractObligation.createMany"),
    "履約事項應隨專案一併建立，才保證每項都有契約依據",
  );
});
