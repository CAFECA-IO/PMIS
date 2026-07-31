import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import {
  ALL_PROJECTS_HREF,
  decideProjectsPage,
  decideProjectPage,
  projectHref,
} from "./project-route";
import { currentProject, switchProjectHref } from "./project-link";

const ROOT = path.resolve(import.meta.dirname, "..", "..");
const read = (p: string) => readFileSync(path.join(ROOT, p), "utf8");

const VISIBLE = ["p1", "p2"];

test("沒有選定專案 → 顯示清單", () => {
  assert.deepEqual(decideProjectsPage(null, VISIBLE), { kind: "list" });
  assert.deepEqual(decideProjectsPage("", VISIBLE), { kind: "list" });
  assert.deepEqual(decideProjectsPage("   ", VISIBLE), { kind: "list" });
});

test("有選定專案 → 轉到那個專案，並帶著參數過去", () => {
  const d = decideProjectsPage("p1", VISIBLE);
  assert.equal(d.kind, "redirect");
  assert.equal(d.kind === "redirect" ? d.href : "", "/projects/p1?project=p1");
});

test("選定的專案已不存在或看不到 → 退回清單，不轉去 404", () => {
  /*
    專案被刪除、或使用者被移出該專案時，?project= 還留在網址上。
    轉過去只會得到 404 或權限錯誤，而使用者只是點了左上角。
  */
  assert.deepEqual(decideProjectsPage("gone", VISIBLE), { kind: "list" });
  assert.deepEqual(decideProjectsPage("p1", []), { kind: "list" });
});

test("專案頁的網址一律帶專案參數（側邊欄才顯示得對）", () => {
  assert.equal(currentProject(projectHref("p1").split("?")[1]), "p1");
  assert.equal(projectHref("p1", "obligations"), "/projects/p1?tab=obligations&project=p1");
});

test("參數一致就留在原地", () => {
  assert.deepEqual(decideProjectPage("p1", "p1"), { kind: "stay" });
});

test("沒有參數 → 採用畫面上開著的專案（側邊欄才不會說「全部專案」）", () => {
  for (const missing of [null, undefined, ""]) {
    assert.deepEqual(decideProjectPage("p1", missing), {
      kind: "redirect",
      href: "/projects/p1?project=p1",
    });
  }
});

test("補參數時保留頁籤，切換專案時不保留", () => {
  /*
    分享出去的往往是某個頁籤的連結。補參數就把人丟回總覽，
    等於那個連結壞了。而切到別的專案時，那件的同名頁籤未必是他要看的。
  */
  assert.deepEqual(decideProjectPage("p1", null, "obligations"), {
    kind: "redirect",
    href: "/projects/p1?tab=obligations&project=p1",
  });
  assert.deepEqual(decideProjectPage("p1", "p2", "obligations"), {
    kind: "redirect",
    href: "/projects/p2?project=p2",
  });
});

test("回歸：在專案頁切換專案時，以參數為準而非彈回原本那件", () => {
  /*
    我第一版一律改寫參數去符合路徑，於是使用者在 p1 的頁面上把左上角
    切成 p2，會被立刻送回 p1 —— 症狀是「切換沒有作用」。
    參數是使用者剛剛的動作，比網址路徑更新，該由它決定。
  */
  assert.deepEqual(decideProjectPage("p1", "p2"), {
    kind: "redirect",
    href: "/projects/p2?project=p2",
  });
});

test("切換器在專案頁上會連路徑一起換（否則畫面還是舊的那件）", () => {
  assert.equal(
    switchProjectHref("/projects/p1", "project=p1&tab=obligations", "p2"),
    "/projects/p2?project=p2&tab=obligations",
  );
  // 子頁面（估驗台帳）保留下層路徑
  assert.equal(
    switchProjectHref("/projects/p1/ledger", "project=p1", "p2"),
    "/projects/p2/ledger?project=p2",
  );
  // 切到「全部專案」→ 回清單（單一專案的頁面沒有「全部」可言）
  assert.equal(switchProjectHref("/projects/p1", "project=p1", "all"), "/projects");
  // 專案建置不是專案頁，不得被改寫
  assert.equal(switchProjectHref("/projects/new", "", "p2"), "/projects/new?project=p2");
  // 其他模組維持原本行為
  assert.equal(switchProjectHref("/quality", "project=p1", "p2"), "/quality?project=p2");
});

test("「全部專案」的去處不得帶專案參數（否則返回鍵按了沒反應）", () => {
  /*
    若返回鍵指向 /projects?project=p1，decideProjectsPage 會立刻把
    使用者轉回 p1 —— 症狀是「按返回沒反應」，而程式碼裡兩處看起來都對。
  */
  assert.equal(currentProject(ALL_PROJECTS_HREF.split("?")[1] ?? null), null);
  assert.deepEqual(
    decideProjectsPage(currentProject(null), VISIBLE),
    { kind: "list" },
    "返回鍵送到的網址必須落在清單這一支",
  );
});

