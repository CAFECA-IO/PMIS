import { test } from "node:test";
import assert from "node:assert/strict";

import {
  applyImport,
  buildReview,
  countOverwrites,
  countSelected,
  defaultSelection,
  effectiveSelection,
  importSummary,
  progressPercent,
  runningStep,
  sectionCheck,
  toggleItem,
  toggleSection,
  type CurrentForm,
  type Proposal,
} from "./wizard-review";
import {
  STEP_ORDER,
  type StepProgress,
  type WizardStepId,
} from "./wizard-steps";

const FIELD_LABELS = [
  { key: "code", label: "專案編號" },
  { key: "name", label: "專案名稱" },
  { key: "client", label: "業主" },
  { key: "budget", label: "契約金額" },
];

const PROPOSAL: Proposal = {
  fields: { code: "WURI-2026", name: "污水處理廠新建工程", client: "水利署" },
  scopeItems: [
    { code: "(一)", title: "審查施工計畫", sourceClause: "契約第五條" },
    { title: "查核工程進度" },
  ],
  obligations: [
    {
      code: "A-01",
      title: "提送施工計畫書",
      contractBasis: "契約第五條第二款",
      stage: "CONSTRUCTION",
      dueDate: "2026-09-30",
    },
    { code: "A-02", title: "每月提送月報", contractBasis: "契約第十一條", stage: "CONSTRUCTION" },
    { title: "竣工查驗" },
  ],
};

const ALL_DONE: StepProgress[] = [
  { id: "profile", state: "done", count: 3, total: 11 },
  { id: "scope", state: "done", count: 2 },
  { id: "obligations", state: "done", count: 3, total: 2 },
];

const current = (over: Partial<CurrentForm> = {}): CurrentForm => ({
  fields: {},
  obligationTitles: [],
  ...over,
});

const review = (
  progress = ALL_DONE,
  proposal = PROPOSAL,
  cur = current(),
  notes?: Partial<Record<string, string>>,
) =>
  buildReview({
    progress,
    proposal,
    current: cur,
    notes: notes as never,
    fieldLabels: FIELD_LABELS,
  });

const section = (id: string, sections = review()) => {
  const s = sections.find((x) => x.id === id);
  assert.ok(s, `找不到區段 ${id}`);
  return s;
};

// ── 區段組成 ────────────────────────────────────────────────
test("區段順序與解析順序一致，且不含工程分項", () => {
  const ids = review().map((s) => s.id);
  assert.deepEqual(ids, STEP_ORDER);
  assert.deepEqual(ids, ["profile", "scope", "obligations"]);
  assert.ok(!ids.includes("workItems" as never));
  assert.ok(!ids.includes("packages" as never));
});

test("基本資料只列出模型有給值的欄位", () => {
  const s = section("profile");
  assert.deepEqual(
    s.items.map((i) => i.label),
    ["專案編號", "專案名稱", "業主"],
    "契約金額模型沒給，不該出現一列空的",
  );
  assert.equal(s.items[0].detail, "WURI-2026");
});

test("履約標的逐項列出，帶編號與契約條號", () => {
  const s = section("scope");
  assert.equal(s.items.length, 2);
  assert.match(s.items[0].detail ?? "", /\(一\)/);
  assert.match(s.items[0].detail ?? "", /契約第五條/);
});

test("履約事項逐項列出，並以契約依據為主要細節", () => {
  const s = section("obligations");
  assert.deepEqual(
    s.items.map((i) => i.label),
    ["提送施工計畫書", "每月提送月報", "竣工查驗"],
  );
  // 勾選時真正要核對的是「這項管制出自哪一條」
  assert.match(s.items[0].detail ?? "", /^契約第五條第二款/);
  assert.match(s.items[0].detail ?? "", /2026-09-30/);
});

