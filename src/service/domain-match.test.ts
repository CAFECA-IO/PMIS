import { test } from "node:test";
import assert from "node:assert/strict";

import {
  MAX_TERMS_PER_GROUP,
  describeMatch,
  domainBrief,
  domainIds,
  managementPatternBrief,
  matchDomain,
  rankWorkItems,
  workItemShapeBrief,
  MAX_WORK_ITEM_HINTS,
} from "./domain-match";
import { DOMAINS, totalWorkItems } from "@/constant/domain-knowledge";

/**
 * 取自真實文件：彰化縣和美鎮污水下水道系統第一期水資源回收中心新建工程
 * 第 23 次進度及品質檢討會議施工報告。用它當夾具，確保知識庫涵蓋
 * 實務上真正會出現的用語，而不是我們想像的用語。
 */
const REPORT = `彰化縣和美鎮污水下水道系統第一期水資源回收中心新建工程
第23次進度及品質檢討會議施工報告
契約工期 720 工作天　開工日期 111年09月05日
上週主要工作項目：沉箱第一單元（已於 4/6 完成下沉作業）、地盤改良工程（聯合機房）
本週主要工作項目：沉箱第二單元（於 4/11 完成內模組立）、地盤改良鑽心取樣
材料設備送審：導線管、矩型刮泥機、洗砂機、閘門、初沉污泥泵
主要設備尚未提送：沉水式泵浦、細攔污柵、浮渣分離機、臭氧洗滌塔、帶濾式脫水機、鼓風機、柴油引擎發電機
施工計畫送審：預鑄人孔工程施工計畫、混凝土基樁施工計畫、電氣設備工程施工計畫、儀控工程施工計畫
列管追蹤事項：二沉池過濾管、進抽站粗攔污柵`;

// ── 分類 ────────────────────────────────────────────────────
test("真實的污水廠報告被判為水資源領域", () => {
  const m = matchDomain(REPORT);
  assert.equal(m.domain?.id, "water");
  assert.equal(m.isConstruction, true, "這是施作契約，不是委託服務");
  assert.ok(m.hits.includes("污水下水道"));
  assert.ok(m.hits.includes("水資源回收中心"));
});

test("委託專業服務契約被判為服務類，不套用施作契約的規則", () => {
  const m = matchDomain(
    "桃園市埔頂計畫區污水下水道系統促參計畫 委託履約管理機構專業服務(第四期)。" +
      "本服務為委託專業服務，內容包含履約管理、監造、技術服務。",
  );
  assert.equal(m.domain?.id, "service");
  assert.equal(m.isConstruction, false);
});

test("以出現次數計分，主題明確者勝出", () => {
  const m = matchDomain(
    "道路拓寬工程，路面刨除後重新舖築。本案道路全長 1.2 公里，人行道一併改善。" +
      "施工期間如遇橋梁段另案辦理。",
  );
  assert.equal(m.domain?.id, "road", "道路詞彙遠多於偶然提到的橋梁");
});

test("沒有任何關鍵詞時不硬套領域", () => {
  const m = matchDomain("本契約為一般採購，內容為文具用品供應。");
  assert.equal(m.domain, null);
  assert.equal(m.isConstruction, false);
  assert.deepEqual(m.hits, []);
});

test("空輸入不拋錯", () => {
  for (const v of ["", "   ", null, undefined]) {
    const m = matchDomain(v);
    assert.equal(m.domain, null);
  }
});

test("同一份文字重複判定結果一致（可預期）", () => {
  const a = matchDomain(REPORT);
  const b = matchDomain(REPORT);
  assert.equal(a.domain?.id, b.domain?.id);
  assert.deepEqual(a.hits, b.hits);
});

// ── 知識庫涵蓋度：以真實文件驗證 ────────────────────────────
test("知識庫涵蓋這份報告實際出現的設備名稱", () => {
  const water = DOMAINS.find((d) => d.id === "water")!;
  const fromReport = [
    "粗攔污柵",
    "細攔污柵",
    "沉水式泵浦",
    "初沉污泥泵",
    "矩型刮泥機",
    "洗砂機",
    "浮渣分離機",
    "帶濾式脫水機",
    "臭氧洗滌塔",
    "鼓風機",
    "閘門",
    "柴油引擎發電機",
    "導線管",
  ];
  for (const item of fromReport) {
    assert.ok(
      water.equipment.includes(item),
      `知識庫缺少實際出現的設備：${item}`,
    );
  }
});

test("知識庫涵蓋這份報告實際出現的工序", () => {
  const water = DOMAINS.find((d) => d.id === "water")!;
  for (const item of [
    "地盤改良",
    "沉箱下沉作業",
    "內模組立",
    "鋼筋續接器安裝",
    "預鑄人孔安裝",
    "基樁施作",
  ]) {
    assert.ok(water.sequences.includes(item), `知識庫缺少實際工序：${item}`);
  }
});