test("任何入口都會在有限步數內停下（不存在轉向迴圈）", () => {
  /*
    這是本模組唯一真正難的性質。三條規則各自都對，湊起來可能繞不出來，
    而症狀是瀏覽器直接報錯，看不出是哪一條造成的。
    故以實際走訪模擬：每一步套用規則，直到不再轉向。
  */
  type Loc = { path: string; project: string | null };

  const step = (loc: Loc): Loc | null => {
    if (loc.path === "/projects") {
      const d = decideProjectsPage(loc.project, VISIBLE);
      if (d.kind !== "redirect") return null;
      const [path, query] = d.href.split("?");
      return { path, project: currentProject(query) };
    }
    const openId = loc.path.replace("/projects/", "");
    const d = decideProjectPage(openId, loc.project);
    if (d.kind === "stay") return null;
    const [path, query] = d.href.split("?");
    return { path, project: currentProject(query) };
  };

  const walk = (start: Loc) => {
    let loc = start;
    const seen = new Set<string>();
    for (let i = 0; i < 10; i += 1) {
      const key = `${loc.path}?${loc.project ?? ""}`;
      assert.ok(!seen.has(key), `轉向繞回 ${key}，形成迴圈`);
      seen.add(key);
      const next = step(loc);
      if (!next) return loc;
      loc = next;
    }
    assert.fail(`自 ${start.path} 出發十步仍未停止`);
  };

  // 各種入口：清單、帶選定的清單、裸專案頁、參數不一致的專案頁、失效的選定
  assert.deepEqual(walk({ path: "/projects", project: null }), {
    path: "/projects",
    project: null,
  });
  assert.deepEqual(walk({ path: "/projects", project: "p1" }), {
    path: "/projects/p1",
    project: "p1",
  });
  assert.deepEqual(walk({ path: "/projects/p2", project: null }), {
    path: "/projects/p2",
    project: "p2",
  });
  // 在 p1 的頁面切換到 p2：應停在 p2，而非被彈回 p1
  assert.deepEqual(walk({ path: "/projects/p1", project: "p2" }), {
    path: "/projects/p2",
    project: "p2",
  });
  /*
    切換器實際產生的網址也要走一遍 —— 上面那組是「參數與路徑不一致」的
    修復路徑，而切換器本來就該同時換掉兩者，一步就到位。
  */
  {
    const href = switchProjectHref("/projects/p1", "project=p1", "p2");
    const [path, query] = href.split("?");
    assert.deepEqual(walk({ path, project: currentProject(query ?? null) }), {
      path: "/projects/p2",
      project: "p2",
    });
  }
  assert.deepEqual(walk({ path: "/projects", project: "gone" }), {
    path: "/projects",
    project: "gone",
  });
});

// ── 以原始碼守住接線 ────────────────────────────────────────

test("兩支頁面都走共用判斷，不各寫一份轉向", () => {
  /*
    轉向規則互相牽制（見本模組開頭）。任一頁自己寫一份就會漂移，
    而漂移的症狀是迴圈或「按了沒反應」，在程式碼裡看不出異狀。
  */
  const list = read("src/app/projects/page.tsx");
  assert.match(list, /decideProjectsPage\(/, "清單頁應以共用判斷決定去處");
  assert.match(list, /redirect\(decision\.href\)/);

  const detail = read("src/app/projects/[id]/page.tsx");
  assert.match(detail, /decideProjectPage\(id, selected, tab\)/);
});

test("專案頁不自備返回鍵，離開的入口只有左上角", () => {
  /*
    進出用同一個控制項：左上角選了某案就進去，切「全部專案」就出來。
    畫面上再放一顆「全部專案」是第二個入口，兩者一旦行為不同
    （例如一個清掉選定、一個沒清）就是使用者最難描述的那種毛病。
  */
  /*
    比對程式碼構造而非字串：註解裡提到「全部專案」是說明，不是缺陷 ——
    我第一次寫這個測試又被自己的註解判為失敗（這已是第三次）。
  */
  const detail = read("src/app/projects/[id]/page.tsx")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "");
  for (const construct of [
    /href=\{ALL_PROJECTS_HREF\}/,
    /<Link href="\/projects">/,
    /ArrowLeft/,
  ]) {
    assert.ok(
      !construct.test(detail),
      `專案頁不該再有回到清單的按鈕（${construct.source}）—— 改由左上角的專案切換器負責`,
    );
  }
  // 切換器切到「全部專案」仍須把人送到不帶參數的清單
  assert.equal(
    switchProjectHref("/projects/p1", "project=p1", "all"),
    ALL_PROJECTS_HREF,
  );
});

test("清單的每個入口都讓該專案成為目前專案", () => {
  /*
    點進某個專案卻沒有更新左上角，會出現「側邊欄說全部專案、
    畫面開著某一件」的矛盾 —— 使用者接著切模組就會發現資料不是他以為的那件。
  */
  const list = read("src/app/projects/page.tsx");
  assert.ok(
    !/href=\{`\/projects\/\$\{p\.id\}`\}/.test(list),
    "裸連結會漏掉專案參數，應改用 projectHref()",
  );
  assert.equal(
    (list.match(/projectHref\(p\.id\)/g) ?? []).length,
    2,
    "專案名稱與「管理」兩個入口都要帶",
  );
});

test("沒有人連向帶著專案參數的 /projects（那是迴圈的入口）", () => {
  const walk = (dir: string, out: string[] = []): string[] => {
    for (const name of readdirSync(dir)) {
      const full = path.join(dir, name);
      if (statSync(full).isDirectory()) walk(full, out);
      else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(full);
    }
    return out;
  };
  const offenders: string[] = [];
  for (const file of walk(path.join(ROOT, "src"))) {
    const source = readFileSync(file, "utf8");
    // 形如 "/projects?project=" 的字面連結
    if (/["'`]\/projects\?[^"'`]*project=/.test(source)) {
      offenders.push(path.relative(ROOT, file).split(path.sep).join("/"));
    }
  }
  assert.deepEqual(
    offenders,
    [],
    `這些檔案連向會立刻轉走的網址：${offenders.join("、")}`,
  );
});
