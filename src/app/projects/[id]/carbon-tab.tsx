import Link from "next/link";
import { Sparkles } from "lucide-react";

import * as carbonService from "@/service/carbon.service";
import type { Actor } from "@/service/carbon.service";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { StatRows } from "@/components/charts";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  carbonScopeMeta,
  carbonScopeColor,
  carbonEntryStatusMeta,
  carbonIntensityBasisMeta,
  carbonIntensityBasisOptions,
} from "@/constant/pmis";
import { CARBON_SCOPES } from "@/service/carbon.calc";
import { cn, formatDate } from "@/lib/utils";
import { createInventoryAction } from "./carbon-actions";
import { CarbonEntryForm } from "./carbon-entry-form";
import { CarbonEntryRowActions } from "./carbon-entry-row-actions";
import { withProject } from "@/lib/project-link";

const num = (v: unknown) => (v == null ? 0 : Number(v));

export async function CarbonTab({
  projectId,
  actor,
  inventoryId,
}: {
  projectId: string;
  actor: Actor;
  inventoryId?: string;
}) {
  const inventories = await carbonService.getProjectInventories(projectId, actor);
  if (!inventories) return null;

  if (inventories.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">碳盤查</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            本專案尚未建立盤查。建立後即可記錄各類活動數據並自動計算溫室氣體排放量。
          </p>
          <form
            action={createInventoryAction}
            className="grid grid-cols-1 gap-4 rounded-lg border bg-muted/30 p-4 sm:grid-cols-2"
          >
            <input type="hidden" name="projectId" value={projectId} />
            <div className="space-y-1.5">
              <Label htmlFor="inv-name">盤查名稱</Label>
              <Input id="inv-name" name="name" placeholder="2026 年度盤查" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="inv-basis">強度基準</Label>
              <Select id="inv-basis" name="intensityBasis" defaultValue="CONTRACT_AMOUNT">
                {carbonIntensityBasisOptions.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="inv-target">減量目標 (tCO₂e)</Label>
              <Input id="inv-target" name="targetCo2e" type="number" step="any" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="inv-base">基準值 (tCO₂e)</Label>
              <Input id="inv-base" name="baselineCo2e" type="number" step="any" />
            </div>
            <div className="sm:col-span-2">
              <Button type="submit">建立盤查</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    );
  }

  const selectedId =
    inventoryId && inventories.some((i) => i.id === inventoryId)
      ? inventoryId
      : inventories[0].id;
  const detail = await carbonService.getInventory(selectedId, actor);
  if (!detail) return null;
  const { inventory, summary, intensity, target } = detail;
  const options = await carbonService.listFactorOptions(inventory.factorSetId);

  const scopeRows = CARBON_SCOPES.filter((s) => summary.byScopeKg[s] > 0).map(
    (s) => ({
      label: carbonScopeMeta[s].label,
      value: Math.round((summary.byScopeKg[s] / 1000) * 1000) / 1000,
      color: carbonScopeColor[s],
    }),
  );

  return (
    <div className="space-y-6">
      {/* Info: (20260721 - Luphia) 盤查切換 */}
      {inventories.length > 1 ? (
        <div className="flex flex-wrap gap-2">
          {inventories.map((inv) => (
            <Link
              key={inv.id}
              href={withProject(`/carbon?inv=${inv.id}`, projectId)}
              className={cn(
                "rounded-full border px-3 py-1 text-xs transition-colors",
                inv.id === selectedId
                  ? "border-primary bg-primary/10 text-foreground"
                  : "text-muted-foreground hover:bg-accent",
              )}
            >
              {inv.name}
            </Link>
          ))}
        </div>
      ) : null}

      {/* Info: (20260721 - Luphia) 總覽 */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between text-base">
              {inventory.name}
              {inventory.factorSet ? (
                <span className="text-xs font-normal text-muted-foreground">
                  係數：{inventory.factorSet.name}
                </span>
              ) : null}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-end gap-x-8 gap-y-2">
              <div>
                <div className="text-xs text-muted-foreground">總排放量</div>
                <div className="text-2xl font-semibold tabular-nums">
                  {summary.totalTonnes.toLocaleString()}{" "}
                  <span className="text-sm font-normal text-muted-foreground">
                    tCO₂e
                  </span>
                </div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">
                  排放強度（{carbonIntensityBasisMeta[intensity.basis].label}）
                </div>
                <div className="text-lg font-semibold tabular-nums">
                  {intensity.value == null ? "—" : intensity.value.toLocaleString()}
                  <span className="ml-1 text-xs font-normal text-muted-foreground">
                    {intensity.unit}
                  </span>
                </div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">對比目標</div>
                {inventory.targetCo2e == null ? (
                  <Badge variant="muted">未設定</Badge>
                ) : target.overTarget ? (
                  <Badge variant="destructive">
                    超標 {target.gap?.toLocaleString()} tCO₂e
                  </Badge>
                ) : (
                  <Badge variant="success">
                    低於目標 {Math.abs(target.gap ?? 0).toLocaleString()} tCO₂e
                  </Badge>
                )}
              </div>
            </div>

            <div className="flex flex-wrap gap-2 text-xs">
              <Badge variant="muted">草稿 {summary.draftCount}</Badge>
              <Badge variant="default">已確認 {summary.confirmedCount}</Badge>
              <Badge variant="success">已查證 {summary.verifiedCount}</Badge>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">分範疇排放 (tCO₂e)</CardTitle>
          </CardHeader>
          <CardContent>
            {scopeRows.length === 0 ? (
              <p className="text-sm text-muted-foreground">尚無排放資料。</p>
            ) : (
              <StatRows items={scopeRows} />
            )}
          </CardContent>
        </Card>
      </div>

      {/* Info: (20260721 - Luphia) 活動數據明細 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            活動數據 ({inventory.entries.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {inventory.entries.length === 0 ? (
            <p className="text-sm text-muted-foreground">尚無活動數據，請於下方新增。</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>範疇</TableHead>
                  <TableHead>類別</TableHead>
                  <TableHead className="text-right">活動數據</TableHead>
                  <TableHead className="text-right">係數</TableHead>
                  <TableHead className="text-right">排放 (tCO₂e)</TableHead>
                  <TableHead>狀態</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {inventory.entries.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell>
                      <Badge variant={carbonScopeMeta[e.scope].variant}>
                        {carbonScopeMeta[e.scope].label}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5 font-medium">
                        {e.category.name}
                        {e.aiExtracted ? (
                          <span
                            title="費思自憑證擷取"
                            className="inline-flex items-center gap-0.5 rounded bg-primary/10 px-1 text-[10px] text-primary"
                          >
                            <Sparkles className="size-3" />
                            費思
                          </span>
                        ) : null}
                      </div>
                      {e.occurredAt ? (
                        <div className="text-xs text-muted-foreground">
                          {formatDate(e.occurredAt)}
                        </div>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {num(e.activityQty).toLocaleString()} {e.activityUnit}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {num(e.factorValue)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {(num(e.co2e) / 1000).toFixed(3)}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col items-start gap-1">
                        <Badge variant={carbonEntryStatusMeta[e.status].variant}>
                          {carbonEntryStatusMeta[e.status].label}
                        </Badge>
                        {e.evidenceUrl ? (
                          <a
                            href={e.evidenceUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="text-xs text-primary hover:underline"
                          >
                            憑證
                          </a>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell>
                      <CarbonEntryRowActions
                        entryId={e.id}
                        projectId={projectId}
                        status={e.status}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          <CarbonEntryForm
            projectId={projectId}
            inventoryId={inventory.id}
            options={options}
          />
        </CardContent>
      </Card>

      {/* Info: (20260721 - Luphia) 稽核軌跡 */}
      {inventory.auditLogs.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">稽核軌跡</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {inventory.auditLogs.slice(0, 12).map((log) => (
              <div
                key={log.id}
                className="flex items-center justify-between gap-3 border-b pb-2 text-xs last:border-0 last:pb-0"
              >
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{log.action}</Badge>
                  <span className="text-muted-foreground">
                    {log.detail ?? ""}
                    {log.fromStatus && log.toStatus
                      ? `（${carbonEntryStatusMeta[log.fromStatus].label} → ${carbonEntryStatusMeta[log.toStatus].label}）`
                      : ""}
                  </span>
                </div>
                <div className="shrink-0 text-muted-foreground">
                  {log.actorName ?? "—"} · {formatDate(log.createdAt)}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