test("知識庫涵蓋這份報告提到的構造物", () => {
  const water = DOMAINS.find((d) => d.id === "water")!;
  for (const item of ["沉箱", "聯合機房", "初沉池", "二沉池"]) {
    assert.ok(water.structures.includes(item), `知識庫缺少構造物：${item}`);
  }
});

// ── 注入的提示詞段落 ────────────────────────────────────────
test("領域段落明說這是參考用語而非應輸出的清單", () => {
  const brief = domainBrief(matchDomain(REPORT))!;
  assert.match(brief, /參考/);
  assert.match(brief, /不是應輸出的清單/);
  assert.match(brief, /契約沒提到的項目一律不得寫入/);
});

test("領域段落只含命中的領域，不夾帶其他領域的詞彙", () => {
  const brief = domainBrief(matchDomain(REPORT))!;
  assert.match(brief, /攔污柵/, "應含水資源領域詞彙");
  assert.doesNotMatch(brief, /橋台|預力梁/, "不得夾帶橋梁詞彙");
  assert.doesNotMatch(brief, /瀝青混凝土舖築/, "不得夾帶道路詞彙");
});

test("每類詞彙有數量上限，不灌爆提示詞", () => {
  const brief = domainBrief(matchDomain(REPORT))!;
  const line = brief
    .split("\n")
    .find((l) => l.startsWith("常見構造物"))!;
  assert.ok(
    line.split("、").length <= MAX_TERMS_PER_GROUP,
    "構造物列出的項數超過上限",
  );
});

test("沒有命中領域時不產生段落", () => {
  assert.equal(domainBrief(matchDomain("文具採購")), null);
});

// ── 分項組織方式 ────────────────────────────────────────────
test("施作契約說明分項應為構造物單元 × 工序", () => {
  const brief = workItemShapeBrief(matchDomain(REPORT))!;
  assert.match(brief, /構造物單元/);
  assert.match(brief, /沉箱第一單元下沉作業/, "以真實例子說明最有效");
  assert.match(brief, /不是籠統的/);
  assert.match(brief, /逐一展開/, "分區與單元要展開");
});

test("委託服務契約不套用施作的分項組織方式", () => {
  const m = matchDomain("本案為委託專業服務，辦理履約管理與監造。");
  assert.equal(workItemShapeBrief(m), null);
  assert.equal(managementPatternBrief(m), null);
});

// ── 管理類事項 ──────────────────────────────────────────────
test("管理類事項一律要求回契約查證，不得當成必然義務", () => {
  const brief = managementPatternBrief(matchDomain(REPORT))!;
  assert.match(brief, /找得到對應條款才列入，找不到就不列/);
  assert.match(brief, /進度及品質檢討會議/);
  assert.match(brief, /表定提送日期/, "應點出契約訂期限的欄位名");
  assert.match(brief, /再次提送/, "審退後重送是真實流程");
});

test("說明判讀依據，讓使用者能核對是否套錯領域", () => {
  const text = describeMatch(matchDomain(REPORT))!;
  assert.match(text, /污水下水道與水資源回收/);
  assert.match(text, /命中/);
  assert.equal(describeMatch(matchDomain("文具採購")), null);
});

// ── 知識庫本身的完整性 ──────────────────────────────────────
test("每個領域都有關鍵詞，否則永遠不會被選中", () => {
  for (const d of DOMAINS) {
    assert.ok(d.keywords.length > 0, `${d.id} 沒有關鍵詞`);
    assert.ok(d.label.trim() !== "", `${d.id} 沒有名稱`);
  }
});

test("領域 id 不重複", () => {
  const ids = domainIds();
  assert.equal(new Set(ids).size, ids.length);
});

test("詞彙不得混入英文（會讓模型輸出中英夾雜）", () => {
  const ok = /^[一-鿿（）()０-９0-9\s／/、·A-Z]+$/;
  for (const d of DOMAINS) {
    for (const group of [d.structures, d.sequences, d.equipment]) {
      for (const term of group) {
        assert.ok(ok.test(term), `${d.id} 的詞彙含非預期字元：${term}`);
      }
    }
  }
});

// ── 知識庫規模與品質 ────────────────────────────────────────
test("參考工程分項至少 500 項（去重後）", () => {
  assert.ok(
    totalWorkItems() >= 500,
    `目前僅 ${totalWorkItems()} 項，未達 500`,
  );
});

test("同一領域內的分項不得重複", () => {
  for (const d of DOMAINS) {
    const seen = new Set<string>();
    for (const w of d.workItems) {
      assert.ok(!seen.has(w), `${d.id} 內重複：${w}`);
      seen.add(w);
    }
  }
});

