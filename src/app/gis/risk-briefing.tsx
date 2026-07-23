"use client";

import { useState } from "react";
import { Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { interpretRiskAction } from "./actions";

export function RiskBriefing({ projectId }: { projectId: string }) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ text: string; ai: boolean } | null>(
    null,
  );

  async function run() {
    setLoading(true);
    const res = await interpretRiskAction(projectId);
    setResult(res);
    setLoading(false);
  }

  return (
    <div className="space-y-2">
      <Button size="sm" variant="outline" onClick={run} disabled={loading}>
        <Sparkles className="size-4" />
        {loading ? "費思判讀中…" : "費思 AI 工地簡報"}
      </Button>
      {result && (
        <div className="rounded-md border bg-muted/40 p-3 text-sm">
          <p className="mb-1 text-xs text-muted-foreground">
            {result.ai ? "費思 AI 解讀" : "規則式摘要（AI 未啟用）"}
          </p>
          <p className="whitespace-pre-wrap leading-relaxed">{result.text}</p>
        </div>
      )}
    </div>
  );
}
