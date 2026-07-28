import Link from "next/link";
import { Sparkles, TrendingUp, TrendingDown, Scale, Wallet } from "lucide-react";

import * as financeService from "@/service/finance.service";
import * as projectService from "@/service/project.service";
import { requireUser } from "@/service/auth.service";
import { assertModuleAccess, canEditModule } from "@/service/access.service";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatRows } from "@/components/charts";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ProjectSwitcher } from "@/components/project-switcher";
import { financialDirectionMeta, voucherStatusMeta } from "@/constant/pmis";
import { cn, formatCurrency, formatDate } from "@/lib/utils";
import { VoucherForm } from "./voucher-form";
import { VoucherRowActions } from "./voucher-row-actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "財務管理 — PMIS" };

const PALETTE = ["#2563eb", "#f59e0b", "#10b981", "#ef4444", "#8b5cf6", "#06b6d4", "#eab308", "#64748b"];

function categoryRows(map: Record<string, number>) {
  return Object.entries(map)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([label, value], i) => ({ label, value, color: PALETTE[i % PALETTE.length] }));
}

function KpiCard({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof Wallet;
  label: string;
  value: string;
  tone?: "pos" | "neg";
}) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Icon className="size-4" />
          {label}
        </div>
        <div
          className={cn(
            "mt-2 text-xl font-semibold tabular-nums",
            tone === "pos" && "text-success",
            tone === "neg" && "text-destructive",
          )}
        >
          {value}
        </div>
      </CardContent>
    </Card>
  );
}

