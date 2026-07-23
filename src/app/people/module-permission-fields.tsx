import { Select } from "@/components/ui/select";
import {
  PMIS_MODULES,
  PERMISSION_LEVELS,
  type ModulePermissionLevel,
} from "@/constant/modules";

/**
 * 模組權限欄位（供新增/編輯職位對話框共用）。
 * 每個模組一個 select，name=`perm:<route>`，由對話框的 form 一併送出。
 */
export function ModulePermissionFields({
  values,
}: {
  values?: Record<string, ModulePermissionLevel>;
}) {
  return (
    <div className="space-y-2 sm:col-span-2">
      <p className="text-xs font-medium text-muted-foreground">模組操作權限</p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {PMIS_MODULES.map((m) => (
          <label
            key={m.key}
            className="flex items-center justify-between gap-2 rounded-md border px-2 py-1.5 text-xs"
          >
            <span>
              <span className="text-muted-foreground">{m.code}</span> {m.label}
            </span>
            <Select
              name={`perm:${m.key}`}
              defaultValue={values?.[m.key] ?? "NONE"}
              className="h-7 w-24 text-xs"
            >
              {PERMISSION_LEVELS.map((lv) => (
                <option key={lv.value} value={lv.value}>
                  {lv.label}
                </option>
              ))}
            </Select>
          </label>
        ))}
      </div>
    </div>
  );
}
