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
import { formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata = { title: "待辦追蹤 — PMIS" };

export default async function TodosPage() {
  const todos = await todoService.listTodos();

  return (
    <>
      <PageHeader
        title="待辦事項追蹤"
        description="PMIS-02 · 追蹤各單位待辦事項與改善辦理情形"
      />
      <div className="p-8">
        <Card className="overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>事項</TableHead>
                <TableHead>負責單位</TableHead>
                <TableHead>來源</TableHead>
                <TableHead>專案</TableHead>
                <TableHead>期限</TableHead>
                <TableHead>狀態</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {todos.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                    尚無待辦事項。
                  </TableCell>
                </TableRow>
              ) : (
                todos.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="font-medium">{t.title}</TableCell>
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
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </Card>
      </div>
    </>
  );
}
