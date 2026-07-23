"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { Sparkles, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ehsTypeOptions, ehsResultOptions } from "@/constant/pmis";

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      const s = String(r.result);
      resolve(s.slice(s.indexOf(",") + 1));
    };
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

const today = () => new Date().toISOString().slice(0, 10);

/**
 * 環安衛稽核欄位（供 CreateRecordDialog 作為 children）。
 * 保留費思 AI 照片判讀：上傳照片可自動填入類別/結果/缺失，照片一併存為附件。
 * 不含 <form>／送出鈕（由對話框提供）。
 */
export function EhsDialogFields({
  projects,
}: {
  projects: { id: string; name: string }[];
}) {
  const [type, setType] = useState("SAFETY");
  const [result, setResult] = useState("PENDING");
  const [findings, setFindings] = useState("");
  const [preview, setPreview] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [aiNote, setAiNote] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function analyze() {
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setAiNote("請先選擇或拍攝照片。");
      return;
    }
    setAnalyzing(true);
    setAiNote(null);
    try {
      const data = await fileToBase64(file);
      const res = await fetch("/api/ehs/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mimeType: file.type, data }),
      });
      const json = (await res.json()) as {
        fields?: { type: string; result: string; findings: string };
        error?: string;
      };
      if (!res.ok || !json.fields) throw new Error(json.error ?? "判讀失敗");
      setType(json.fields.type);
      setResult(json.fields.result);
      setFindings(json.fields.findings);
      setAiNote("已由費思判讀並填入，請確認後儲存。");
    } catch (e) {
      setAiNote(e instanceof Error ? e.message : "判讀失敗，請手動輸入。");
    } finally {
      setAnalyzing(false);
    }
  }

  return (
    <>
      {/* 照片判讀（選填）：費思填入欄位，照片一併存為附件 */}
      <div className="space-y-3 rounded-lg border border-dashed p-3 sm:col-span-2">
        <div className="flex items-center gap-1.5 text-sm font-medium">
          <Sparkles className="size-4 text-primary" />
          照片判讀（選填）
        </div>
        <p className="text-xs text-muted-foreground">
          上傳或拍攝工地照片，費思可自動填入類別、結果與缺失情形；也可略過直接手動輸入。照片會一併存為此稽核的附件。
        </p>
        {preview ? (
          <div className="relative h-40 w-full overflow-hidden rounded border">
            <Image
              src={preview}
              alt="預覽"
              fill
              unoptimized
              className="object-contain"
            />
          </div>
        ) : null}
        <input
          ref={fileRef}
          type="file"
          name="photo"
          accept="image/*"
          capture="environment"
          className="w-full text-xs file:mr-2 file:rounded file:border-0 file:bg-secondary file:px-2 file:py-1 file:text-xs"
          onChange={(e) => {
            const f = e.target.files?.[0];
            setPreview(f ? URL.createObjectURL(f) : null);
          }}
        />
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={analyze}
            disabled={analyzing}
          >
            {analyzing ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Sparkles className="size-4" />
            )}
            {analyzing ? "判讀中…" : "AI 判讀"}
          </Button>
          {aiNote ? (
            <span className="text-xs text-muted-foreground">{aiNote}</span>
          ) : null}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="ehs-project">專案</Label>
        <Select id="ehs-project" name="projectId" defaultValue={projects[0]?.id}>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="ehs-type">類別</Label>
        <Select
          id="ehs-type"
          name="type"
          value={type}
          onChange={(e) => setType(e.target.value)}
        >
          {ehsTypeOptions.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="ehs-date">稽核日期</Label>
        <Input id="ehs-date" name="auditedAt" type="date" defaultValue={today()} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="ehs-loc">地點</Label>
        <Input id="ehs-loc" name="location" placeholder="如 B1 開挖區" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="ehs-result">結果</Label>
        <Select
          id="ehs-result"
          name="result"
          value={result}
          onChange={(e) => setResult(e.target.value)}
        >
          {ehsResultOptions.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="ehs-due">改善期限</Label>
        <Input id="ehs-due" name="dueDate" type="date" />
      </div>
      <div className="space-y-1.5 sm:col-span-2">
        <Label htmlFor="ehs-find">缺失情形</Label>
        <Textarea
          id="ehs-find"
          name="findings"
          rows={3}
          value={findings}
          onChange={(e) => setFindings(e.target.value)}
          placeholder="描述缺失或稽核情形…"
        />
      </div>
    </>
  );
}
