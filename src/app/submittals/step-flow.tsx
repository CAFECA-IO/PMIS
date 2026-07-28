import { cn } from "@/lib/utils";
import type { ApprovalStatus, StepDecision } from "@/generated/prisma/enums";

// Info: (20260721 - Luphia) 以節點串顯示單一文件的簽核流程狀態（快速掌握進度）
export function StepFlow({
  steps,
  currentStep,
  status,
}: {
  steps: { order: number; decision: StepDecision }[];
  currentStep: number;
  status: ApprovalStatus;
}) {
  const sorted = [...steps].sort((a, b) => a.order - b.order);
  return (
    <div className="flex items-center">
      {sorted.map((s, i) => {
        const isCurrent = status === "PENDING" && s.order === currentStep;
        const color =
          s.decision === "APPROVED"
            ? "bg-success"
            : s.decision === "REJECTED"
              ? "bg-destructive"
              : isCurrent
                ? "bg-primary"
                : "bg-muted-foreground/30";
        return (
          <div key={s.order} className="flex items-center">
            {i > 0 ? <span className="h-px w-3 bg-border" /> : null}
            <span
              title={`關卡 ${s.order + 1}`}
              className={cn(
                "size-2.5 rounded-full",
                color,
                isCurrent && "ring-2 ring-primary/30",
              )}
            />
          </div>
        );
      })}
    </div>
  );
}
