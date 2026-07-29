"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlarmClock,
  CalendarDays,
  Pencil,
  Plus,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useConfirm } from "@/components/ui/confirm-provider";
import { useNotification } from "@/components/ui/notification";
import { useAiAssistant } from "@/components/ai-assistant-context";
import { cn } from "@/lib/utils";
import {
  alertAnchorMeta,
  alertAnchorOptions,
  alertMetricMeta,
  alertMetricOptions,
  alertModuleMeta,
  alertOperatorOptions,
  alertRuleKindHint,
  alertRuleKindMeta,
  alertSeverityMeta,
  alertSeverityOptions,
  type AlertRuleKind,
} from "@/constant/alert";
import { describeRule, isRuleComplete, type AlertRule } from "@/service/alert-rule";
import {
  deleteAlertRuleAction,
  saveAlertRuleAction,
  toggleAlertRuleAction,
} from "./actions";

export type RuleRow = AlertRule & {
  description?: string | null;
  projectName?: string | null;
};

const KIND_ICON: Record<AlertRuleKind, LucideIcon> = {
  FIXED_DATE: CalendarDays,
  RELATIVE_DATE: AlarmClock,
  CONDITION: SlidersHorizontal,
};

const KIND_ORDER: AlertRuleKind[] = ["FIXED_DATE", "RELATIVE_DATE", "CONDITION"];

