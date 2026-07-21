import Link from "next/link";
import { Plus } from "lucide-react";

import * as people from "@/service/people.service";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Markdown } from "@/components/markdown";
import { SoftDeleteButton } from "@/components/ui/soft-delete-button";
import { accountRoleMeta, accountStatusMeta } from "@/constant/people";
import { cn } from "@/lib/utils";
import { AccountForm } from "./account-form";
import { AccountStatusToggle } from "./account-status-toggle";
import {
  createOrgUnitAction,
  createPositionAction,
  deleteAccountAction,
  restoreAccountAction,
  deleteOrgUnitAction,
  restoreOrgUnitAction,
  deletePositionAction,
  restorePositionAction,
} from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "人員管理 — PMIS" };

const TABS = [
  { key: "accounts", label: "帳號" },
  { key: "orgs", label: "組織" },
  { key: "positions", label: "職位" },
  { key: "chart", label: "組織架構圖" },
] as const;

export default async function PeoplePage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab } = await searchParams;
  const active = TABS.some((t) => t.key === tab) ? tab! : "accounts";

  const { orgUnits, positions, accounts, chart } = await people.getOverview();
  const orgName = new Map(orgUnits.map((o) => [o.id, o.name]));
  const orgOptions = orgUnits.map((o) => ({ id: o.id, name: o.name }));
  const positionOptions = positions.map((p) => ({ id: p.id, name: p.name }));

  return (
    <>
      <PageHeader
        title="人員管理"
        description="設定組織、職位與帳號，並檢視組織架構"
      />

      <div className="flex gap-1 border-b px-8">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/people?tab=${t.key}`}
            className={cn(
              "-mb-px border-b-2 px-4 py-3 text-sm font-medium transition-colors",
              active === t.key
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
          </Link>
        ))}
      </div>

      <div className="max-w-5xl space-y-6 p-8">
        {active === "accounts" && (
          <Card>
            <CardContent className="space-y-5 p-6">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>姓名</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>組織</TableHead>
                    <TableHead>職位</TableHead>
                    <TableHead>角色</TableHead>
                    <TableHead>狀態</TableHead>
                    <TableHead className="text-right">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {accounts.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                        尚無帳號。
                      </TableCell>
                    </TableRow>
                  ) : (
                    accounts.map((a) => (
                      <TableRow key={a.id}>
                        <TableCell className="font-medium">{a.name}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {a.email}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {a.orgUnit?.name ?? "—"}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {a.position?.name ?? "—"}
                        </TableCell>
                        <TableCell>
                          <Badge variant={accountRoleMeta[a.role].variant}>
                            {accountRoleMeta[a.role].label}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant={accountStatusMeta[a.status].variant}>
                            {accountStatusMeta[a.status].label}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center justify-end gap-1">
                            <AccountStatusToggle id={a.id} status={a.status} />
                            <SoftDeleteButton
                              id={a.id}
                              label="帳號"
                              name={a.name}
                              onDelete={deleteAccountAction}
                              onRestore={restoreAccountAction}
                            />
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>

              <div>
                <h3 className="mb-3 text-sm font-medium text-muted-foreground">
                  新增帳號
                </h3>
                <AccountForm
                  orgOptions={orgOptions}
                  positionOptions={positionOptions}
                />
              </div>
            </CardContent>
          </Card>
        )}

        {active === "orgs" && (
          <Card>
            <CardContent className="space-y-5 p-6">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>組織名稱</TableHead>
                    <TableHead>代碼</TableHead>
                    <TableHead>上級單位</TableHead>
                    <TableHead className="text-center">人數</TableHead>
                    <TableHead className="text-right">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {orgUnits.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                        尚無組織單位。
                      </TableCell>
                    </TableRow>
                  ) : (
                    orgUnits.map((o) => (
                      <TableRow key={o.id}>
                        <TableCell className="font-medium">{o.name}</TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">
                          {o.code ?? "—"}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {o.parentId ? (orgName.get(o.parentId) ?? "—") : "—"}
                        </TableCell>
                        <TableCell className="text-center tabular-nums">
                          {o._count.accounts}
                        </TableCell>
                        <TableCell className="text-right">
                          <SoftDeleteButton
                            id={o.id}
                            label="組織"
                            name={o.name}
                            onDelete={deleteOrgUnitAction}
                            onRestore={restoreOrgUnitAction}
                          />
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>

              <form
                action={createOrgUnitAction}
                className="grid grid-cols-1 gap-4 rounded-lg border bg-muted/30 p-4 sm:grid-cols-3"
              >
                <div className="space-y-1.5">
                  <Label htmlFor="org-name">組織名稱 *</Label>
                  <Input id="org-name" name="name" placeholder="品管組" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="org-code">代碼</Label>
                  <Input id="org-code" name="code" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="org-parent">上級單位</Label>
                  <Select id="org-parent" name="parentId" defaultValue="">
                    <option value="">（無，為最上層）</option>
                    {orgOptions.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.name}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="sm:col-span-3">
                  <Button type="submit" variant="secondary">
                    <Plus className="size-4" />
                    新增組織
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        {active === "positions" && (
          <Card>
            <CardContent className="space-y-5 p-6">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>職位名稱</TableHead>
                    <TableHead className="text-center">排序</TableHead>
                    <TableHead className="text-center">人數</TableHead>
                    <TableHead className="text-right">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {positions.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                        尚無職位。
                      </TableCell>
                    </TableRow>
                  ) : (
                    positions.map((p) => (
                      <TableRow key={p.id}>
                        <TableCell className="font-medium">{p.name}</TableCell>
                        <TableCell className="text-center tabular-nums text-muted-foreground">
                          {p.rank}
                        </TableCell>
                        <TableCell className="text-center tabular-nums">
                          {p._count.accounts}
                        </TableCell>
                        <TableCell className="text-right">
                          <SoftDeleteButton
                            id={p.id}
                            label="職位"
                            name={p.name}
                            onDelete={deletePositionAction}
                            onRestore={restorePositionAction}
                          />
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>

              <form
                action={createPositionAction}
                className="grid grid-cols-1 gap-4 rounded-lg border bg-muted/30 p-4 sm:grid-cols-3"
              >
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="pos-name">職位名稱 *</Label>
                  <Input id="pos-name" name="name" placeholder="主任工程師" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="pos-rank">排序</Label>
                  <Input id="pos-rank" name="rank" type="number" placeholder="0" />
                </div>
                <div className="sm:col-span-3">
                  <Button type="submit" variant="secondary">
                    <Plus className="size-4" />
                    新增職位
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        {active === "chart" && (
          <Card>
            <CardContent className="p-6">
              <Markdown content={chart} />
            </CardContent>
          </Card>
        )}
      </div>
    </>
  );
}
