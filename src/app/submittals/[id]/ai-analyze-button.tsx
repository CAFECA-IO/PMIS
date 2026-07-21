"use client";

import { useState } from "react";
import { Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Markdown } from "@/components/markdown";
import { analyzeAttachmentAction } from "../actions";

export function AiAnalyzeButton({ attachmentId }: { attachmentId: string }) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setLoading(true);
    setError(null);
    setResult(null);
    const r = await analyzeAttachmentAction(attachmentId);
    setLoading(false);
    if (r.error) setError(r.error);
    else setResult(r.text ?? "");
  }

  return (
    <div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={run}
        disabled={loading}
      >
        <Sparkles className="size-4" />
        {loading ? "分析中…" : "AI 分析"}
      </Button>
      {error ? (
        <p className="mt-2 text-sm text-destructive">{error}</p>
      ) : null}
      {result ? (
        <div className="mt-3 rounded-lg border bg-muted/30 p-3">
          <Markdown content={result} />
        </div>
      ) : null}
    </div>
  );
}
