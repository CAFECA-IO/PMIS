import { test } from "node:test";
import assert from "node:assert/strict";

import {
  NAME_THRESHOLD,
  duplicateWarning,
  findDuplicates,
  hasBlocking,
  normalizeCode,
  normalizeFileName,
  normalizeName,
  similarity,
  type Candidate,
  type ExistingProject,
} from "./project-duplicate";

/**
 * 這組測試的重點在「不該報的別報」。
 *
 * 誤報的代價比漏報大：使用者被問「這是重複嗎」而答案常常是「不是」，
 * 下次就會直接按過去 —— 真的重複時也一樣按過去。
 * 故 (2) 那組近似案例（分標、分期、擴建、續約）是這個模組的主要規格。
 */

const project = (over: Partial<ExistingProject> = {}): ExistingProject => ({
  id: "p1",
  code: "C-115-001",
  name: "臺中市烏日污水處理廠新建工程",
  ...over,
});

// ── (1) 正規化 ──────────────────────────────────────────────
test("名稱正規化：全角、空白、標點與台臺互通", () => {
  assert.equal(
    normalizeName("臺中市　烏日污水處理廠－新建工程"),
    normalizeName("台中市烏日污水處理廠新建工程"),
  );
});

test("名稱正規化：招標程序的附註不影響是不是同一件工程", () => {
  assert.equal(
    normalizeName("烏日污水處理廠新建工程（第二次招標）"),
    normalizeName("烏日污水處理廠新建工程"),
  );
  assert.equal(
    normalizeName("烏日污水處理廠新建工程(流標後重新公告)"),
    normalizeName("烏日污水處理廠新建工程"),
  );
});

test("名稱正規化保留數字：第一期與第二期是不同專案", () => {
  assert.notEqual(
    normalizeName("烏日污水廠第一期工程"),
    normalizeName("烏日污水廠第二期工程"),
  );
});

test("編號正規化忽略分隔符與大小寫", () => {
  assert.equal(normalizeCode("c115-001"), normalizeCode("C115 001"));
  assert.equal(normalizeCode("１１５-００１"), normalizeCode("115001"));
});

test("檔名正規化只去空白與大小寫，不去版本字樣", () => {
  assert.equal(
    normalizeFileName("01.契約本文(正).DOCX"),
    normalizeFileName("01.契約本文(正).docx"),
  );
  assert.notEqual(
    normalizeFileName("契約_v1.pdf"),
    normalizeFileName("契約_v2.pdf"),
  );
});

test("相似度：完全相同為 1，毫不相干接近 0", () => {
  assert.equal(similarity("abcd", "abcd"), 1);
  assert.ok(similarity("烏日污水處理廠", "台北捷運環狀線") < 0.2);
});

// ── (2) 近似但不是重複：這些都不該報 ────────────────────────
const NOT_DUPLICATES: [string, string, string][] = [
  [
    "擴建與新建是兩件工程",
    "烏日污水處理廠新建工程",
    "烏日污水處理廠擴建工程",
  ],
  [
    "分期是兩件工程",
    "大里溪整治工程第一期",
    "大里溪整治工程第二期",
  ],
  [
    "同一區域的不同標的",
    "台中市烏日區道路拓寬工程",
    "台中市烏日區橋梁補強工程",
  ],
  [
    "監造與施工是不同契約",
    "烏日污水處理廠新建工程施工",
    "烏日污水處理廠新建工程委託監造",
  ],
];

for (const [why, a, b] of NOT_DUPLICATES) {
  test(`不得誤報：${why}`, () => {
    const score = similarity(normalizeName(a), normalizeName(b));
    assert.ok(
      score < NAME_THRESHOLD,
      `「${a}」與「${b}」相似度 ${score.toFixed(2)} 已達門檻 ${NAME_THRESHOLD}，會誤報`,
    );
    assert.deepEqual(findDuplicates({ name: a }, [project({ name: b })]), []);
  });
}

test("不得誤報：同一業主同日開工的不同標案", () => {
  /*
    公共工程的開工日常是同一天，業主又相同 ——
    這是最容易把整批標案報成重複的組合，故業主＋工期不得單獨成立。
  */
  const candidate: Candidate = {
    name: "A標 道路工程",
    client: "台中市政府水利局",
    startDate: "2026-03-01",
    endDate: "2027-02-28",
  };
  const other = project({
    name: "B標 排水工程",
    client: "台中市政府水利局",
    startDate: "2026-03-01",
    endDate: "2027-02-28",
  });
  assert.deepEqual(findDuplicates(candidate, [other]), []);
});

test("空白的候選欄位不得比對出重複", () => {
  assert.deepEqual(findDuplicates({}, [project()]), []);
  assert.deepEqual(
    findDuplicates({ name: "   ", code: "", contractNo: null }, [project()]),
    [],
  );
  // 既有專案沒有契約編號時，候選有編號也不算相同
  assert.deepEqual(
    findDuplicates({ contractNo: "PW-115-A" }, [project({ contractNo: null })]),
    [],
  );
});

