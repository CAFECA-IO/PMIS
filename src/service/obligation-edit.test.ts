import { test } from "node:test";
import assert from "node:assert/strict";

import {
  dateOrNull,
  intOrNull,
  isChecked,
  planObligationUpdate,
  type ObligationCurrent,
  type ObligationEditInput,
} from "./obligation-edit";
import type { WorkItemState } from "./obligation-completion";

const current: ObligationCurrent = {
  code: "A-01",
  status: "IN_PROGRESS",
  stage: "CONSTRUCTION",
  risk: "GREEN",
  triggerType: "FIXED_DATE",
  weight: 1,
};

const valid: ObligationEditInput = {
  code: "A-01",
  title: "提送施工計畫書",
  stage: "CONSTRUCTION",
  risk: "YELLOW",
  triggerType: "FIXED_DATE",
  status: "IN_PROGRESS",
  dueDate: "2026-09-30",
  weight: "2",
};

const item = (over: Partial<WorkItemState> = {}): WorkItemState => ({
  id: over.id ?? "w1",
  name: over.name ?? "基樁施作",
  status: over.status ?? "COMPLETED",
  progress: over.progress ?? 100,
});

const ok = (plan: ReturnType<typeof planObligationUpdate>) => {
  assert.equal(plan.ok, true, plan.ok ? "" : plan.error);
  if (!plan.ok) throw new Error("unreachable");
  return plan.data;
};

// ── 完成的把關（本功能的核心約束） ──────────────────────────
test("表單直接把狀態選成完成時，同樣受歸屬分項限制", () => {
  const plan = planObligationUpdate({ ...valid, status: "DONE" }, current, [
    item({ name: "擋土支撐", status: "IN_PROGRESS" }),
  ]);
  assert.equal(plan.ok, false, "這是繞過完成按鈕的後門，必須擋下");
  if (plan.ok) return;
  assert.match(plan.error, /擋土支撐/);
});

test("歸屬分項全部完成時，表單可改為完成", () => {
  const data = ok(
    planObligationUpdate({ ...valid, status: "DONE" }, current, [item()]),
  );
  assert.equal(data.status, "DONE");
});

test("沒有歸屬分項時可改為完成", () => {
  const data = ok(planObligationUpdate({ ...valid, status: "DONE" }, current, []));
  assert.equal(data.status, "DONE");
});

test("已完成的事項再次儲存不會被關卡擋住（否則改不了備註）", () => {
  const doneNow: ObligationCurrent = { ...current, status: "DONE" };
  const data = ok(
    planObligationUpdate(
      { ...valid, status: "DONE", note: "補充說明" },
      doneNow,
      [item({ status: "IN_PROGRESS" })],
    ),
  );
  assert.equal(data.note, "補充說明");
});

test("改成其他狀態不受分項限制", () => {
  for (const status of ["NOT_STARTED", "PENDING_REVIEW", "OVERDUE"]) {
    const data = ok(
      planObligationUpdate({ ...valid, status }, current, [
        item({ status: "NOT_STARTED" }),
      ]),
    );
    assert.equal(data.status, status);
  }
});

test("轉為完成而未填完成日時補上今日（上捲以完成日計算）", () => {
  const data = ok(
    planObligationUpdate({ ...valid, status: "DONE", actualDate: "" }, current, []),
  );
  assert.ok(data.actualDate instanceof Date);
  assert.equal(
    data.actualDate?.toISOString().slice(0, 10),
    new Date().toISOString().slice(0, 10),
  );
});

test("轉為完成且已填完成日時尊重使用者填的日期", () => {
  const data = ok(
    planObligationUpdate(
      { ...valid, status: "DONE", actualDate: "2026-06-15" },
      current,
      [],
    ),
  );
  assert.equal(data.actualDate?.toISOString().slice(0, 10), "2026-06-15");
});

// ── 必填與驗證 ──────────────────────────────────────────────
test("名稱與編號不可空白", () => {
  const noTitle = planObligationUpdate({ ...valid, title: "  " }, current, []);
  assert.equal(noTitle.ok, false);
  if (!noTitle.ok) assert.match(noTitle.error, /名稱不可空白/);

  const noCode = planObligationUpdate({ ...valid, code: "" }, current, []);
  assert.equal(noCode.ok, false);
  if (!noCode.ok) assert.match(noCode.error, /管制編號不可空白/);
});

test("權重須為 1 以上", () => {
  const zero = planObligationUpdate({ ...valid, weight: "0" }, current, []);
  assert.equal(zero.ok, false);
  const neg = planObligationUpdate({ ...valid, weight: "-3" }, current, []);
  assert.equal(neg.ok, false);
});

test("權重空白時保留原值，不會被歸零", () => {
  const data = ok(
    planObligationUpdate({ ...valid, weight: "" }, { ...current, weight: 5 }, []),
  );
  assert.equal(data.weight, 5);
});

// ── 竄改防護 ────────────────────────────────────────────────
test("不在選項內的狀態、階段、風險一律退回原值", () => {
  const data = ok(
    planObligationUpdate(
      { ...valid, status: "SUPERUSER", stage: "FAKE", risk: "RAINBOW" },
      current,
      [],
    ),
  );
  assert.equal(data.status, "IN_PROGRESS");
  assert.equal(data.stage, "CONSTRUCTION");
  assert.equal(data.risk, "GREEN");
});