test("空區段不可匯入，但仍列出以說明為何沒有內容", () => {
  const sections = review(ALL_DONE, { fields: {}, obligations: [], scopeItems: [] });
  for (const s of sections) {
    assert.equal(s.importable, false);
    assert.deepEqual(s.items, []);
  }
  assert.equal(sections.length, 3, "沒有內容不代表這一段不存在");
});

// ── 覆蓋標示 ────────────────────────────────────────────────
test("匯入會蓋掉使用者已填的值時明確標示", () => {
  const s = section(
    "profile",
    review(ALL_DONE, PROPOSAL, current({ fields: { name: "我自己填的名稱" } })),
  );
  const name = s.items.find((i) => i.label === "專案名稱");
  assert.equal(name?.overwrites, "我自己填的名稱");
});

test("值相同時不算覆蓋（不必嚇使用者）", () => {
  const s = section(
    "profile",
    review(ALL_DONE, PROPOSAL, current({ fields: { code: "WURI-2026" } })),
  );
  assert.equal(s.items.find((i) => i.label === "專案編號")?.overwrites, null);
});

test("欄位空白時匯入不算覆蓋", () => {
  const s = section(
    "profile",
    review(ALL_DONE, PROPOSAL, current({ fields: { name: "  " } })),
  );
  assert.equal(s.items.find((i) => i.label === "專案名稱")?.overwrites, null);
});

test("同名履約事項標示為補齊而非新增", () => {
  const s = section(
    "obligations",
    review(ALL_DONE, PROPOSAL, current({ obligationTitles: ["提送施工計畫書"] })),
  );
  assert.match(s.items[0].overwrites ?? "", /已有同名事項/);
  assert.equal(s.items[1].overwrites, null);
});

// ── 失敗與略過 ──────────────────────────────────────────────
test("失敗的段落帶錯誤訊息且可重試", () => {
  const s = section(
    "obligations",
    review([
      { id: "profile", state: "done", count: 3 },
      { id: "scope", state: "done", count: 2 },
      { id: "obligations", state: "failed", error: "費思忙線中" },
    ]),
  );
  assert.equal(s.state, "failed");
  assert.equal(s.error, "費思忙線中");
  assert.equal(s.retryable, true);
});

test("略過的段落也可重試（補齊上游後就有內容）", () => {
  const s = section(
    "obligations",
    review([
      { id: "profile", state: "done", count: 3 },
      { id: "scope", state: "done", count: 0 },
      { id: "obligations", state: "skipped", error: "尚未讀出契約履約標的" },
    ]),
  );
  assert.equal(s.retryable, true);
});

test("跑完但沒取得內容者同樣可重試", () => {
  const s = section(
    "scope",
    review(
      [
        { id: "profile", state: "done", count: 3 },
        { id: "scope", state: "done", count: 0 },
        { id: "obligations", state: "done", count: 0 },
      ],
      { fields: PROPOSAL.fields, scopeItems: [], obligations: [] },
    ),
  );
  assert.equal(s.verdict, "empty");
  assert.equal(s.retryable, true, "往往是某一節沒讀到，重跑一次就有了");
});

test("尚未執行的段落不可重試", () => {
  const s = section(
    "obligations",
    review([
      { id: "profile", state: "running" },
      { id: "scope", state: "pending" },
      { id: "obligations", state: "pending" },
    ]),
  );
  assert.equal(s.retryable, false);
});

// ── 勾選 ────────────────────────────────────────────────────
test("預設全選（常見情況一鍵完成）", () => {
  const sections = review();
  const sel = defaultSelection(sections);
  assert.equal(countSelected(sel, sections), 3 + 2 + 3);
});

test("逐項取消與還原", () => {
  const sections = review();
  let sel = defaultSelection(sections);
  const key = section("obligations", sections).items[0].key;
  sel = toggleItem(sel, key);
  assert.equal(sel.has(key), false);
  sel = toggleItem(sel, key);
  assert.equal(sel.has(key), true);
});