test("分項名稱不得混入英文或空白異常", () => {
  // 允許單一空格：中文排版慣例在拉丁字母前後留空（如「L 型側溝施作」），
  // 但不得有連續空格或前後空白。
  const ok = /^[一-鿿（）()０-９0-9A-Z]+(?: [一-鿿（）()０-９0-9A-Z]+)*$/;
  for (const d of DOMAINS) {
    for (const w of d.workItems) {
      assert.ok(ok.test(w), `${d.id} 的分項含非預期字元：${w}`);
      assert.doesNotMatch(w, /  /, `${d.id} 的分項含連續空格：${w}`);
      assert.equal(w, w.trim(), `${d.id} 的分項有前後空白：${w}`);
      assert.ok(w.length >= 3, `${d.id} 的分項過短，不像分項名：${w}`);
      assert.ok(w.length <= 20, `${d.id} 的分項過長：${w}`);
    }
  }
});

test("土木與水利各主要領域都有足夠的分項", () => {
  const min: Record<string, number> = {
    water: 60,
    hydraulic: 60,
    waterSupply: 30,
    geotech: 30,
    building: 50,
    road: 40,
    bridge: 40,
    tunnel: 25,
    port: 25,
    pipeline: 25,
    mep: 30,
  };
  for (const [id, n] of Object.entries(min)) {
    const d = DOMAINS.find((x) => x.id === id)!;
    assert.ok(d, `缺少領域 ${id}`);
    assert.ok(
      d.workItems.length >= n,
      `${id} 只有 ${d.workItems.length} 項，少於 ${n}`,
    );
  }
});

// ── 來源標記 ────────────────────────────────────────────────
test("每個領域都標明來源，水資源領域為已驗證", () => {
  for (const d of DOMAINS) {
    assert.ok(
      d.provenance === "verified" || d.provenance === "ai-pending-review",
      `${d.id} 沒有有效的來源標記`,
    );
  }
  assert.equal(
    DOMAINS.find((d) => d.id === "water")!.provenance,
    "verified",
    "水資源領域取自真實監造報告",
  );
});

test("尚未查證的領域確實標為待審閱，不得謊稱已驗證", () => {
  for (const id of ["hydraulic", "waterSupply", "geotech", "tunnel", "port", "mep"]) {
    assert.equal(
      DOMAINS.find((d) => d.id === id)!.provenance,
      "ai-pending-review",
      `${id} 未經官方文件查證，不應標為 verified`,
    );
  }
});

// ── 相關性排序 ──────────────────────────────────────────────
test("依契約內文挑出相關分項，不相關者不注入", () => {
  const items = [
    "沉箱第一單元下沉作業",
    "橋墩帽梁澆置",
    "初沉池刮泥機安裝",
    "隧道環片組裝",
  ];
  const picked = rankWorkItems(items, "本工程包含沉箱下沉作業與初沉池刮泥機安裝。");
  assert.ok(picked.includes("沉箱第一單元下沉作業"));
  assert.ok(picked.includes("初沉池刮泥機安裝"));
  assert.ok(!picked.includes("橋墩帽梁澆置"), "無關的橋梁分項不應注入");
  assert.ok(!picked.includes("隧道環片組裝"));
});

test("注入數量有上限，五百多項不會全塞進提示詞", () => {
  const water = DOMAINS.find((d) => d.id === "water")!;
  const picked = rankWorkItems(water.workItems, REPORT);
  assert.ok(
    picked.length <= MAX_WORK_ITEM_HINTS,
    `注入 ${picked.length} 項，超過上限 ${MAX_WORK_ITEM_HINTS}`,
  );
  assert.ok(picked.length > 0, "應挑出相關項目");
});

test("完全無命中時退回前段，而非回空清單", () => {
  const picked = rankWorkItems(["甲項作業", "乙項作業"], "完全不相關的文字", 1);
  assert.equal(picked.length, 1);
});

test("排序穩定：同一輸入結果一致", () => {
  const water = DOMAINS.find((d) => d.id === "water")!;
  assert.deepEqual(
    rankWorkItems(water.workItems, REPORT),
    rankWorkItems(water.workItems, REPORT),
  );
});

test("空契約文字時不排序，只取前段", () => {
  const picked = rankWorkItems(["甲", "乙", "丙"], "", 2);
  assert.deepEqual(picked, ["甲", "乙"]);
});

test("領域段落含挑選後的參考分項並說明取樣比例", () => {
  const brief = domainBrief(matchDomain(REPORT), REPORT)!;
  assert.match(brief, /參考工程分項/);
  assert.match(brief, /項中取/, "應說明是從幾項中挑出幾項");
  assert.match(brief, /沉箱/, "應含與本契約相關的分項");
});

test("未提供契約文字時不列參考分項（無從判斷相關性）", () => {
  const brief = domainBrief(matchDomain(REPORT))!;
  assert.doesNotMatch(brief, /參考工程分項/);
});
