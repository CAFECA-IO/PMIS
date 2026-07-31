"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Loader2,
  Save,
  Sparkles,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useConfirm } from "@/components/ui/confirm-provider";
import { useNotification } from "@/components/ui/notification";
import { useFormAssist } from "@/components/use-form-assist";
import { FormActionBar } from "@/components/ui/form-action-bar";
import { cn } from "@/lib/utils";
import {
  obligationRiskMeta,
  obligationRiskOptions,
  obligationStageMeta,
  obligationStageOptions,
  obligationStatusMeta,
  obligationStatusOptions,
} from "@/constant/obligation";
import { ObligationTriggerFields } from "@/components/obligation-trigger-fields";
import type { TriggerContext } from "@/service/obligation-trigger";
import { workItemStatusMeta } from "@/constant/pmis";
import type { WorkItemStatus } from "@/generated/prisma/enums";
import type { ObligationDetail as Detail } from "@/service/obligation.service";
import {
  blockReason,
  clampProgress,
  completeConfirm,
  completeWorkItemConfirm,
  isDone,
  progressLabel,
} from "@/service/obligation-completion";
import {
  completeObligationAction,
  completeWorkItemAction,
  updateObligationAction,
  updateWorkItemProgressAction,
} from "../actions";

/**
 * 履約事項細節：概要、可編輯的完整欄位、歸屬的工程分項。
 *
 * 完成的規則寫在 obligation-completion（伺服器與此處共用同一套判斷），
 * 此處只負責把結果說清楚：能不能完成、為什麼不能、還差哪幾項。
 */