export function AlertRules({
  rules,
  projects,
  canEdit,
}: {
  rules: RuleRow[];
  projects: { id: string; name: string }[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const [editing, setEditing] = useState<RuleRow | "new" | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function toggle(rule: RuleRow) {
    setBusy(rule.id);
    try {
      await toggleAlertRuleAction(rule.id, !rule.enabled);
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  async function remove(rule: RuleRow) {
    const ok = await confirm({
      title: "刪除預警規則",
      description: `確定要刪除「${rule.name}」嗎？`,
      confirmLabel: "刪除",
      danger: true,
    });
    if (!ok) return;
    setBusy(rule.id);
    try {
      await deleteAlertRuleAction(rule.id);
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          規則分為固定日期、相對日期與條件觸發三類，可隨時啟用或停用；停用後不再產生預警。
        </p>
        {canEdit ? (
          <Button type="button" onClick={() => setEditing("new")}>
            <Plus className="size-4" />
            新增規則
          </Button>
        ) : null}
      </div>

      {KIND_ORDER.map((kind) => {
        const group = rules.filter((r) => r.kind === kind);
        const Icon = KIND_ICON[kind];
        return (
          <section key={kind} className="space-y-2">
            <div className="flex items-center gap-2">
              <Icon className="size-4 text-primary" />
              <h3 className="text-sm font-semibold">
                {alertRuleKindMeta[kind].label}
              </h3>
              <span className="text-xs text-muted-foreground">
                （{group.length} 條）· {alertRuleKindHint[kind]}
              </span>
            </div>

            {group.length === 0 ? (
              <p className="rounded-md border border-dashed px-3 py-4 text-center text-xs text-muted-foreground">
                尚無此類規則。
              </p>
            ) : (
              /*
                依「實際可用寬度」改雙欄（container query），讓卡片填滿寬度
                而非拉成長條；費思分欄展開時工作區變窄會自動回到單欄。
              */
              <div className="grid gap-2 @[1100px]:grid-cols-2">
                {group.map((rule) => {
                  const complete = isRuleComplete(rule);
                  return (
                    <Card
                      key={rule.id}
                      className={cn(!rule.enabled && "opacity-60")}
                    >
                      <CardContent className="flex flex-wrap items-start gap-3 p-4">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-medium">
                              {rule.name}
                            </span>
                            <Badge
                              variant={alertSeverityMeta[rule.severity].variant}
                            >
                              {alertSeverityMeta[rule.severity].label}
                            </Badge>
                            <Badge variant="muted">
                              {alertModuleMeta[rule.module] ?? rule.module}
                            </Badge>
                            {rule.projectName ? (
                              <Badge variant="outline">{rule.projectName}</Badge>
                            ) : (
                              <Badge variant="outline">全部專案</Badge>
                            )}
                            {!complete ? (
                              <Badge variant="destructive">
                                <TriangleAlert className="mr-1 size-3" />
                                設定未完成
                              </Badge>
                            ) : null}
                          </div>
                          <div className="mt-1 text-xs text-muted-foreground">
                            觸發條件：{describeRule(rule)}
                            {rule.anchor
                              ? `（${alertAnchorMeta[rule.anchor].label}）`
                              : ""}
                          </div>
                          {rule.action ? (
                            <div className="mt-0.5 text-xs text-muted-foreground">
                              命中行動：{rule.action}
                            </div>
                          ) : null}
                          {rule.notify ? (
                            <div className="mt-0.5 text-xs text-muted-foreground">
                              通知對象：{rule.notify}
                            </div>
                          ) : null}
                        </div>

                        <div className="flex shrink-0 items-center gap-1">
                          <label
                            className={cn(
                              "mr-1 flex cursor-pointer items-center gap-1.5 text-xs",
                              !canEdit && "pointer-events-none opacity-50",
                            )}
                            title={rule.enabled ? "點擊停用" : "點擊啟用"}
                          >
                            <input
                              type="checkbox"
                              className="size-4 accent-[var(--primary)]"
                              checked={rule.enabled}
                              disabled={!canEdit || busy === rule.id}
                              onChange={() => void toggle(rule)}
                            />
                            <span
                              className={
                                rule.enabled
                                  ? "text-success"
                                  : "text-muted-foreground"
                              }
                            >
                              {rule.enabled ? "啟用中" : "已停用"}
                            </span>
                          </label>
                          {canEdit ? (
                            <>
                              <button
                                type="button"
                                aria-label="編輯"
                                onClick={() => setEditing(rule)}
                                className="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
                              >
                                <Pencil className="size-4" />
                              </button>
                              <button
                                type="button"
                                aria-label="刪除"
                                onClick={() => void remove(rule)}
                                className="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                              >
                                <Trash2 className="size-4" />
                              </button>
                            </>
                          ) : null}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </section>
        );
      })}

      {editing ? (
        <RuleDialog
          rule={editing === "new" ? null : editing}
          projects={projects}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </div>
  );
}

type DraftState = {
  name: string;
  description: string;
  kind: AlertRuleKind;
  module: string;
  severity: string;
  projectId: string;
  fixedDate: string;
  anchor: string;
  offsetDays: string;
  metric: string;
  operator: string;
  threshold: string;
  unit: string;
  action: string;
  notify: string;
};

function initialDraft(rule: RuleRow | null): DraftState {
  return {
    name: rule?.name ?? "",
    description: rule?.description ?? "",
    kind: rule?.kind ?? "CONDITION",
    module: rule?.module ?? "/schedule",
    severity: rule?.severity ?? "WARNING",
    projectId: rule?.projectId ?? "",
    fixedDate: rule?.fixedDate ?? "",
    anchor: rule?.anchor ?? "DOCUMENT_DUE",
    offsetDays: rule?.offsetDays != null ? String(rule.offsetDays) : "7",
    metric: rule?.metric ?? "SCHEDULE_LAG",
    operator: rule?.operator ?? "GTE",
    threshold: rule?.threshold != null ? String(rule.threshold) : "",
    unit: rule?.unit ?? "",
    action: rule?.action ?? "",
    notify: rule?.notify ?? "",
  };
}

/**
 * 本次瀏覽期間已詢問過要不要費思協助的任務。
 * 用 Set 而非 let：重新指派模組層級變數會被視為 render 期間的副作用。
 */
const assistAsked = new Set<string>();

const AI_TASK_ID = "alert-rule-draft";

const AI_EXAMPLES = [
  "進度落後超過 8% 就通知專案經理並召開趕工會議",
  "查驗不合格達 1 件立刻開 NCR 並追蹤複查",
  "缺失改善期限前 3 天提醒工地主任",
  "CCTV 離線超過 10 分鐘通知資訊與現場人員",
];

function RuleDialog({
  rule,
  projects,
  onClose,
}: {
  rule: RuleRow | null;
  projects: { id: string; name: string }[];
  onClose: () => void;
}) {
  const router = useRouter();
  const { task, startTask, endTask, expanded: aiOpen, registerOffer } =
    useAiAssistant();
  const [draft, setDraft] = useState<DraftState>(() => initialDraft(rule));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = <K extends keyof DraftState>(key: K, value: DraftState[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  const aiActive = task?.id === AI_TASK_ID;
  const { notify } = useNotification();

  /** 把「協助制定規則」交給費思執行，結果回填本表單。 */
  function askFase() {
    startTask({
      id: AI_TASK_ID,
      title: "協助制定預警規則",
      greeting:
        "好的，我來協助您制定**預警規則**。請用一句話描述您想要的預警，例如：\n\n- 進度落後超過 8% 就通知專案經理並召開趕工會議\n- CCTV 離線超過 10 分鐘通知資訊與現場人員\n\n我會判斷規則類型與門檻，直接幫您填進表單。",
      endpoint: "/api/alerts/draft",
      suggestions: AI_EXAMPLES,
      buildBody: ({ messages }) => ({
        // 取最後一則使用者訊息作為指示
        instruction: [...messages].reverse().find((m) => m.role === "user")?.text ?? "",
      }),
      onResult: (data) => {
        const suggested = (data.rule ?? {}) as Record<string, string | number>;
        // 只覆寫 AI 有給值的欄位，使用者已填的其他內容保留
        setDraft((d) => {
          const next = { ...d };
          for (const [k, v] of Object.entries(suggested)) {
            if (v === "" || v == null) continue;
            if (k in next) (next as Record<string, string>)[k] = String(v);
          }
          return next;
        });
      },
    });
  }

  // 關閉表單時一併結束費思任務，避免任務殘留
  /* 對話框開啟期間，點右下角費思等同啟動 AI 協助制定。 */
  useEffect(() => {
    return registerOffer({
      taskId: AI_TASK_ID,
      title: rule ? "編輯預警規則" : "新增預警規則",
      start: () => askFase(),
    });
    // askFase 在本元件生命週期內穩定
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [registerOffer, rule]);

  /*
    開啟規則對話框時主動詢問是否要費思協助。
    取代原本的按鈕：入口統一為右下角的狀態顯示，這裡只負責提出邀請。
    本次瀏覽期間只問一次，避免反覆開關對話框被打擾。
  */
  useEffect(() => {
    // 費思已開啟而自動接手時不必再問
    if (aiActive) return;
    if (assistAsked.has(AI_TASK_ID)) return;
    assistAsked.add(AI_TASK_ID);
    notify({
      title: "需要費思協助制定預警規則嗎？",
      description: "用一句話描述你想要的預警，我來轉成規則設定。",
      variant: "info",
      actionLabel: "好，交給費思",
      actionIcon: "sparkles",
      onAction: () => askFase(),
      duration: 12000,
    });
    // askFase 與 notify 在本元件生命週期內穩定，僅需於開啟時觸發一次
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aiActive]);

  function close() {
    if (aiActive) endTask();
    onClose();
  }

  async function submit(fd: FormData) {
    setSaving(true);
    setError(null);
    try {
      const res = await saveAlertRuleAction({}, fd);
      if (res.error) {
        setError(res.error);
        return;
      }
      close();
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className={cn(
        "fixed inset-0 z-[80] flex items-center justify-center p-4",
        // 費思分欄展開時，對話框改在剩餘空間居中，避免被分欄遮住；
        // 加上轉場讓讓位過程與分欄同步滑動
        "transition-[padding] duration-300 ease-out",
        aiOpen && "lg:pr-[400px] xl:pr-[440px]",
      )}
      role="dialog"
      aria-modal="true"
    >
      <div className="absolute inset-0 bg-black/40" onClick={close} />
      <div className="relative z-10 flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border bg-card shadow-overlay">
        <div className="border-b px-5 py-3">
          <h2 className="text-base font-semibold">
            {rule ? "編輯預警規則" : "新增預警規則"}
          </h2>
        </div>
        <form action={submit} className="flex min-h-0 flex-1 flex-col">
          {rule ? <input type="hidden" name="id" value={rule.id} /> : null}
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
            {aiActive ? (
              <div className="animate-bubble-in flex items-start gap-2 rounded-lg border border-primary/40 bg-primary/5 p-3 text-sm">
                <Sparkles className="mt-0.5 size-4 shrink-0 text-primary" />
                <div>
                  <span className="font-medium text-primary">
                    費思正在協助制定此規則
                  </span>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    請在右下角的費思對話框描述您要的預警，建議設定會自動填入下方欄位。
                  </p>
                </div>
              </div>
            ) : null}

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="name">
                  規則名稱<span className="ml-0.5 text-destructive">*</span>
                </Label>
                <Input
                  id="name"
                  name="name"
                  required
                  value={draft.name}
                  onChange={(e) => set("name", e.target.value)}
                  placeholder="如 進度落後預警"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="kind">規則類型</Label>
                <Select
                  id="kind"
                  name="kind"
                  value={draft.kind}
                  onChange={(e) => set("kind", e.target.value as AlertRuleKind)}
                >
                  {KIND_ORDER.map((k) => (
                    <option key={k} value={k}>
                      {alertRuleKindMeta[k].label}
                    </option>
                  ))}
                </Select>
                <p className="text-xs text-muted-foreground">
                  {alertRuleKindHint[draft.kind]}
                </p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="severity">嚴重度</Label>
                <Select
                  id="severity"
                  name="severity"
                  value={draft.severity}
                  onChange={(e) => set("severity", e.target.value)}
                >
                  {alertSeverityOptions.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="projectId">適用專案</Label>
                <Select
                  id="projectId"
                  name="projectId"
                  value={draft.projectId}
                  onChange={(e) => set("projectId", e.target.value)}
                >
                  <option value="">全部專案</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="module">綁定模組</Label>
                <Select
                  id="module"
                  name="module"
                  value={draft.module}
                  onChange={(e) => set("module", e.target.value)}
                >
                  {Object.entries(alertModuleMeta).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </Select>
              </div>

              {/* 依類型顯示對應設定 */}
              {draft.kind === "FIXED_DATE" ? (
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="fixedDate">觸發日期</Label>
                  <Input
                    id="fixedDate"
                    name="fixedDate"
                    type="date"
                    value={draft.fixedDate}
                    onChange={(e) => set("fixedDate", e.target.value)}
                  />
                </div>
              ) : null}

              {draft.kind === "RELATIVE_DATE" ? (
                <>
                  <div className="space-y-1.5">
                    <Label htmlFor="anchor">基準日</Label>
                    <Select
                      id="anchor"
                      name="anchor"
                      value={draft.anchor}
                      onChange={(e) => set("anchor", e.target.value)}
                    >
                      {alertAnchorOptions.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="offsetDays">提前天數</Label>
                    <Input
                      id="offsetDays"
                      name="offsetDays"
                      type="number"
                      min={0}
                      value={draft.offsetDays}
                      onChange={(e) => set("offsetDays", e.target.value)}
                    />
                  </div>
                </>
              ) : null}

              {draft.kind === "CONDITION" ? (
                <>
                  <div className="space-y-1.5">
                    <Label htmlFor="metric">指標</Label>
                    <Select
                      id="metric"
                      name="metric"
                      value={draft.metric}
                      onChange={(e) => {
                        const m = e.target.value;
                        set("metric", m);
                        // 切換指標時同步帶入預設單位
                        const meta = alertMetricMeta[m as keyof typeof alertMetricMeta];
                        if (meta) set("unit", meta.unit);
                      }}
                    >
                      {alertMetricOptions.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div className="grid grid-cols-[80px_1fr_88px] gap-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="operator">條件</Label>
                      <Select
                        id="operator"
                        name="operator"
                        value={draft.operator}
                        onChange={(e) => set("operator", e.target.value)}
                      >
                        {alertOperatorOptions.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="threshold">門檻值</Label>
                      <Input
                        id="threshold"
                        name="threshold"
                        type="number"
                        step="any"
                        value={draft.threshold}
                        onChange={(e) => set("threshold", e.target.value)}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="unit">單位</Label>
                      <Input
                        id="unit"
                        name="unit"
                        value={draft.unit}
                        onChange={(e) => set("unit", e.target.value)}
                      />
                    </div>
                  </div>
                </>
              ) : null}

              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="action">命中後行動</Label>
                <Input
                  id="action"
                  name="action"
                  value={draft.action}
                  onChange={(e) => set("action", e.target.value)}
                  placeholder="如 建立趕工計畫與每週檢討會"
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="notify">通知對象</Label>
                <Input
                  id="notify"
                  name="notify"
                  value={draft.notify}
                  onChange={(e) => set("notify", e.target.value)}
                  placeholder="如 承辦,專案經理"
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="description">說明</Label>
                <Textarea
                  id="description"
                  name="description"
                  rows={2}
                  value={draft.description}
                  onChange={(e) => set("description", e.target.value)}
                />
              </div>
            </div>
          </div>

          {error ? (
            <div className="mx-5 mb-1 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          ) : null}

          <div className="flex items-center justify-between gap-2 border-t px-5 py-3">
            {/*
              不放「AI 協助制定」按鈕：費思的狀態與入口統一在右下角的狀態顯示，
              與專案建置及各建置對話框一致，避免同一件事有兩個入口。
            */}
            <span className="text-xs text-muted-foreground">
              {aiActive
                ? "費思正在協助制定，可於右下角查看狀態"
                : "點右下角的費思即可請它協助制定規則"}
            </span>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={close}
                disabled={saving}
              >
                取消
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? "儲存中…" : "儲存規則"}
              </Button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
