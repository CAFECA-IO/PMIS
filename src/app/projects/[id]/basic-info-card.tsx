"use client";

import { useState } from "react";
import { Pencil, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { CityCombobox } from "@/components/city-combobox";
import { projectStatusOptions, projectStatusMeta } from "@/constant/pmis";
import type { ProjectStatus } from "@/generated/prisma/enums";
import { updateProjectAction } from "../actions";

/**
 * 基本資料。
 *
 * 先前分成兩處：總覽的「關鍵資料」只顯示六項，另有一個「基本資料」分頁
 * 放編輯表單且欄位還少了業主、承包商、契約金額。於是使用者看到的與
 * 能改的不是同一組欄位，得在兩個分頁之間對照。
 *
 * 現在同一張卡負責兩件事：預設唯讀、完整列出；右上角鉛筆就地換成表單。
 * 就地切換而非彈窗，是因為「改了什麼」需要與原值比對 ——
 * 位置一跳動，那個比對就得靠記憶。
 */

export type BasicInfo = {
  id: string;
  code: string;
  name: string;
  contractNo: string | null;
  client: string | null;
  contractor: string | null;
  supervisor: string | null;
  location: string | null;
  budget: string | null;
  status: ProjectStatus;
  signedDate: string;
  noticeDate: string;
  startDate: string;
  endDate: string;
  description: string | null;
  keyRequirements: string | null;
};

/** 顯示順序：識別 → 關係人 → 日期 → 金額。與表單一致，比對時不必找。 */
const ROWS: { key: keyof BasicInfo; label: string }[] = [
  { key: "code", label: "專案編號" },
  { key: "contractNo", label: "契約編號" },
  { key: "name", label: "專案名稱" },
  { key: "client", label: "業主／主辦機關" },
  { key: "contractor", label: "承包商" },
  { key: "supervisor", label: "監造單位" },
  { key: "location", label: "工程地點" },
  { key: "status", label: "狀態" },
  // 這兩天是履約事項相對期限的起算基準，且不必等於開工日
  { key: "signedDate", label: "契約簽訂日" },
  { key: "noticeDate", label: "開工命令日" },
  { key: "startDate", label: "開工日" },
  { key: "endDate", label: "完工日" },
  { key: "budget", label: "契約金額" },
];

function display(info: BasicInfo, key: keyof BasicInfo): string {
  const value = info[key];
  if (key === "status") return projectStatusMeta[info.status].label;
  if (key === "budget") {
    const n = Number(value);
    return value && !Number.isNaN(n) ? `NT$ ${n.toLocaleString()}` : "—";
  }
  const text = typeof value === "string" ? value.trim() : "";
  return text || "—";
}

export function BasicInfoCard({
  info,
  canEdit,
}: {
  info: BasicInfo;
  canEdit: boolean;
}) {
  const [editing, setEditing] = useState(false);

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">基本資料</CardTitle>
        {canEdit ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={editing ? "取消編輯" : "編輯基本資料"}
            title={editing ? "取消編輯" : "編輯基本資料"}
            onClick={() => setEditing((v) => !v)}
          >
            {editing ? (
              <X className="size-4" />
            ) : (
              <Pencil className="size-4 text-muted-foreground" />
            )}
          </Button>
        ) : null}
      </CardHeader>

      <CardContent className="pt-0">
        {editing ? (
          <form action={updateProjectAction} className="space-y-5">
            <input type="hidden" name="id" value={info.id} />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="code-ro">專案編號</Label>
                {/*
                  編號不可改：它是各處參照此專案的鍵，且履約事項的管制編號
                  以它為前綴。要換編號等於換一個專案。
                */}
                <Input id="code-ro" defaultValue={info.code} disabled />
                <p className="text-[11px] text-muted-foreground">
                  編號建立後不可變更
                </p>
              </div>
              <Text label="契約編號" name="contractNo" value={info.contractNo} />
              <Text label="專案名稱" name="name" value={info.name} />
              <Text label="業主／主辦機關" name="client" value={info.client} />
              <Text label="承包商" name="contractor" value={info.contractor} />
              <Text label="監造單位" name="supervisor" value={info.supervisor} />
              <div className="space-y-1.5">
                <Label htmlFor="location">工程地點</Label>
                <CityCombobox
                  id="location"
                  name="location"
                  defaultValue={info.location ?? ""}
                  placeholder="輸入城市名稱或代碼搜尋"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="status">狀態</Label>
                <Select id="status" name="status" defaultValue={info.status}>
                  {projectStatusOptions.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </Select>
              </div>
              <Text
                label="契約簽訂日"
                name="signedDate"
                type="date"
                value={info.signedDate}
              />
              <Text
                label="開工命令日"
                name="noticeDate"
                type="date"
                value={info.noticeDate}
              />
              <Text
                label="開工日"
                name="startDate"
                type="date"
                value={info.startDate}
              />
              <Text
                label="完工日"
                name="endDate"
                type="date"
                value={info.endDate}
              />
              <Text
                label="契約金額"
                name="budget"
                type="number"
                value={info.budget}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="description">工程摘要</Label>
              <Textarea
                id="description"
                name="description"
                rows={3}
                defaultValue={info.description ?? ""}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="keyRequirements">關鍵要求重點</Label>
              <Textarea
                id="keyRequirements"
                name="keyRequirements"
                rows={4}
                placeholder="影響施工方式的契約／規範條件，一行一項"
                defaultValue={info.keyRequirements ?? ""}
              />
              <p className="text-xs text-muted-foreground">
                產生施工設計與 3D 數位孿生動畫時會以這些條件為依據。
              </p>
            </div>
            <div className="flex items-center gap-3 border-t pt-4">
              <Button type="submit">儲存</Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setEditing(false)}
              >
                取消
              </Button>
            </div>
          </form>
        ) : (
          <>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-4 text-sm sm:grid-cols-3">
              {ROWS.map((row) => (
                <div key={row.key}>
                  <dt className="text-xs text-muted-foreground">{row.label}</dt>
                  <dd
                    className={
                      row.key === "code" || row.key === "contractNo"
                        ? "mt-0.5 font-mono text-[13px] font-medium"
                        : "mt-0.5 font-medium"
                    }
                  >
                    {display(info, row.key)}
                  </dd>
                </div>
              ))}
            </dl>
            {info.description?.trim() ? (
              <div className="mt-5 border-t pt-4">
                <dt className="text-xs text-muted-foreground">工程摘要</dt>
                <dd className="mt-1 whitespace-pre-line text-sm leading-relaxed">
                  {info.description}
                </dd>
              </div>
            ) : null}
            {info.keyRequirements?.trim() ? (
              <div className="mt-4 border-t pt-4">
                <dt className="text-xs text-muted-foreground">關鍵要求重點</dt>
                <dd className="mt-1 whitespace-pre-line text-sm leading-relaxed">
                  {info.keyRequirements}
                </dd>
              </div>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function Text({
  label,
  name,
  value,
  type = "text",
}: {
  label: string;
  name: string;
  value: string | null;
  type?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={name}>{label}</Label>
      <Input id={name} name={name} type={type} defaultValue={value ?? ""} />
    </div>
  );
}
