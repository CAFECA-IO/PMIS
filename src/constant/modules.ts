// PMIS 功能模組清單（供職位權限管理與存取控制共用）。key 以路由為準。

export type ModulePermissionLevel = "NONE" | "VIEW" | "EDIT";

export const PERMISSION_LEVELS: {
  value: ModulePermissionLevel;
  label: string;
}[] = [
  { value: "NONE", label: "無" },
  { value: "VIEW", label: "檢視" },
  { value: "EDIT", label: "可編輯" },
];

export type PmisModule = { key: string; code: string; label: string };

/** 可授權的功能模組（不含儀表板與功能說明）。 */
export const PMIS_MODULES: PmisModule[] = [
  { key: "/calendar", code: "PMIS-01", label: "行事曆與預警" },
  { key: "/notifications", code: "PMIS-02", label: "系統通知" },
  { key: "/projects", code: "PMIS-03", label: "工程專案" },
  { key: "/schedule", code: "PMIS-04", label: "時程進度" },
  { key: "/obligations", code: "PMIS-15", label: "履約事項" },
  { key: "/ehs", code: "PMIS-05", label: "環安衛管理" },
  { key: "/submittals", code: "PMIS-06", label: "簽核管理" },
  { key: "/quality", code: "PMIS-07", label: "品質稽核" },
  { key: "/finance", code: "PMIS-08", label: "財務管理" },
  { key: "/carbon", code: "PMIS-09", label: "碳盤查" },
  { key: "/monitoring", code: "PMIS-10", label: "智能監測" },
  { key: "/logs", code: "PMIS-11", label: "工程日誌" },
  { key: "/gis", code: "PMIS-12", label: "GIS 地圖" },
  { key: "/documents", code: "PMIS-13", label: "檔案管理" },
  { key: "/people", code: "PMIS-14", label: "帳號管理" },
];

const VALID_LEVELS = new Set<ModulePermissionLevel>(["NONE", "VIEW", "EDIT"]);
const MODULE_KEYS = new Set(PMIS_MODULES.map((m) => m.key));

export function isPermissionLevel(v: unknown): v is ModulePermissionLevel {
  return typeof v === "string" && VALID_LEVELS.has(v as ModulePermissionLevel);
}

/** 解析儲存的 JSON 權限字串為 { moduleKey: level }（過濾非法值）。 */
export function parseModulePermissions(
  raw: string | null | undefined,
): Record<string, ModulePermissionLevel> {
  const out: Record<string, ModulePermissionLevel> = {};
  if (!raw) return out;
  try {
    const obj = JSON.parse(raw) as Record<string, unknown>;
    for (const [k, v] of Object.entries(obj)) {
      if (MODULE_KEYS.has(k) && isPermissionLevel(v)) out[k] = v;
    }
  } catch {
    // ignore malformed
  }
  return out;
}
