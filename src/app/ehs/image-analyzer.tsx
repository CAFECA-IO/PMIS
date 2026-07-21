"use client";

import { useState, type ChangeEvent } from "react";
import Image from "next/image";
import { Sparkles, ImageUp } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Markdown } from "@/components/markdown";
import { analyzeImageAction } from "./actions";

export function ImageAnalyzer() {
  const [preview, setPreview] = useState<string | null>(null);
  const [base64, setBase64] = useState<string | null>(null);
  const [mimeType, setMimeType] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      setPreview(dataUrl);
      setBase64(dataUrl.split(",")[1] ?? null);
      setMimeType(file.type);
      setResult(null);
      setError(null);
    };
    reader.readAsDataURL(file);
  }

  async function analyze() {
    if (!base64 || !mimeType) return;
    setLoading(true);
    setError(null);
    setResult(null);
    const r = await analyzeImageAction(base64, mimeType);
    setLoading(false);
    if (r.error) setError(r.error);
    else setResult(r.text ?? "");
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium hover:bg-accent">
          <ImageUp className="size-4" />
          選擇工地照片
          <input
            type="file"
            accept="image/png,image/jpeg"
            className="hidden"
            onChange={onFile}
          />
        </label>
        <Button type="button" onClick={analyze} disabled={!base64 || loading}>
          <Sparkles className="size-4" />
          {loading ? "判讀中…" : "AI 判讀"}
        </Button>
      </div>

      {preview ? (
        <div className="relative h-72 w-full overflow-hidden rounded-lg border">
          <Image src={preview} alt="預覽" fill unoptimized className="object-contain" />
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          上傳工地照片，AI 會判讀工安與品質疑慮並提供改善建議。
        </p>
      )}

      {error ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      {loading ? (
        <div className="flex items-center gap-1 text-sm text-muted-foreground">
          <span className="size-2 animate-bounce rounded-full bg-muted-foreground/60" />
          <span className="size-2 animate-bounce rounded-full bg-muted-foreground/60" style={{ animationDelay: "150ms" }} />
          <span className="size-2 animate-bounce rounded-full bg-muted-foreground/60" style={{ animationDelay: "300ms" }} />
        </div>
      ) : null}

      {result ? (
        <div className="rounded-lg border bg-muted/30 p-4">
          <Markdown content={result} />
        </div>
      ) : null}
    </div>
  );
}