test("整段勾選：全選時取消全部，否則補齊全部", () => {
  const sections = review();
  const ob = section("obligations", sections);
  let sel = defaultSelection(sections);
  assert.equal(sectionCheck(sel, ob), "all");

  sel = toggleSection(sel, ob);
  assert.equal(sectionCheck(sel, ob), "none");

  sel = toggleItem(sel, ob.items[0].key);
  assert.equal(sectionCheck(sel, ob), "some", "部分勾選須與全選區分");

  sel = toggleSection(sel, ob);
  assert.equal(sectionCheck(sel, ob), "all", "部分勾選時整段點擊應補齊");
});

test("覆蓋數只計入被勾選者", () => {
  const sections = review(
    ALL_DONE,
    PROPOSAL,
    current({ fields: { name: "我自己填的" } }),
  );
  let sel = defaultSelection(sections);
  assert.equal(countOverwrites(sel, sections), 1);
  const name = section("profile", sections).items.find(
    (i) => i.label === "專案名稱",
  )!;
  sel = toggleItem(sel, name.key);
  assert.equal(countOverwrites(sel, sections), 0);
});

// ── 匯入 ────────────────────────────────────────────────────
test("只匯入勾選的欄位", () => {
  const sections = review();
  let sel = defaultSelection(sections);
  sel = toggleItem(sel, "profile:client");
  const r = applyImport({ sections, selected: sel, proposal: PROPOSAL, current: current() });
  assert.deepEqual(Object.keys(r.fields).sort(), ["code", "name"]);
  assert.equal(r.fields.client, undefined);
});

test("整段取消後該段完全不匯入", () => {
  const sections = review();
  let sel = defaultSelection(sections);
  sel = toggleSection(sel, section("scope", sections));
  const r = applyImport({ sections, selected: sel, proposal: PROPOSAL, current: current() });
  assert.deepEqual(r.scopeItems, []);
});

test("表單上沒有的事項為新增", () => {
  const sections = review();
  const r = applyImport({
    sections,
    selected: defaultSelection(sections),
    proposal: PROPOSAL,
    current: current(),
  });
  assert.deepEqual(
    r.newObligations.map((o) => o.title),
    ["提送施工計畫書", "每月提送月報", "竣工查驗"],
  );
  assert.deepEqual(r.patches, []);
});

test("同名事項只補欄位，不重複新增一列", () => {
  const cur = current({ obligationTitles: ["提送施工計畫書"] });
  const sections = review(ALL_DONE, PROPOSAL, cur);
  const r = applyImport({
    sections,
    selected: defaultSelection(sections),
    proposal: PROPOSAL,
    current: cur,
  });
  assert.deepEqual(
    r.newObligations.map((o) => o.title),
    ["每月提送月報", "竣工查驗"],
  );
  assert.equal(r.patches.length, 1);
  assert.equal(r.patches[0].title, "提送施工計畫書");
  assert.equal(r.patches[0].dueDate, "2026-09-30");
  assert.equal(r.patches[0].code, "A-01");
  assert.equal(
    r.patches[0].contractBasis,
    "契約第五條第二款",
    "既有事項若沒填依據，補齊時要一併帶入",
  );
});

test("什麼都沒勾時匯入結果為空", () => {
  const sections = review();
  const r = applyImport({
    sections,
    selected: new Set(),
    proposal: PROPOSAL,
    current: current(),
  });
  assert.deepEqual(r.fields, {});
  assert.deepEqual(r.newObligations, []);
  assert.deepEqual(r.patches, []);
  assert.deepEqual(r.scopeItems, []);
  assert.match(importSummary(r), /沒有勾選/);
});

test("匯入摘要說出實際做了什麼", () => {
  const sections = review();
  const r = applyImport({
    sections,
    selected: defaultSelection(sections),
    proposal: PROPOSAL,
    current: current(),
  });
  const s = importSummary(r);
  assert.match(s, /基本資料 3 個欄位/);
  assert.match(s, /新增履約事項 3 項/);
  assert.match(s, /合約標的 2 項/);
});