// ── (3) 該報的要報 ──────────────────────────────────────────
test("名稱相同（僅差全角與招標附註）→ 報重複", () => {
  const matches = findDuplicates(
    { code: "C-115-999", name: "臺中市　烏日污水處理廠新建工程（第二次招標）" },
    [project()],
  );
  assert.equal(matches.length, 1);
  assert.equal(matches[0].reasons[0].kind, "name");
  assert.equal(matches[0].reasons[0].label, "專案名稱相同");
  assert.equal(matches[0].blocking, false, "換了編號就不是硬約束，應可確認後建立");
});

test("名稱高度相似 → 報重複並附相似度", () => {
  const matches = findDuplicates(
    { name: "台中市烏日污水處理廠新建工程（甲區）" },
    [project()],
  );
  assert.equal(matches.length, 1);
  assert.match(matches[0].reasons[0].detail ?? "", /相似度 \d+%/);
});

test("契約編號相同 → 報重複（同一紙契約不該建兩個專案）", () => {
  const matches = findDuplicates(
    { name: "完全不同的名稱", contractNo: "pw 115 a01" },
    [project({ contractNo: "PW-115-A01" })],
  );
  assert.equal(matches.length, 1);
  assert.equal(matches[0].reasons[0].kind, "contractNo");
});

test("同一份契約檔案已被別的專案用過 → 報重複", () => {
  const matches = findDuplicates(
    { name: "另一個名字", fileNames: ["01.契約本文(正).docx"] },
    [project({ fileNames: ["附件.pdf", "01.契約本文(正).DOCX"] })],
  );
  assert.equal(matches.length, 1);
  assert.equal(matches[0].reasons[0].kind, "fileName");
  assert.equal(matches[0].reasons[0].detail, "01.契約本文(正).DOCX");
});

test("已有其他理由時，業主與工期作為補強一併列出", () => {
  const matches = findDuplicates(
    {
      name: "臺中市烏日污水處理廠新建工程",
      client: "台中市政府水利局",
      startDate: "2026-03-01",
      endDate: "2027-02-28",
    },
    [
      project({
        client: "台中市政府水利局",
        startDate: "2026-03-01",
        endDate: "2027-02-28",
      }),
    ],
  );
  assert.deepEqual(
    matches[0].reasons.map((r) => r.kind),
    ["name", "clientAndDates"],
  );
});

test("工期只對上一端不算相同", () => {
  const matches = findDuplicates(
    {
      name: "臺中市烏日污水處理廠新建工程",
      client: "台中市政府水利局",
      startDate: "2026-03-01",
      endDate: "2028-06-30",
    },
    [
      project({
        client: "台中市政府水利局",
        startDate: "2026-03-01",
        endDate: "2027-02-28",
      }),
    ],
  );
  assert.deepEqual(matches[0].reasons.map((r) => r.kind), ["name"]);
});

// ── (4) 編號撞號是硬阻擋 ────────────────────────────────────
test("專案編號已存在 → blocking，且理由排最前", () => {
  const matches = findDuplicates(
    { code: "c115001", name: "毫不相干的名字" },
    [project()],
  );
  assert.equal(matches.length, 1);
  assert.equal(matches[0].blocking, true);
  assert.equal(matches[0].reasons[0].kind, "code");
  assert.ok(hasBlocking(matches));
  assert.match(duplicateWarning(matches), /請改用其他編號/);
  assert.match(duplicateWarning(matches), /C-115-001/);
});

test("非阻擋的情況說明「仍要建立」的代價", () => {
  const matches = findDuplicates({ name: "臺中市烏日污水處理廠新建工程" }, [
    project(),
  ]);
  assert.equal(hasBlocking(matches), false);
  const text = duplicateWarning(matches);
  assert.match(text, /兩個獨立專案/);
  assert.match(text, /無法合併/, "使用者該知道代價不只是多一列");
});

test("沒有重複時不產生任何文字", () => {
  assert.equal(duplicateWarning([]), "");
});

// ── (5) 多筆命中與排序 ──────────────────────────────────────
test("命中多個專案時全部回報，且可靠的理由排前面", () => {
  const matches = findDuplicates(
    {
      code: "C-115-001",
      name: "臺中市烏日污水處理廠新建工程",
      contractNo: "PW-115-A01",
    },
    [
      project({ id: "weak", code: "OTHER-1", name: "台中市烏日污水處理廠新建工程" }),
      project({ id: "byContract", code: "OTHER-2", contractNo: "PW-115-A01", name: "x" }),
      project({ id: "byCode" }),
    ],
  );
  assert.deepEqual(
    matches.map((m) => m.project.id),
    ["byCode", "byContract", "weak"],
    "編號撞號最確定，其次契約編號，名稱相似最後",
  );
});

test("多筆時的說明以數量呈現，不只講第一個", () => {
  const matches = findDuplicates({ name: "臺中市烏日污水處理廠新建工程" }, [
    project({ id: "a", code: "A" }),
    project({ id: "b", code: "B" }),
  ]);
  assert.equal(matches.length, 2);
  assert.match(duplicateWarning(matches), /已有 2 個相似專案/);
});
