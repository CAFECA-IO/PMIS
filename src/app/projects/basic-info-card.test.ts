import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * 基本資料卡與儲存動作的欄位對齊。
 *
 * 這裡守的是一種安靜的錯：表單的 name 與伺服器讀取的鍵只要有一個不合，
 * 使用者填了、按了儲存、畫面也沒報錯，但那一欄就是存不進去 ——
 * 而他要到下次翻開才會發現，且會以為是自己忘了填。
 */

// 測試檔刻意不放在 [id]/ 目錄下：測試的 glob 會把 [id] 當成「字元集合」，
// 那個目錄下的測試一個都不會被執行 —— 我第一次就放進去，
// 結果顯示「0 tests」而不是失敗（而寫這段註解時又因為裡面的星號斜線
// 提早關閉了區塊註解，所以改用行註解）。
const ROOT = path.resolve(import.meta.dirname, "..", "..", "..");
const read = (p: string) => readFileSync(path.join(ROOT, p), "utf8");

const CARD = "src/app/projects/[id]/basic-info-card.tsx";
const ACTIONS = "src/app/projects/actions.ts";

/** 伺服器在 updateProjectAction 裡實際讀取的欄位。 */
function serverFields(): Set<string> {
  const source = read(ACTIONS);
  const start = source.indexOf("export async function updateProjectAction");
  assert.ok(start > 0, "找不到 updateProjectAction");
  const body = source.slice(start, source.indexOf("\n}", start));
  return new Set(
    [...body.matchAll(/field\(formData, "(\w+)"\)/g)].map((m) => m[1]),
  );
}

/** 卡片表單送出的欄位。 */
function formFields(): Set<string> {
  const source = read(CARD);
  const names = new Set<string>();
  for (const m of source.matchAll(/\bname="(\w+)"/g)) names.add(m[1]);
  // <Text name="…" /> 這種包裝也算
  for (const m of source.matchAll(/<Text\s+label="[^"]*"\s+name="(\w+)"/g)) {
    names.add(m[1]);
  }
  return names;
}

test("表單送出的每個欄位，伺服器都讀得到", () => {
  const server = serverFields();
  const form = formFields();
  const orphans = [...form].filter((f) => f !== "id" && !server.has(f));
  assert.deepEqual(
    orphans,
    [],
    `這些欄位填了不會存進資料庫：${orphans.join("、")}`,
  );
});

test("伺服器接受的欄位都在卡片上出現得到（否則使用者改不到）", () => {
  const server = serverFields();
  const form = formFields();
  const missing = [...server].filter((f) => f !== "id" && !form.has(f));
  assert.deepEqual(
    missing,
    [],
    `伺服器接受但卡片沒有欄位可改：${missing.join("、")}`,
  );
});

test("專案編號唯讀 —— 它是各處參照此專案的鍵", () => {
  const source = read(CARD);
  assert.match(source, /id="code-ro"[\s\S]{0,120}disabled/);
  assert.ok(
    !/name="code"/.test(source),
    "編號不可送出，否則會有人以為改得動",
  );
});

test("唯讀狀態列出的欄位與表單一致，順序也相同", () => {
  /*
    「看到的」與「能改的」不是同一組欄位，是這次改版要修掉的病 ——
    先前總覽只顯示六項，另一個分頁的表單又少了業主與契約金額。
  */
  const source = read(CARD);
  const rows = [...source.matchAll(/\{ key: "(\w+)", label:/g)].map((m) => m[1]);
  const form = formFields();
  const editable = rows.filter((r) => r !== "code");
  assert.deepEqual(
    editable.filter((r) => !form.has(r)),
    [],
    "唯讀有列出、表單卻沒有可改的欄位",
  );
  assert.ok(rows.length >= 13, `欄位僅 ${rows.length} 項，應完整呈現基本資料`);
});

// ── 分頁與刪除的位置 ────────────────────────────────────────
const PAGE = "src/app/projects/[id]/page.tsx";

test("專案頁只有三個分頁", () => {
  const source = read(PAGE);
  const start = source.indexOf("const TABS = [");
  const tabs = [
    ...source.slice(start, source.indexOf("] as const;", start)).matchAll(
      /key: "(\w+)"/g,
    ),
  ].map((m) => m[1]);
  assert.deepEqual(tabs, ["overview", "contract", "changes"]);
});

test("被移除的分頁不得留下任何殘骸", () => {
  /*
    留著 active === "members" 這種分支不會壞掉，但它是死碼：
    改網址就能到達一個導覽上看不見的畫面，之後沒有人會維護它。
  */
  const source = read(PAGE);
  for (const gone of ["basic", "members", "obligations", "related"]) {
    assert.ok(
      !source.includes(`active === "${gone}"`),
      `active === "${gone}" 應已隨分頁一併移除`,
    );
  }
});

test("刪除不與日常操作放在一起", () => {
  const source = read(PAGE)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "");
  const header = source.slice(
    source.indexOf("<PageHeader"),
    source.indexOf("/>", source.indexOf("<PageHeader")),
  );
  assert.ok(
    !header.includes("DeleteProjectButton"),
    "刪除不該與標題列的日常控制項並列 —— 遲早有人點錯",
  );
  // 只在總覽出現，且需編輯權
  assert.match(source, /\{active === "overview" && canEdit \? \(/);
  assert.match(source, /border-dashed/, "以虛線框與實心卡片區隔層級");
});

test("刪除的把關留在確認視窗，而非靠按鈕顏色", () => {
  const button = read("src/app/projects/[id]/delete-project-button.tsx");
  assert.match(button, /requireText="DELETE"/, "須手動輸入才可執行");
  assert.match(button, /triggerVariant="ghost"/, "按鈕本身應低調");
  assert.match(button, /confirmVariant="destructive"/, "份量放在確認視窗");
});

test("人力配置只剩帳號管理一個入口", () => {
  const page = read(PAGE);
  assert.ok(!page.includes("addProjectMemberAction"), "專案頁不該再有配置動作");
  const projectActions = read("src/app/projects/actions.ts");
  assert.ok(
    !projectActions.includes("export async function addProjectMemberAction"),
    "兩處都能改成員時，權限規則遲早漂移",
  );
  const peopleActions = read("src/app/people/actions.ts");
  assert.match(peopleActions, /assignProjectMemberAction/);
  // 第二層把關：只有系統管理員與計畫主管能調整
  assert.match(peopleActions, /canSeeAllProjects\(me\.role\)/);
});