export function ObligationDetail({
  detail,
  canEdit,
}: {
  detail: Detail;
  canEdit: boolean;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const { notify } = useNotification();
  const formRef = useRef<HTMLFormElement | null>(null);
  const [pending, startTransition] = useTransition();
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [busyItem, setBusyItem] = useState<string | null>(null);

  const done = isDone(detail.status);
  const check = detail.completion;

  /*
    推算期限所需的脈絡。前置事項的期限以 dueDates 對照表查，
    讓元件能在使用者換前置事項時立刻算出新日期，不必往返伺服器。
  */
  const triggerContext: TriggerContext = {
    projectStart: detail.triggerContext.projectStart,
    projectEnd: detail.triggerContext.projectEnd,
    contractSigned: detail.triggerContext.contractSigned,
    noticeToProceed: detail.triggerContext.noticeToProceed,
    today: detail.triggerContext.today,
    dueDateOf: (id) => detail.triggerContext.dueDates[id] ?? null,
  };

  /*
    這一頁的欄位多半已有值，費思能填的只有空欄位（planFill 不覆蓋已填）。
    因此只在確實有空欄位時才主動詢問 —— 全填滿時跳出詢問等於保證幫不上忙。
    表單內的「請費思協助」按鈕不受此限，隨時可用。
  */
  const hasBlank =
    !detail.contractBasis ||
    !detail.ownerUnit ||
    !detail.ownerName ||
    !detail.dueDate;
  const { spec, assisting, locked, handToFaith } = useFormAssist({
    assistId: "obligation",
    active: canEdit,
    formRef,
    offer: canEdit && hasBlank,
  });

  async function save(formData: FormData) {
    setSaving(true);
    setFormError(null);
    try {
      const res = await updateObligationAction(detail.id, formData);
      if (!res.ok) {
        setFormError(res.error);
        return;
      }
      notify({ title: "已儲存履約事項", variant: "success" });
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  /** 完成此履約事項。歸屬分項未完成時按鈕已停用，此處僅處理正常路徑。 */
  async function completeThis() {
    const copy = completeConfirm(detail.title, check);
    if (!(await confirm({ ...copy, confirmLabel: "確認完成" }))) return;
    startTransition(async () => {
      const res = await completeObligationAction(detail.id);
      if (!res.ok) {
        notify({ title: "無法完成", description: res.error, variant: "error" });
        return;
      }
      notify({ title: "已完成此履約事項", variant: "success" });
      router.refresh();
    });
  }

  async function completeItem(id: string, name: string) {
    if (!(await confirm({ ...completeWorkItemConfirm(name), confirmLabel: "確認完成" }))) {
      return;
    }
    setBusyItem(id);
    startTransition(async () => {
      const res = await completeWorkItemAction(id, detail.id);
      setBusyItem(null);
      if (!res.ok) {
        notify({ title: "無法更新", description: res.error, variant: "error" });
        return;
      }
      notify({ title: `已完成「${name}」`, variant: "success" });
      router.refresh();
    });
  }

  async function saveItemProgress(
    id: string,
    input: { progress: string; actualStart: string; actualEnd: string },
  ) {
    setBusyItem(id);
    startTransition(async () => {
      const res = await updateWorkItemProgressAction(id, detail.id, {
        progress: String(clampProgress(input.progress)),
        actualStart: input.actualStart,
        actualEnd: input.actualEnd,
      });
      setBusyItem(null);
      if (!res.ok) {
        notify({ title: "無法更新", description: res.error, variant: "error" });
        return;
      }
      notify({ title: "已更新工程分項", variant: "success" });
      router.refresh();
    });
  }

  const risk = obligationRiskMeta[detail.risk];
  const reason = blockReason(check);

  return (
    <div className="space-y-5">
      {/* ── 概要與完成 ───────────────────────────────────── */}
      <Card>
        <CardContent className="space-y-4 p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <span
                className={cn("size-2.5 rounded-full", risk.dot)}
                title={risk.label}
                aria-label={risk.label}
              />
              <Badge variant={obligationStageMeta[detail.stage].variant}>
                {obligationStageMeta[detail.stage].label}
              </Badge>
              <Badge variant={obligationStatusMeta[detail.status].variant}>
                {obligationStatusMeta[detail.status].label}
              </Badge>
              <span className="text-xs text-muted-foreground">{risk.label}</span>
            </div>

            {canEdit && !done ? (
              <div className="flex flex-col items-end gap-1">
                <Button
                  type="button"
                  onClick={completeThis}
                  disabled={!check.ok || pending}
                  title={reason ?? undefined}
                >
                  {pending && busyItem === null ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="size-4" />
                  )}
                  完成此履約事項
                </Button>
                {progressLabel(check) ? (
                  <span className="text-xs text-muted-foreground">
                    {progressLabel(check)}
                  </span>
                ) : null}
              </div>
            ) : done ? (
              <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
                <Check className="size-4" />
                已於 {detail.actualDate ?? "—"} 完成
              </span>
            ) : null}
          </div>

          {/*
            不能完成時把原因寫在按鈕旁邊而非只用 title 屬性 ——
            停用的按鈕不會觸發 hover 提示，使用者只會看到一顆按不動的按鈕。
          */}
          {detail.dueReason ? (
            <p className="flex items-start gap-2 rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-warning" />
              <span>{detail.dueReason}</span>
            </p>
          ) : null}

          {!done && reason ? (
            <p className="flex items-start gap-2 rounded-md border border-dashed border-warning/50 bg-warning/5 px-3 py-2 text-xs text-foreground/80">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-warning" />
              <span>{reason}。完成所有歸屬的工程分項後即可完成此事項。</span>
            </p>
          ) : null}

          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm @[720px]:grid-cols-4">
            <Fact label="期限" value={detail.dueDate} mono />
            <Fact label="觸發依據" value={detail.dueBasis} />
            <Fact label="實際完成日" value={detail.actualDate} mono />
            <Fact
              label="責任單位／人"
              value={
                [detail.ownerUnit, detail.ownerName].filter(Boolean).join(" / ") ||
                null
              }
            />
            <Fact label="契約依據" value={detail.contractBasis} />
            <Fact label="來源合約標的" value={scopeLabel(detail)} />
            <Fact label="文號" value={detail.docNo} />
            <Fact label="進度權重" value={String(detail.weight)} mono />
            <Fact
              label="列入試運轉"
              value={detail.commissioning ? "是" : "否"}
            />
          </dl>
          {detail.note ? (
            <p className="whitespace-pre-wrap rounded-md bg-muted/50 px-3 py-2 text-sm text-foreground/80">
              {detail.note}
            </p>
          ) : null}
        </CardContent>
      </Card>

      {/* ── 歸屬的工程分項 ───────────────────────────────── */}
      <Card>
        <CardContent className="space-y-3 p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold">
              歸屬工程分項
              <span className="ml-2 font-normal text-muted-foreground">
                {check.total === 0
                  ? "未歸屬任何分項"
                  : `${check.done}/${check.total} 已完成`}
              </span>
            </h2>
          </div>

          {check.total === 0 ? (
            <p className="rounded-md border border-dashed px-3 py-8 text-center text-sm text-muted-foreground">
              此履約事項沒有歸屬的工程分項。管理類事項（如審查計畫書、提送報表）
              通常本來就沒有分項，可直接完成；若應有分項，請於專案頁的
              <b className="font-medium text-foreground">工程分項</b>設定歸屬。
            </p>
          ) : (
            <ul className="space-y-2">
              {detail.workItems.map((w) => (
                <WorkItemRow
                  key={w.id}
                  item={w}
                  canEdit={canEdit}
                  busy={busyItem === w.id && pending}
                  onComplete={() => completeItem(w.id, w.name)}
                  onSave={(input) => saveItemProgress(w.id, input)}
                />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* ── 編輯 ─────────────────────────────────────────── */}
      {canEdit ? (
        <Card>
          <CardContent className="space-y-4 p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold">編輯履約事項</h2>
              {spec ? (
                <div className="flex items-center gap-2 text-xs">
                  {locked ? (
                    <span
                      className="flex items-center gap-1.5 text-muted-foreground"
                      role="status"
                      aria-live="polite"
                    >
                      <Loader2 className="size-3.5 animate-spin text-primary" />
                      費思正在判讀，表單暫時鎖定
                    </span>
                  ) : assisting ? (
                    <span className="flex items-center gap-1.5 text-muted-foreground">
                      <Sparkles className="size-3.5 text-primary" />
                      費思正在協助此表單
                    </span>
                  ) : (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handToFaith}
                    >
                      <Sparkles className="size-3.5" />
                      請費思協助補齊
                    </Button>
                  )}
                </div>
              ) : null}
            </div>

            {formError ? (
              <p className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                {formError}
              </p>
            ) : null}

            <form ref={formRef} action={save} className="space-y-4">
              {/*
                判讀期間以 inert 停止互動並淡化：使用者若邊等邊改同一欄位，
                回填會與手動輸入互相蓋掉，事後也分不清哪個值是誰寫的。
              */}
              <div
                className={cn(
                  "grid grid-cols-1 gap-3 transition-opacity @[720px]:grid-cols-2",
                  locked && "opacity-40",
                )}
                inert={locked}
              >
                <Field label="管制編號" hint="契約或管制表的項次">
                  <Input name="code" defaultValue={detail.code} required />
                </Field>
                <Field label="履約事項">
                  <Input name="title" defaultValue={detail.title} required />
                </Field>
                <Field label="階段">
                  <Select name="stage" defaultValue={detail.stage}>
                    {obligationStageOptions.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="風險">
                  <Select name="risk" defaultValue={detail.risk}>
                    {obligationRiskOptions.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field
                  label="狀態"
                  hint={
                    check.ok
                      ? undefined
                      : "歸屬分項未全部完成前無法改為「完成」"
                  }
                >
                  <Select name="status" defaultValue={detail.status}>
                    {obligationStatusOptions.map((o) => (
                      <option
                        key={o.value}
                        value={o.value}
                        // 未達完成條件時連選項都不給選，比送出後才被拒絕清楚
                        disabled={o.value === "DONE" && !check.ok}
                      >
                        {o.label}
                      </option>
                    ))}
                  </Select>
                </Field>
                {/*
                  觸發方式與期限一組：四種方式需要的輸入完全不同，
                  由共用元件依所選方式切換，並即時預覽推算出的期限。
                */}
                <ObligationTriggerFields
                  defaults={{
                    triggerType: detail.triggerType,
                    dueDate: detail.dueDate,
                    relativeAnchor: detail.relativeAnchor,
                    offsetDays: detail.offsetDays,
                    predecessorId: detail.predecessorId,
                    conditionKind: detail.conditionKind,
                    conditionDetail: detail.conditionDetail,
                    dueDateOverridden: detail.dueDateOverridden,
                  }}
                  predecessors={detail.predecessorOptions}
                  context={triggerContext}
                  disabled={locked}
                />
                <Field label="實際完成日">
                  <Input
                    type="date"
                    name="actualDate"
                    defaultValue={detail.actualDate ?? ""}
                  />
                </Field>
                <Field label="責任單位">
                  <Input name="ownerUnit" defaultValue={detail.ownerUnit ?? ""} />
                </Field>
                <Field label="責任人">
                  <Input name="ownerName" defaultValue={detail.ownerName ?? ""} />
                </Field>
                <Field label="契約依據" hint="如 契約第五條第二款">
                  <Input
                    name="contractBasis"
                    defaultValue={detail.contractBasis ?? ""}
                  />
                </Field>
                <Field label="文號">
                  <Input name="docNo" defaultValue={detail.docNo ?? ""} />
                </Field>
                <Field label="進度權重" hint="正整數，依工作量給不同權重">
                  <Input
                    type="number"
                    name="weight"
                    min={1}
                    defaultValue={detail.weight}
                  />
                </Field>
                <label className="flex items-center gap-2 text-sm @[720px]:col-span-2">
                  <input
                    type="checkbox"
                    name="commissioning"
                    defaultChecked={detail.commissioning}
                    className="size-4 rounded border-input"
                  />
                  列入試運轉查核
                </label>
                <Field label="備註" className="@[720px]:col-span-2">
                  <Textarea name="note" rows={3} defaultValue={detail.note ?? ""} />
                </Field>
              </div>

              {/* 動作列共用同一套版面規則：靠右並讓出費思的位置 */}
              <FormActionBar className="-mx-5 -mb-5 px-5">
                <Button type="submit" disabled={saving || locked}>
                  {saving ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Save className="size-4" />
                  )}
                  儲存
                </Button>
              </FormActionBar>
            </form>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

function scopeLabel(detail: Detail): string | null {
  if (!detail.scopeItem) return null;
  const { code, title } = detail.scopeItem;
  return code ? `${code} ${title}` : title;
}

function Fact({
  label,
  value,
  mono,
}: {
  label: string;
  value: string | null;
  mono?: boolean;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd
        className={cn(
          "mt-0.5 truncate",
          mono && "tabular-nums",
          !value && "text-muted-foreground",
        )}
        title={value ?? undefined}
      >
        {value || "—"}
      </dd>
    </div>
  );
}

function Field({
  label,
  hint,
  className,
  children,
}: {
  label: string;
  hint?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <label className={cn("space-y-1 text-xs", className)}>
      <span className="text-muted-foreground">{label}</span>
      {children}
      {hint ? <span className="block text-[11px] text-muted-foreground">{hint}</span> : null}
    </label>
  );
}

/**
 * 單一工程分項：狀態、完成率，以及就地調整。
 *
 * 完成按鈕與百分比分開：把百分比拉到 100 不等於承辦人確認完成，
 * 而完成條件只認狀態，所以兩件事必須各有各的動作。
 */
function WorkItemRow({
  item,
  canEdit,
  busy,
  onComplete,
  onSave,
}: {
  item: Detail["workItems"][number];
  canEdit: boolean;
  busy: boolean;
  onComplete: () => void;
  onSave: (input: {
    progress: string;
    actualStart: string;
    actualEnd: string;
  }) => void;
}) {
  const [open, setOpen] = useState(false);
  const [progress, setProgress] = useState(String(item.progress));
  const [actualStart, setActualStart] = useState(item.actualStart ?? "");
  const [actualEnd, setActualEnd] = useState(item.actualEnd ?? "");
  const meta = workItemStatusMeta[item.status as WorkItemStatus];
  const complete = item.status === "COMPLETED";

  const dirty =
    progress !== String(item.progress) ||
    actualStart !== (item.actualStart ?? "") ||
    actualEnd !== (item.actualEnd ?? "");

  return (
    <li className="rounded-md border px-3 py-2.5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="flex min-w-0 flex-1 items-center gap-2">
          {complete ? (
            <Check className="size-4 shrink-0 text-muted-foreground" />
          ) : null}
          <span className="truncate text-sm font-medium" title={item.name}>
            {item.name}
          </span>
          {item.code ? (
            <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
              {item.code}
            </span>
          ) : null}
        </span>

        <Badge variant={meta?.variant ?? "muted"}>{meta?.label ?? item.status}</Badge>

        <span className="flex w-28 shrink-0 items-center gap-2">
          <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
            <span
              className={cn("block h-full rounded-full", complete ? "bg-muted-foreground" : "bg-primary")}
              style={{ width: `${item.progress}%` }}
            />
          </span>
          <span className="w-9 text-right text-xs tabular-nums text-muted-foreground">
            {item.progress}%
          </span>
        </span>

        {canEdit ? (
          <span className="flex shrink-0 items-center gap-1.5">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setOpen((v) => !v)}
            >
              {open ? "收合" : "調整"}
            </Button>
            {!complete ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onComplete}
                disabled={busy}
              >
                {busy ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Check className="size-3.5" />
                )}
                完成
              </Button>
            ) : null}
          </span>
        ) : null}
      </div>

      {open && canEdit ? (
        <div className="mt-3 grid grid-cols-1 gap-3 border-t pt-3 @[560px]:grid-cols-[110px_1fr_1fr_auto]">
          <Field label="完成率 %">
            <Input
              type="number"
              min={0}
              max={100}
              value={progress}
              onChange={(e) => setProgress(e.target.value)}
            />
          </Field>
          <Field label="實際開始">
            <Input
              type="date"
              value={actualStart}
              onChange={(e) => setActualStart(e.target.value)}
            />
          </Field>
          <Field label="實際完成">
            <Input
              type="date"
              value={actualEnd}
              onChange={(e) => setActualEnd(e.target.value)}
            />
          </Field>
          <div className="flex items-end">
            <Button
              type="button"
              size="sm"
              disabled={!dirty || busy}
              onClick={() => onSave({ progress, actualStart, actualEnd })}
            >
              {busy ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Save className="size-3.5" />
              )}
              儲存
            </Button>
          </div>
        </div>
      ) : null}
    </li>
  );
}