test("偽造的狀態值不能被當成完成而繞過關卡", () => {
  const data = ok(
    planObligationUpdate({ ...valid, status: "done" }, current, [
      item({ status: "IN_PROGRESS" }),
    ]),
  );
  assert.equal(data.status, "IN_PROGRESS", "大小寫不符即非合法選項");
});

// ── 清空與解析 ──────────────────────────────────────────────
test("清空文字欄位寫入 null 而非空字串", () => {
  const data = ok(
    planObligationUpdate(
      { ...valid, ownerUnit: "", ownerName: "  ", contractBasis: "", note: "", docNo: "" },
      current,
      [],
    ),
  );
  assert.equal(data.ownerUnit, null);
  assert.equal(data.ownerName, null);
  assert.equal(data.contractBasis, null);
  assert.equal(data.note, null);
  assert.equal(data.docNo, null);
});

test("固定日期不得清空期限（清空後這項事項就永遠沒有管制點）", () => {
  const plan = planObligationUpdate({ ...valid, dueDate: "" }, current, []);
  assert.equal(plan.ok, false);
  if (!plan.ok) assert.match(plan.error, /固定日期需填入期限/);
});

test("清空實際完成日寫入 null（清不掉會讓已完成的紀錄無法回復）", () => {
  const data = ok(
    planObligationUpdate({ ...valid, actualDate: "" }, current, []),
  );
  assert.equal(data.actualDate, null);
});

test("改為條件觸發時期限可留空，並清掉不相關的觸發欄位", () => {
  const data = ok(
    planObligationUpdate(
      {
        ...valid,
        triggerType: "CONDITION",
        dueDate: "",
        conditionKind: "AGENCY_ACTION",
        conditionDetail: "機關書面通知後",
        relativeAnchor: "PROJECT_START",
        predecessorId: "somebody",
      },
      current,
      [],
    ),
  );
  assert.equal(data.dueDate, null);
  assert.equal(data.conditionKind, "AGENCY_ACTION");
  assert.equal(data.relativeAnchor, null, "換了觸發方式就不該留著舊基準點");
  assert.equal(data.predecessorId, null);
});

test("相對期限缺基準點時擋下，不寫入半套設定", () => {
  const plan = planObligationUpdate(
    { ...valid, triggerType: "RELATIVE_DUE", offsetDays: "30" },
    current,
    [],
  );
  assert.equal(plan.ok, false);
  if (!plan.ok) assert.match(plan.error, /需選擇基準時間點/);
});

test("相對期限完整時保留基準點與天數", () => {
  const data = ok(
    planObligationUpdate(
      {
        ...valid,
        triggerType: "RELATIVE_DUE",
        relativeAnchor: "NOTICE_TO_PROCEED",
        offsetDays: "30",
      },
      current,
      [],
    ),
  );
  assert.equal(data.relativeAnchor, "NOTICE_TO_PROCEED");
  assert.equal(data.offsetDays, 30);
  assert.equal(data.conditionKind, null);
});

test("固定日期不標記人工覆寫（它本來就是人工填的）", () => {
  const data = ok(
    planObligationUpdate({ ...valid, dueDateOverridden: "on" }, current, []),
  );
  assert.equal(data.dueDateOverridden, false);
});

test("非固定日期時人工覆寫的標記被保留", () => {
  const data = ok(
    planObligationUpdate(
      {
        ...valid,
        triggerType: "RELATIVE_DUE",
        relativeAnchor: "PROJECT_START",
        offsetDays: "30",
        dueDateOverridden: "on",
      },
      current,
      [],
    ),
  );
  assert.equal(data.dueDateOverridden, true);
});

test("不合法的日期視為未填，不寫入 Invalid Date", () => {
  assert.equal(dateOrNull("2026-13-45"), null);
  assert.equal(dateOrNull("不是日期"), null);
  assert.equal(dateOrNull(""), null);
  assert.equal(dateOrNull(undefined), null);
  assert.equal(dateOrNull("2026-09-30")?.toISOString().slice(0, 10), "2026-09-30");
});

test("整數欄位解析", () => {
  assert.equal(intOrNull(""), null);
  assert.equal(intOrNull(undefined), null);
  assert.equal(intOrNull("abc"), null);
  assert.equal(intOrNull("30"), 30);
  assert.equal(intOrNull("-7"), -7, "相對天數可為負（期限前 n 天）");
});

test("核選方塊未送出時視為未勾選", () => {
  assert.equal(isChecked(undefined), false);
  assert.equal(isChecked(""), false);
  assert.equal(isChecked("on"), true);
  assert.equal(isChecked("true"), true);
  assert.equal(isChecked("1"), true);
  assert.equal(isChecked("off"), false);
});

test("取消勾選試運轉會真的取消（未送出即為 false）", () => {
  const data = ok(planObligationUpdate(valid, current, []));
  assert.equal(data.commissioning, false);
});

test("文字欄位前後空白被去除", () => {
  const data = ok(
    planObligationUpdate(
      { ...valid, title: "  提送月報  ", code: " A-02 ", ownerName: " 陳工程師 " },
      current,
      [],
    ),
  );
  assert.equal(data.title, "提送月報");
  assert.equal(data.code, "A-02");
  assert.equal(data.ownerName, "陳工程師");
});
