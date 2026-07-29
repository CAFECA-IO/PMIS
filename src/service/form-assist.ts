/**
 * 表單助手的欄位規格與填寫規劃（純函式，無 I/O，便於單元測試）。
 *
 * 目的：讓任何建置表單都能把自己交給費思代填，而不必各自實作一支 API。
 * 表單以宣告式規格描述自己的欄位，本檔負責三件事：
 *  1. 由規格產生模型的 responseSchema 與提示詞用的欄位說明。
 *  2. 驗證模型回傳的值（型別、選項、日期格式），不合法者丟棄而非硬塞。
 *  3. 規劃要填哪些欄位 —— 使用者已填的值一律不覆蓋。
 *
 * 規格存放於 constant/form-assist，由伺服器端依 id 查表，
 * 前端只送 id。這樣使用者無法自行拼一份 schema 送進模型。
 */

export type FieldKind =
  | "text"
  | "textarea"
  | "number"
  | "date"
  | "select"
  | "checkbox";

export type FieldOption = { value: string; label: string };

export type FormFieldSpec = {
  /** 對應 input 的 name，也是 FormData 的鍵。 */
  name: string;
  label: string;
  kind: FieldKind;
  /** kind 為 select 時的可選值。 */
  options?: FieldOption[];
  /** 給模型的補充說明，如「僅數字，新台幣元」。 */
  hint?: string;
};

export type FormAssistSpec = {
  id: string;
  /** 表單標題，如「新增履約事項」。 */
  title: string;
  /** 這張表單的用途，寫進提示詞協助模型判斷。 */
  purpose: string;
  fields: FormFieldSpec[];
  /** 可上傳的檔案型別；未指定則只接受文字描述。 */
  accept?: string;
};

// ── 規格檢核 ────────────────────────────────────────────────

/** 單一表單的欄位數上限，避免規格失控導致提示詞與輸出過長。 */
export const MAX_SPEC_FIELDS = 40;

/** 單一欄位的選項數上限。 */
export const MAX_FIELD_OPTIONS = 60;

/**
 * 檢核規格是否可用。回傳問題清單（空陣列代表通過）。
 * 這是開發期的護欄：規格寫錯時要明確報錯，而不是送出一個模型會拒收的 schema。
 */
export function validateSpec(spec: FormAssistSpec): string[] {
  const problems: string[] = [];
  if (!spec.id.trim()) problems.push("id 不可為空");
  if (!spec.title.trim()) problems.push("title 不可為空");
  if (spec.fields.length === 0) problems.push("至少需要一個欄位");
  if (spec.fields.length > MAX_SPEC_FIELDS) {
    problems.push(`欄位數 ${spec.fields.length} 超過上限 ${MAX_SPEC_FIELDS}`);
  }

  const seen = new Set<string>();
  for (const f of spec.fields) {
    if (!f.name.trim()) {
      problems.push("欄位 name 不可為空");
      continue;
    }
    if (seen.has(f.name)) problems.push(`欄位 name 重複：${f.name}`);
    seen.add(f.name);
    if (!f.label.trim()) problems.push(`${f.name} 缺少 label`);
    if (f.kind === "select") {
      const opts = f.options ?? [];
      if (opts.length === 0) {
        problems.push(`${f.name} 為 select 但沒有 options`);
      }
      if (opts.length > MAX_FIELD_OPTIONS) {
        problems.push(`${f.name} 的選項數超過上限 ${MAX_FIELD_OPTIONS}`);
      }
      // 空字串選項會讓 Gemini 以 400 拒收整個 schema
      if (opts.some((o) => !o.value.trim())) {
        problems.push(`${f.name} 含空字串選項`);
      }
    }
  }
  return problems;
}

// ── 提示詞與 schema ─────────────────────────────────────────

const KIND_HINT: Record<FieldKind, string> = {
  text: "文字",
  textarea: "文字（可多行）",
  number: "數字（僅阿拉伯數字，不含逗號與單位）",
  date: "日期（YYYY-MM-DD）",
  select: "限定選項",
  checkbox: "是或否（true／false）",
};

/** 給模型看的欄位清單，含型別與可選值。 */
export function describeFields(fields: FormFieldSpec[]): string {
  return fields
    .map((f) => {
      const parts = [`- ${f.name}（${f.label}）：${KIND_HINT[f.kind]}`];
      if (f.kind === "select" && f.options?.length) {
        const opts = f.options
          .map((o) => (o.label && o.label !== o.value ? `${o.value}=${o.label}` : o.value))
          .join("、");
        parts.push(`可選值：${opts}`);
      }
      if (f.hint) parts.push(f.hint);
      return parts.join("；");
    })
    .join("\n");
}

