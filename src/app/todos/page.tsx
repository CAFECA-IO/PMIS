import * as todoService from "@/service/todo.service";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { todoStatusMeta } from "@/constant/pmis";
import { cn, formatDate } from "@/lib/utils";
import { TodoActions } from "./todo-actions";
import { requireUser } from "@/service/auth.service";
import { assertModuleAccess, canEditModule } from "@/service/access.service";

export const dynamic = "force-dynamic";
export const metadata = { title: "待辦追蹤 — PMIS" };

export default async function TodosPage() {
  const user = await requireUser();
  const perms = await assertModuleAccess(user, "/todos");
  const canEdit = canEditModule(perms, "/todos");
  const todos = await todoService.listTodos();

  return (
    <>
      <PageHeader
        title="待辦事項追蹤"
        description="PMIS-02 · 追蹤各單位待辦事項與改善辦理情形"
      />
      <div className="p-4 sm:p-8">
        {todos.length === 0 ? (
          <p className="text-sm text-muted-foreground">尚無待辦事項。</p>
        ) : (
          <>
            {/* Info: (20260721 - Luphia) 手機卡片列表 */}
            <div className="space-y-3 sm:hidden">
              {todos.map((t) => {
                const read = t.readAt != null;
                return (
                  <div
                    key={t.id}
                    className={cn(
                      "space-y-2 rounded-lg border p-3",
                      t.status === "DONE" && "opacity-70",
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-1.5 font-medium">
                        {!read ? (
                          <span className="size-2 shrink-0 rounded-full bg-primary" />
                        ) : null}
                        <span className="min-w-0">{t.title}</span>
                      </div>
                      <Badge variant={todoStatusMeta[t.status].variant}>
                        {todoStatusMeta[t.status].label}
                      </Badge>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {t.unit ?? "—"}
                      {t.assignee ? ` · ${t.assignee}` : ""}
                      {t.source ? ` · ${t.source}` : ""}
                    </div>
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>{t.project.name}</span>
                      <span className="tabular-nums">
                        期限 {formatDate(t.dueDate)}
                      </span>
                    </div>
                    {canEdit && (
                      <TodoActions
                        id={t.id}
                        status={t.status}
                        read={read}
                        title={t.title}
                      />
                    )}
                  </div>
                );
              })}
            </div>

            {/* Info: (20260721 - Luphia) 桌機表格 */}
            <Card className="hidden overflow-hidden sm:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>事項</TableHead>
                    <TableHead>負責單位</TableHead>
                    <TableHead>來源</TableHead>
                    <TableHead>專案</TableHead>
                    <TableHead>期限</TableHead>
                    <TableHead>狀態</TableHead>
                    <TableHead className="text-right">標記</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {todos.map((t) => {
                    const read = t.readAt != null;
                    return (
                      <TableRow
                        key={t.id}
                        className={cn(t.status === "DONE" && "opacity-70")}
                      >
                        <TableCell className="font-medium">
                          <span className="flex items-center gap-1.5">
                            {!read ? (
                              <span className="size-2 shrink-0 rounded-full bg-primary" />
                            ) : null}
                            {t.title}
                          </span>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {t.unit ?? "—"}
                          {t.assignee ? ` · ${t.assignee}` : ""}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {t.source ?? "—"}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {t.project.name}
                        </TableCell>
                        <TableCell className="tabular-nums">
                          {formatDate(t.dueDate)}
                        </TableCell>
                        <TableCell>
                          <Badge variant={todoStatusMeta[t.status].variant}>
                            {todoStatusMeta[t.status].label}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {canEdit && (
                            <TodoActions
                              id={t.id}
                              status={t.status}
                              read={read}
                              title={t.title}
                            />
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </Card>
          </>
        )}
      </div>
    </>
  );
}