export default async function FinancePage({
  searchParams,
}: {
  searchParams: Promise<{ project?: string }>;
}) {
  const user = await requireUser();
  const perms = await assertModuleAccess(user, "/finance");
  const canEdit = canEditModule(perms, "/finance");
  const { project } = await searchParams;
  const projectList = await projectService.listProjects(user);
  const actor = { id: user.id, name: user.name, role: user.role };
  const selectedProjectId =
    project && projectList.some((p) => p.id === project) ? project : undefined;

  const header = (
    <PageHeader
      section="02 契約與時程管理"
        title="財務管理"
      description="專案損益、收支與現金水位；上傳憑證由費思自動轉會計傳票（PMIS-08）"
      action={
        <ProjectSwitcher
          projects={projectList.map((p) => ({ id: p.id, name: p.name }))}
          selected={selectedProjectId}
        />
      }
    />
  );

  // Info: (20260721 - Luphia) ── 單一專案檢視 ──
  if (selectedProjectId) {
    const finance = await financeService.getProjectFinance(
      selectedProjectId,
      actor,
    );
    if (!finance) {
      return (
        <>
          {header}
          <div className="p-8 text-sm text-muted-foreground">無法存取此專案。</div>
        </>
      );
    }
    const { vouchers, summary } = finance;
    const rows = categoryRows(summary.expenseByCategory);

    return (
      <>
        {header}
        <div className="space-y-6 p-8">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <KpiCard icon={Scale} label="專案損益" value={formatCurrency(summary.profit)} tone={summary.profit >= 0 ? "pos" : "neg"} />
            <KpiCard icon={TrendingUp} label="累計收入" value={formatCurrency(summary.income)} />
            <KpiCard icon={TrendingDown} label="累計支出" value={formatCurrency(summary.expense)} />
            <KpiCard icon={Wallet} label="現金水位" value={formatCurrency(summary.cash)} tone={summary.cash >= 0 ? "pos" : "neg"} />
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">支出分類</CardTitle>
            </CardHeader>
            <CardContent>
              {rows.length === 0 ? (
                <p className="text-sm text-muted-foreground">尚無支出資料。</p>
              ) : (
                <StatRows items={rows} />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">會計傳票 ({vouchers.length})</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {vouchers.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {canEdit
                    ? "尚無傳票，請於下方新增或上傳憑證。"
                    : "尚無傳票。"}
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>日期</TableHead>
                      <TableHead>傳票號</TableHead>
                      <TableHead>方向</TableHead>
                      <TableHead>科目</TableHead>
                      <TableHead className="text-right">金額</TableHead>
                      <TableHead>對象</TableHead>
                      <TableHead>狀態</TableHead>
                      <TableHead className="text-right">操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {vouchers.map((v) => (
                      <TableRow key={v.id}>
                        <TableCell className="tabular-nums">{formatDate(v.date)}</TableCell>
                        <TableCell className="font-mono text-xs">{v.voucherNo ?? "—"}</TableCell>
                        <TableCell>
                          <Badge variant={financialDirectionMeta[v.direction].variant}>
                            {financialDirectionMeta[v.direction].label}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1.5">
                            {v.category}
                            {v.aiExtracted ? (
                              <span title="費思擷取" className="inline-flex items-center gap-0.5 rounded bg-primary/10 px-1 text-[10px] text-primary">
                                <Sparkles className="size-3" />費思
                              </span>
                            ) : null}
                          </div>
                          {v.summary ? (
                            <div className="text-xs text-muted-foreground">{v.summary}</div>
                          ) : null}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatCurrency(Number(v.amount))}
                        </TableCell>
                        <TableCell className="text-muted-foreground">{v.counterparty ?? "—"}</TableCell>
                        <TableCell>
                          <Badge variant={voucherStatusMeta[v.status].variant}>
                            {voucherStatusMeta[v.status].label}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {canEdit && (
                            <VoucherRowActions id={v.id} status={v.status} />
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}

              {canEdit && <VoucherForm projectId={selectedProjectId} />}
            </CardContent>
          </Card>
        </div>
      </>
    );
  }

  // Info: (20260721 - Luphia) ── 全部專案總覽 ──
  const cross = await financeService.crossProjectSummary(actor);
  const rows = categoryRows(cross.summary.expenseByCategory);

  return (
    <>
      {header}
      <div className="space-y-6 p-8">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <KpiCard icon={Scale} label="總損益" value={formatCurrency(cross.summary.profit)} tone={cross.summary.profit >= 0 ? "pos" : "neg"} />
          <KpiCard icon={TrendingUp} label="累計收入" value={formatCurrency(cross.summary.income)} />
          <KpiCard icon={TrendingDown} label="累計支出" value={formatCurrency(cross.summary.expense)} />
          <KpiCard icon={Wallet} label="現金水位" value={formatCurrency(cross.summary.cash)} tone={cross.summary.cash >= 0 ? "pos" : "neg"} />
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">各專案損益</CardTitle>
            </CardHeader>
            <CardContent>
              {cross.projects.length === 0 ? (
                <p className="text-sm text-muted-foreground">尚無財務資料。</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>專案</TableHead>
                      <TableHead className="text-right">收入</TableHead>
                      <TableHead className="text-right">支出</TableHead>
                      <TableHead className="text-right">損益</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {cross.projects.map((p) => (
                      <TableRow key={p.projectId}>
                        <TableCell className="font-medium">
                          <Link href={`/finance?project=${p.projectId}`} className="text-primary hover:underline">
                            {p.projectName}
                          </Link>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{formatCurrency(p.income)}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatCurrency(p.expense)}</TableCell>
                        <TableCell className={cn("text-right tabular-nums", p.profit >= 0 ? "text-success" : "text-destructive")}>
                          {formatCurrency(p.profit)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">支出分類</CardTitle>
            </CardHeader>
            <CardContent>
              {rows.length === 0 ? (
                <p className="text-sm text-muted-foreground">尚無支出資料。</p>
              ) : (
                <StatRows items={rows} />
              )}
            </CardContent>
          </Card>
        </div>

        <p className="text-sm text-muted-foreground">
          選擇上方單一專案，即可新增傳票或上傳憑證由費思自動轉換。
        </p>
      </div>
    </>
  );
}