/** Gemini responseSchema 的最小型別（與 faith.service 的 ResponseSchema 相容）。 */
type SchemaNode = {
  type: string;
  description?: string;
  enum?: string[];
  properties?: Record<string, SchemaNode>;
  required?: string[];
  propertyOrdering?: string[];
};

/**
 * 由欄位規格產生 responseSchema。
 *
 * 全部欄位皆為選填且一律以字串承載（含數字與布林）：
 * 模型判讀不到時應該省略，而不是被迫填 0 或 false 造成假資料。
 * 型別轉換與驗證在 sanitizePatch 進行。
 */
export function buildFieldSchema(fields: FormFieldSpec[]): SchemaNode {
  const properties: Record<string, SchemaNode> = {
    reply: { type: "STRING", description: "一兩句繁體中文說明判讀狀況" },
  };
  const values: Record<string, SchemaNode> = {};
  for (const f of fields) {
    const node: SchemaNode = {
      type: "STRING",
      description: `${f.label}：${KIND_HINT[f.kind]}${f.hint ? `。${f.hint}` : ""}`,
    };
    if (f.kind === "select" && f.options?.length) {
      node.enum = f.options.map((o) => o.value);
    }
    values[f.name] = node;
  }
  properties.values = {
    type: "OBJECT",
    description: "判讀到的欄位值；判讀不到的欄位請省略，不要臆測",
    properties: values,
    propertyOrdering: fields.map((f) => f.name),
  };
  return {
    type: "OBJECT",
    properties,
    required: ["values"],
    // values 先生成，reply 最後總結
    propertyOrdering: ["values", "reply"],
  };
}

