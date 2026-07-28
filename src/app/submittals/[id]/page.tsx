import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { ArrowLeft, FileText, CheckCircle2, XCircle, Clock } from "lucide-react";

import * as approval from "@/service/approval.service";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { approvalStatusMeta, stepDecisionMeta } from "@/constant/approval";
import { accountRoleMeta } from "@/constant/people";
import { formatDate } from "@/lib/utils";
import { signStepAction } from "../actions";
import { AiAnalyzeButton } from "./ai-analyze-button";

export const dynamic = "force-dynamic";

export default async function ApprovalDocumentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const data = await approval.getDocument(id);
  if (!data) notFound();
  const { document, accounts } = data;

  const meta = approvalStatusMeta[document.status];

  return (
    <>
      <PageHeader
        section="03 文件與協作"
        title={document.title}
        description={`申請者：${document.applicant.name} · 流程：${document.workflow.name}`}
        action={
          <div className="flex items-center gap-2">
            <Badge variant={meta.variant}>{meta.label}</Badge>
            <Button variant="outline" asChild>
              <Link href="/submittals">
                <ArrowLeft className="size-4" />
                返回
              </Link>
            </Button>
          </div>
        }
      />

      <div className="max-w-3xl space-y-6 p-8">
        {document.description ? (
          <p className="text-sm text-muted-foreground">{document.description}</p>
        ) : null}

        {/* 簽核關卡 */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">簽核流程</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {document.steps.map((step) => {
              const eligible = accounts.filter(
                (a) => a.positionId === step.positionId && a.status === "ACTIVE",
              );
              const isActive =
                document.status === "PENDING" &&
                step.order === document.currentStep &&
                step.decision === "PENDING";
              const dm = stepDecisionMeta[step.decision];

              return (
                <div
                  key={step.id}
                  className={
                    "rounded-lg border p-4 " +
                    (isActive ? "border-primary bg-primary/5" : "")
                  }
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <span className="flex size-6 items-center justify-center rounded-full bg-muted text-xs font-semibold">
                        {step.order + 1}
                      </span>
                      <span className="text-sm font-medium">
                        {step.position.name}
                      </span>
                      {step.decision === "APPROVED" ? (
                        <CheckCircle2 className="size-4 text-success" />
                      ) : step.decision === "REJECTED" ? (
                        <XCircle className="size-4 text-destructive" />
                      ) : (
                        <Clock className="size-4 text-muted-foreground" />
                      )}
                    </div>
                    <Badge variant={dm.variant}>{dm.label}</Badge>
                  </div>

                  {/* 可簽核者 */}
                  <div className="mt-2 text-xs text-muted-foreground">
                    可簽核者：
                    {eligible.length > 0
                      ? eligible.map((a) => a.name).join("、")
                      : "（查無符合職位人員）"}
                  </div>

                  {/* 已簽核者 */}
                  {step.signedBy ? (
                    <div className="mt-1 text-xs text-muted-foreground">
                      已由 <b>{step.signedBy.name}</b> 於{" "}
                      {formatDate(step.signedAt)} {dm.label}
                      {step.comment ? `：${step.comment}` : ""}
                    </div>
                  ) : null}

                  {/* 簽核操作（當前關卡） */}
                  {isActive ? (
                    <form
                      action={signStepAction}
                      className="mt-3 flex flex-wrap items-center gap-2 border-t pt-3"
                    >
                      <input type="hidden" name="stepId" value={step.id} />
                      <input
                        type="hidden"
                        name="documentId"
                        value={document.id}
                      />
                      <Select
                        name="signerId"
                        defaultValue=""
                        className="h-8 w-40"
                        required
                      >
                        <option value="" disabled>
                          選擇簽核者
                        </option>
                        {eligible.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.name}（{accountRoleMeta[a.role].label}）
                          </option>
                        ))}
                      </Select>
                      <Input
                        name="comment"
                        placeholder="意見（選填）"
                        className="h-8 flex-1"
                      />
                      <Button
                        type="submit"
                        name="decision"
                        value="APPROVED"
                        size="sm"
                        disabled={eligible.length === 0}
                      >
                        核准
                      </Button>
                      <Button
                        type="submit"
                        name="decision"
                        value="REJECTED"
                        size="sm"
                        variant="destructive"
                        disabled={eligible.length === 0}
                      >
                        駁回
                      </Button>
                    </form>
                  ) : null}
                </div>
              );
            })}
          </CardContent>
        </Card>

        {/* 參考文件 */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              參考文件 ({document.attachments.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {document.attachments.length === 0 ? (
              <p className="text-sm text-muted-foreground">無附件。</p>
            ) : (
              document.attachments.map((att) => {
                const url = `/api/files/${att.id}`;
                const isImage = att.mimeType.startsWith("image/");
                return (
                  <div key={att.id} className="rounded-lg border p-3">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-2">
                        <FileText className="size-4 shrink-0 text-muted-foreground" />
                        <span className="truncate text-sm font-medium">
                          {att.fileName}
                        </span>
                      </div>
                      <a
                        href={url}
                        target="_blank"
                        rel="noreferrer"
                        className="shrink-0 text-xs font-medium text-primary hover:underline"
                      >
                        開新視窗
                      </a>
                    </div>
                    {isImage ? (
                      <div className="relative h-96 w-full overflow-hidden rounded border">
                        <Image
                          src={url}
                          alt={att.fileName}
                          fill
                          unoptimized
                          className="object-contain"
                        />
                      </div>
                    ) : (
                      <object
                        data={url}
                        type={att.mimeType}
                        className="h-96 w-full rounded border"
                      >
                        <a href={url} className="text-primary hover:underline">
                          此瀏覽器無法內嵌預覽，點此開啟
                        </a>
                      </object>
                    )}
                    <div className="mt-3">
                      <AiAnalyzeButton attachmentId={att.id} />
                    </div>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
