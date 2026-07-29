import * as qualityService from "@/service/quality.service";
import * as projectService from "@/service/project.service";
import { requireUser } from "@/service/auth.service";
import { assertModuleAccess, canEditModule } from "@/service/access.service";
import { PageHeader } from "@/components/page-header";
import { ProjectSwitcher } from "@/components/project-switcher";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { CreateRecordDialog } from "@/components/ui/create-record-dialog";
import {
  inspectionTypeMeta,
  inspectionResultMeta,
  defectSeverityMeta,
  defectStatusMeta,
} from "@/constant/pmis";
import { formatDate } from "@/lib/utils";
import { createInspectionAction, createDefectAction } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "品質稽核 — PMIS" };

export default async function QualityPage({
  searchParams,
}: {
  searchParams: Promise<{ project?: string }>;
}) {
  const user = await requireUser();
  const perms = await assertModuleAccess(user, "/quality");
  const canEdit = canEditModule(perms, "/quality");
  const { project } = await searchParams;
  const projectList = await projectService.listProjects(user);
  const selectedProjectId =
    project && projectList.some((p) => p.id === project) ? project : undefined;
  const { inspections, defects } = await qualityService.getQuality(
    selectedProjectId,
  );
  const workItems = selectedProjectId
    ? await qualityService.listWorkItems(selectedProjectId)
    : [];

  return (
    <>
      <PageHeader
        section="04 工程執行與查核"
        title="品質稽核管理"
        description="PMIS-07 · 施工品質抽查、材料設備抽驗與缺失改善追蹤"
        action={
          <ProjectSwitcher
            projects={projectList.map((p) => ({ id: p.id, name: p.name }))}
            selected={selectedProjectId}
          />
        }
      />
      <div className="space-y-6 p-8">
        {!selectedProjectId ? (
          <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
            於右上角選擇<b>單一專案</b>後，即可新增查驗與缺失，並指定其「所屬分項」（連結 PMIS-04 工程分項）。
          </p>
        ) : canEdit ? (
          <div className="flex flex-wrap justify-end gap-2">
            <CreateRecordDialog
              title="新增查驗"
                  assistId="inspection"
              triggerLabel="新建查驗"
              action={createInspectionAction}
            >
              <input type="hidden" name="projectId" value={selectedProjectId} />
              <label className="space-y-1 text-xs">
                <span className="text-muted-foreground">查驗類別</span>
                <Select name="type" defaultValue="PROCESS">
                  {Object.entries(inspectionTypeMeta).map(([v, m]) => (
                    <option key={v} value={v}>
                      {m.label}
                    </option>
                  ))}
                </Select>
              </label>
              <label className="space-y-1 text-xs">
                <span className="text-muted-foreground">所屬工項（PMIS-04）</span>
                <Select name="workItemId" defaultValue="">
                  <option value="">不指定</option>
                  {workItems.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name}
                    </option>
                  ))}
                </Select>
              </label>
              <label className="space-y-1 text-xs">
                <span className="text-muted-foreground">查驗日期</span>
                <Input name="scheduledAt" type="date" />
              </label>
              <label className="space-y-1 text-xs">
                <span className="text-muted-foreground">結果</span>
                <Select name="result" defaultValue="PENDING">
                  {Object.entries(inspectionResultMeta).map(([v, m]) => (
                    <option key={v} value={v}>
                      {m.label}
                    </option>
                  ))}
                </Select>
              </label>
              <label className="space-y-1 text-xs">
                <span className="text-muted-foreground">部位</span>
                <Input name="location" placeholder="如：B2 連續壁 P12" />
              </label>
              <label className="space-y-1 text-xs">
                <span className="text-muted-foreground">查驗人</span>
                <Input name="inspector" placeholder="預設為登入者" />
              </label>
              <label className="space-y-1 text-xs sm:col-span-2">
                <span className="text-muted-foreground">備註</span>
                <Input name="notes" />
              </label>
            </CreateRecordDialog>

            <CreateRecordDialog
              title="新增缺失"
                  assistId="defect"
              triggerLabel="新建缺失"
              action={createDefectAction}
            >
              <input type="hidden" name="projectId" value={selectedProjectId} />
              <label className="space-y-1 text-xs sm:col-span-2">
                <span className="text-muted-foreground">缺失標題</span>
                <Input name="title" placeholder="如：臨邊防護欄杆高度不足" />
              </label>
              <label className="space-y-1 text-xs">
                <span className="text-muted-foreground">所屬工項（PMIS-04）</span>
                <Select name="workItemId" defaultValue="">
                  <option value="">不指定</option>
                  {workItems.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name}
                    </option>
                  ))}
                </Select>
              </label>
              <label className="space-y-1 text-xs">
                <span className="text-muted-foreground">嚴重度</span>
                <Select name="severity" defaultValue="MEDIUM">
                  {Object.entries(defectSeverityMeta).map(([v, m]) => (
                    <option key={v} value={v}>
                      {m.label}
                    </option>
                  ))}
                </Select>
              </label>
              <label className="space-y-1 text-xs">
                <span className="text-muted-foreground">狀態</span>
                <Select name="status" defaultValue="OPEN">
                  {Object.entries(defectStatusMeta).map(([v, m]) => (
                    <option key={v} value={v}>
                      {m.label}
                    </option>
                  ))}
                </Select>
              </label>
              <label className="space-y-1 text-xs">
                <span className="text-muted-foreground">改善期限</span>
                <Input name="dueDate" type="date" />
              </label>
              <label className="space-y-1 text-xs">
                <span className="text-muted-foreground">負責</span>
                <Input name="assignedTo" placeholder="負責單位／人員" />
              </label>
              <label className="space-y-1 text-xs sm:col-span-2">
                <span className="text-muted-foreground">說明</span>
                <Input name="description" />
              </label>
            </CreateRecordDialog>
          </div>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              施工查驗紀錄 ({inspections.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>類別</TableHead>
                  <TableHead>查驗日期</TableHead>
                  <TableHead>部位 / 工項</TableHead>
                  <TableHead>查驗人</TableHead>
                  <TableHead>專案</TableHead>
                  <TableHead>結果</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {inspections.map((i) => (
                  <TableRow key={i.id}>
                    <TableCell>
                      <Badge variant={inspectionTypeMeta[i.type].variant}>
                        {inspectionTypeMeta[i.type].label}
                      </Badge>
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {formatDate(i.scheduledAt)}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {i.location ?? i.workItem?.name ?? "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {i.inspector ?? "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {i.project.name}
                    </TableCell>
                    <TableCell>
                      <Badge variant={inspectionResultMeta[i.result].variant}>
                        {inspectionResultMeta[i.result].label}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">缺失改善 ({defects.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>缺失</TableHead>
                  <TableHead>專案</TableHead>
                  <TableHead>負責</TableHead>
                  <TableHead>改善期限</TableHead>
                  <TableHead>嚴重度</TableHead>
                  <TableHead>狀態</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {defects.map((d) => (
                  <TableRow key={d.id}>
                    <TableCell className="font-medium">
                      {d.title}
                      {d.workItem ? (
                        <span className="ml-2 text-xs font-normal text-muted-foreground">
                          · {d.workItem.name}
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {d.project.name}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {d.assignedTo ?? "—"}
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {formatDate(d.dueDate)}
                    </TableCell>
                    <TableCell>
                      <Badge variant={defectSeverityMeta[d.severity].variant}>
                        {defectSeverityMeta[d.severity].label}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={defectStatusMeta[d.status].variant}>
                        {defectStatusMeta[d.status].label}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