// ── 驗證模型回傳的值 ────────────────────────────────────────

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** 日期是否為真實存在的一天（擋掉 2026-02-30 這類格式對但不存在的值）。 */
function isRealDate(value: string): boolean {
  if (!DATE_RE.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  if (m < 1 || m > 12 || d < 1) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return (
    dt.getUTCFullYear() === y &&
    dt.getUTCMonth() === m - 1 &&
    dt.getUTCDate() === d
  );
}

/** 依欄位型別把模型給的原始值轉為可填入表單的字串；不合法回 null。 */
export function coerceValue(
  field: FormFieldSpec,
  raw: unknown,
): string | null {
  if (raw == null) return null;

  if (field.kind === "checkbox") {
    if (typeof raw === "boolean") return raw ? "on" : "";
    const s = String(raw).trim().toLowerCase();
    if (["true", "1", "yes", "是", "on"].includes(s)) return "on";
    if (["false", "0", "no", "否", "off", ""].includes(s)) return "";
    return null;
  }

  const s = typeof raw === "string" ? raw.trim() : String(raw).trim();
  if (s === "") return null;

  switch (field.kind) {
    case "number": {
      // 模型常回「1,234,567 元」或全形數字，去除千分位與單位後再驗
      const cleaned = s.replace(/[,，\s]/g, "").replace(/元$/, "");
      if (!/^-?\d+(\.\d+)?$/.test(cleaned)) return null;
      return cleaned;
    }
    case "date":
      return isRealDate(s) ? s : null;
    case "select": {
      const opts = field.options ?? [];
      // 先比對 value，再容許模型回傳顯示用的 label
      const byValue = opts.find((o) => o.value === s);
      if (byValue) return byValue.value;
      const byLabel = opts.find((o) => o.label === s);
      return byLabel ? byLabel.value : null;
    }
    default:
      return s;
  }
}

export type Patch = Record<string, string>;

/**
 * 過濾模型回傳的整包值：只保留規格內、且通過型別驗證的欄位。
 * 規格外的鍵一律丟棄 —— 模型自行發明的欄位填不進表單，留著只會誤導。
 */
export function sanitizePatch(
  fields: FormFieldSpec[],
  raw: unknown,
): { patch: Patch; rejected: string[] } {
  const patch: Patch = {};
  const rejected: string[] = [];
  if (!raw || typeof raw !== "object") return { patch, rejected };
  const source = raw as Record<string, unknown>;

  for (const f of fields) {
    if (!(f.name in source)) continue;
    const value = coerceValue(f, source[f.name]);
    if (value === null) {
      rejected.push(f.label);
      continue;
    }
    // checkbox 的「否」為空字串，代表不需改動表單
    if (value === "" ) continue;
    patch[f.name] = value;
  }
  return { patch, rejected };
}

// ── 規劃填寫 ────────────────────────────────────────────────

export type FillAction = {
  name: string;
  label: string;
  /** 寫進表單的值。 */
  value: string;
  /**
   * 給人看的值。
   * 限定選項欄位存的是 CONSTRUCTION 這類代碼，回報時要說「施工監造」，
   * 否則使用者得自己對照代碼表才知道 AI 填了什麼。
   */
  display: string;
};

export type FillPlan = {
  /** 要寫入表單的欄位。 */
  fill: FillAction[];
  /** 因使用者已填而跳過的欄位標籤。 */
  keptLabels: string[];
  /** 模型未提供的欄位標籤。 */
  missingLabels: string[];
};

/** 把儲存值換成人看得懂的顯示值（選項代碼 → 中文標籤；勾選 → 是）。 */
export function displayValueOf(field: FormFieldSpec, value: string): string {
  if (field.kind === "select") {
    const hit = field.options?.find((o) => o.value === value);
    return hit ? hit.label : value;
  }
  if (field.kind === "checkbox") return value === "on" ? "是" : "否";
  return value;
}

/**
 * 規劃要填哪些欄位。
 *
 * 核心規則：使用者已經填過的欄位絕不覆蓋。
 * 表單助手是輔助，使用者手動輸入的值代表明確意圖，
 * 被 AI 悄悄改掉會比沒有助手更糟。
 *
 * @param current 目前表單各欄位的值（由 DOM 讀出）
 */
export function planFill(
  fields: FormFieldSpec[],
  patch: Patch,
  current: Record<string, string>,
): FillPlan {
  const fill: FillAction[] = [];
  const keptLabels: string[] = [];
  const missingLabels: string[] = [];

  for (const f of fields) {
    const incoming = patch[f.name];
    if (incoming == null || incoming === "") {
      missingLabels.push(f.label);
      continue;
    }
    const existing = (current[f.name] ?? "").trim();
    if (existing !== "") {
      keptLabels.push(f.label);
      continue;
    }
    fill.push({
      name: f.name,
      label: f.label,
      value: incoming,
      display: displayValueOf(f, incoming),
    });
  }

  return { fill, keptLabels, missingLabels };
}

// ── 文案 ────────────────────────────────────────────────────

/** 主動詢問是否需要協助的通知文案。 */
export function offerCopy(spec: {
  title: string;
  fields: FormFieldSpec[];
  accept?: string;
}): { title: string; description: string } {
  const how = spec.accept
    ? "可上傳相關文件，或用一句話描述，我來代填欄位。"
    : "用一句話描述，我來代填欄位。";
  return {
    title: `需要費思協助填寫「${spec.title}」嗎？`,
    description: `這張表單有 ${spec.fields.length} 個欄位。${how}`,
  };
}

/** 填寫完成後由費思在對話中回報的結果。 */
export function fillSummary(
  plan: FillPlan,
  rejected: string[],
  reply?: string,
): string {
  const lines: string[] = [];

  if (plan.fill.length === 0) {
    lines.push("我沒有從您提供的內容判讀出可填入的欄位。");
  } else {
    lines.push(`已為您填入 ${plan.fill.length} 個欄位：`);
    lines.push(...plan.fill.map((f) => `- **${f.label}**：${f.display}`));
  }

  if (plan.keptLabels.length > 0) {
    lines.push(
      `\n以下欄位您已填寫，我保留原值未動：${plan.keptLabels.join("、")}。`,
    );
  }
  if (rejected.length > 0) {
    lines.push(
      `\n以下欄位我判讀到的值不符格式，已捨棄，請手動確認：${rejected.join("、")}。`,
    );
  }
  // 已在「不符格式」列出的欄位不重複列進待補，否則同一欄位會出現兩次
  const stillMissing = plan.missingLabels.filter((l) => !rejected.includes(l));
  if (stillMissing.length > 0) {
    lines.push(`\n仍待補：${stillMissing.join("、")}。`);
  }

  lines.push("\n請於左側表單核對後再儲存。內容由 AI 判讀，送出前請確認正確。");
  if (reply?.trim()) lines.unshift(`${reply.trim()}\n`);
  return lines.join("\n");
}
