import Link from "next/link";

import * as people from "@/service/people.service";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
import { ModulePermissionFields } from "./module-permission-fields";
import { CreateRecordDialog } from "@/components/ui/create-record-dialog";
import { PMIS_MODULES } from "@/constant/modules";
import { requireUser } from "@/service/auth.service";
import { assertModuleAccess, canEditModule } from "@/service/access.service";
import {
  createOrgUnitAction,
  createPositionWithPermsAction,
  updatePositionPermsAction,
  deleteAccountAction,
  restoreAccountAction,
  deleteOrgUnitAction,
  restoreOrgUnitAction,
  deletePositionAction,
  restorePositionAction,
} from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "組織管理 — PMIS" };

const TABS = [
  { key: "accounts", label: "帳號" },
  { key: "orgs", label: "組織" },
  { key: "positions", label: "職位" },
  { key: "chart", label: "組織架構圖" },
] as const;

const PERM_OVERVIEW: Record<string, { label: string; className: string }> = {
  NONE: { label: "無", className: "text-muted-foreground" },
  VIEW: { label: "檢視", className: "bg-info-soft text-info" },
  EDIT: { label: "編輯", className: "bg-success-soft text-success" },
};

export default async function PeoplePage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab } = await searchParams;
  const user = await requireUser();
  const perms = await assertModuleAccess(user, "/people");
  const canEdit = canEditModule(perms, "/people");
  const active = TABS.some((t) => t.key === tab) ? tab! : "accounts";

  const { orgUnits, positions, accounts, chart } = await people.getOverview();
  const orgName = new Map(orgUnits.map((o) => [o.id, o.name]));
  const orgOptions = orgUnits.map((o) => ({ id: o.id, name: o.name }));
  const positionOptions = positions.map((p) => ({ id: p.id, name: p.name }));
  const positionPerms =
    active === "positions" ? await people.listPositionPermissions() : [];
  const permById = new Map(positionPerms.map((pp) => [pp.id, pp.permissions]));

  return (
    <>
      <PageHeader
        section="06 專案與系統設定"
        title="組織管理"
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
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base">帳號</CardTitle>
              {canEdit && (
                <AccountForm
                  orgOptions={orgOptions}
                  positionOptions={positionOptions}
                />
              )}
            </CardHeader>
            <CardContent className="space-y-5 p-6 pt-0">
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
                          {canEdit && (
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
                          )}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>

            </CardContent>
          </Card>
        )}

        {active === "orgs" && (
          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base">組織單位</CardTitle>
              {canEdit && (
              <CreateRecordDialog
                title="新增組織"
                triggerLabel="新增組織"
                action={createOrgUnitAction}
              >
                <div className="space-y-1.5">
                  <Label htmlFor="org-name">組織名稱 *</Label>
                  <Input id="org-name" name="name" placeholder="品管組" required />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="org-code">代碼</Label>
                  <Input id="org-code" name="code" />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
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
              </CreateRecordDialog>
              )}
            </CardHeader>
            <CardContent className="space-y-5 p-6 pt-0">
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
                          {canEdit && (
                            <SoftDeleteButton
                              id={o.id}
                              label="組織"
                              name={o.name}
                              onDelete={deleteOrgUnitAction}
                              onRestore={restoreOrgUnitAction}
                            />
                          )}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        {active === "positions" && (
          <div className="space-y-6">
            <Card>
              <CardHeader className="flex-row items-center justify-between space-y-0">
                <CardTitle className="text-base">職位</CardTitle>
                {canEdit && (
                <CreateRecordDialog
                  title="新增職位"
                  triggerLabel="新增職位"
                  action={createPositionWithPermsAction}
                >
                  <div className="space-y-1.5">
                    <Label htmlFor="pos-name">職位名稱 *</Label>
                    <Input id="pos-name" name="name" placeholder="主任工程師" required />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="pos-rank">排序</Label>
                    <Input id="pos-rank" name="rank" type="number" placeholder="0" />
                  </div>
                  <ModulePermissionFields />
                </CreateRecordDialog>
                )}
              </CardHeader>
              <CardContent>
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
                            {canEdit && (
                              <div className="flex items-center justify-end gap-1">
                                <CreateRecordDialog
                                  title={`編輯權限：${p.name}`}
                                  triggerLabel="編輯權限"
                                  triggerVariant="outline"
                                  triggerSize="sm"
                                  action={updatePositionPermsAction}
                                >
                                  <input type="hidden" name="positionId" value={p.id} />
                                  <ModulePermissionFields values={permById.get(p.id)} />
                                </CreateRecordDialog>
                                <SoftDeleteButton
                                  id={p.id}
                                  label="職位"
                                  name={p.name}
                                  onDelete={deletePositionAction}
                                  onRestore={restorePositionAction}
                                />
                              </div>
                            )}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">權限總覽</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto rounded-lg border">
                  <table className="w-max border-collapse text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="sticky left-0 z-20 w-[150px] min-w-[150px] border-r bg-muted px-3 py-2 text-left font-medium">
                          職位
                        </th>
                        {PMIS_MODULES.map((m) => (
                          <th
                            key={m.key}
                            className="w-[84px] min-w-[84px] whitespace-nowrap bg-muted/40 px-2 py-2 text-center text-xs font-medium"
                            title={m.code}
                          >
                            {m.label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {positionPerms.map((p) => (
                        <tr key={p.id} className="border-b last:border-0">
                          <td className="sticky left-0 z-10 w-[150px] min-w-[150px] border-r bg-card px-3 py-2 font-medium">
                            {p.name}
                          </td>
                          {PMIS_MODULES.map((m) => {
                            const lv = p.permissions[m.key] ?? "NONE";
                            const meta = PERM_OVERVIEW[lv];
                            return (
                              <td key={m.key} className="px-2 py-2 text-center">
                                <span
                                  className={cn(
                                    "inline-block rounded px-1.5 py-0.5 text-xs",
                                    meta.className,
                                  )}
                                >
                                  {meta.label}
                                </span>
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </div>
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