test("空白名稱的提議一律忽略", () => {
  const proposal: Proposal = {
    obligations: [{ title: "   " }, { title: "有效事項" }],
    scopeItems: [{ title: "" }, { title: "有效標的" }],
  };
  const sections = review(ALL_DONE, proposal);
  assert.equal(section("obligations", sections).items.length, 1);
  assert.equal(section("scope", sections).items.length, 1);
});

// ── 進度 ────────────────────────────────────────────────────
test("進度百分比以已結束的段數計算", () => {
  assert.equal(progressPercent([]), 0);
  assert.equal(
    progressPercent([
      { id: "profile", state: "done", count: 1 },
      { id: "scope", state: "running" },
      { id: "obligations", state: "pending" },
    ]),
    33,
  );
  assert.equal(progressPercent(ALL_DONE), 100);
});

test("略過與失敗也算結束（否則進度條永遠停在那裡）", () => {
  assert.equal(
    progressPercent([
      { id: "profile", state: "done", count: 1 },
      { id: "scope", state: "failed", error: "x" },
      { id: "obligations", state: "skipped", error: "y" },
    ]),
    100,
  );
});

test("目前執行中的段落可被指出", () => {
  const p: StepProgress[] = [
    { id: "profile", state: "done", count: 1 },
    { id: "scope", state: "running" },
    { id: "obligations", state: "pending" },
  ];
  assert.equal(runningStep(p)?.id, "scope");
  assert.equal(runningStep(ALL_DONE), null);
});

// ── 重新解析某段之後的勾選 ───────────────────────────────────
const build = (proposal: Proposal = PROPOSAL) =>
  buildReview({
    progress: ALL_DONE,
    proposal,
    current: current(),
    fieldLabels: FIELD_LABELS,
  });

const touched = (...ids: WizardStepId[]) => new Set<WizardStepId>(ids);

test("沒動過的段落一律全選，等同預設全選", () => {
  const sections = build();
  assert.deepEqual(
    [...effectiveSelection(sections, touched(), new Set())].sort(),
    [...defaultSelection(sections)].sort(),
  );
});

test("動過的段落尊重使用者的取捨，不影響其他段", () => {
  const sections = build();
  const obligations = sections.find((s) => s.id === "obligations")!;
  const stored = toggleSection(defaultSelection(sections), obligations);
  const eff = effectiveSelection(sections, touched("obligations"), stored);

  assert.equal(sectionCheck(eff, obligations), "none");
  assert.equal(
    sectionCheck(eff, sections.find((s) => s.id === "profile")!),
    "all",
  );
});

test("重新解析某段後，換新的內容重新被全選", () => {
  const first = build();
  const obligations = first.find((s) => s.id === "obligations")!;
  const stored = toggleItem(defaultSelection(first), obligations.items[0]!.key);
  assert.equal(
    countSelected(effectiveSelection(first, touched("obligations"), stored), first),
    countSelected(defaultSelection(first), first) - 1,
  );

  // 重新解析回來的是完全不同的事項 —— 舊的勾選鍵一個都對不上
  const again = build({
    ...PROPOSAL,
    obligations: [{ title: "重新判讀的事項甲" }, { title: "重新判讀的事項乙" }],
  });
  assert.equal(
    sectionCheck(
      // 重試會把該段自 touched 移除
      effectiveSelection(again, touched(), stored),
      again.find((s) => s.id === "obligations")!,
    ),
    "all",
    "沿用舊集合會讓重新解析的結果全部沒被勾，使用者得再勾一次",
  );
});

test("某段重新解析不會清掉使用者在別段的取捨", () => {
  const sections = build();
  const profile = sections.find((s) => s.id === "profile")!;
  const stored = toggleSection(defaultSelection(sections), profile);
  const eff = effectiveSelection(sections, touched("profile"), stored);
  assert.equal(sectionCheck(eff, profile), "none");
  assert.equal(
    sectionCheck(eff, sections.find((s) => s.id === "obligations")!),
    "all",
  );
});
