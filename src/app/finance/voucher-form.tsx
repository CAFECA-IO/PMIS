"use client";

import { useRef, useState } from "react";
import { Upload, Sparkles, Plus, Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { financeCategoryOptions } from "@/constant/pmis";
import { createVoucherAction } from "./actions";

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

export function VoucherForm({ projectId }: { projectId: string }) {
  const [date, setDate] = useState(today);
  const [direction, setDirection] = useState("EXPENSE");
  const [category, setCategory] = useState("");
  const [amount, setAmount] = useState("");
  const [counterparty, setCounterparty] = useState("");
  const [summary, setSummary] = useState("");
  const [cashFlow, setCashFlow] = useState(true);
  const [aiExtracted, setAiExtracted] = useState(false);

  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File | null | undefined) {
    if (!file) return;
    setBusy(true);
    setNote(null);
    try {
      const data = await fileToBase64(file);
      const res = await fetch("/api/finance/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mimeType: file.type, data }),
      });
      const json = (await res.json()) as {
        fields?: {
          date: string;
          direction: string;
          category: string;
          amount: number;
          counterparty: string;
          summary: string;
        };
        error?: string;
      };
      if (!res.ok || !json.fields) throw new Error(json.error ?? "判讀失敗");
      const f = json.fields;
      if (f.date) setDate(f.date);
      setDirection(f.direction === "INCOME" ? "INCOME" : "EXPENSE");
      if (f.category) setCategory(f.category);
      if (f.amount) setAmount(String(f.amount));
      if (f.counterparty) setCounterparty(f.counterparty);
      if (f.summary) setSummary(f.summary);
      setAiExtracted(true);
      setNote("已由費思擷取，請確認後儲存。");
    } catch (e) {
      setNote(e instanceof Error ? e.message : "判讀失敗，請手動輸入。");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Info: (20260721 - Luphia) 上傳憑證 → AI 轉傳票 */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          if (!busy) setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (!busy) handleFile(e.dataTransfer.files?.[0]);
        }}
        className={cn(
          "flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-6 text-center transition-colors",
          dragOver ? "border-primary bg-primary/5" : "border-input",
        )}
      >
        {busy ? (
          <Loader2 className="size-6 animate-spin text-primary" />
        ) : (
          <Sparkles className="size-6 text-primary" />
        )}
        <div className="text-sm font-medium">上傳憑證，費思自動轉換成會計傳票</div>
        <div className="text-xs text-muted-foreground">
          拖曳發票／收據／請款單至此，或
        </div>
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          onChange={(e) => {
            handleFile(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
        >
          <Upload className="size-4" />
          選擇檔案
        </Button>
        {note ? (
          <p className="text-xs text-muted-foreground">{note}</p>
        ) : null}
      </div>

      {/* Info: (20260721 - Luphia) 傳票表單（可手動或於擷取後確認） */}
      <form
        action={createVoucherAction}
        className="grid grid-cols-1 gap-4 rounded-lg border bg-muted/30 p-4 sm:grid-cols-2"
      >
        <input type="hidden" name="projectId" value={projectId} />
        <input type="hidden" name="aiExtracted" value={String(aiExtracted)} />
        <input type="hidden" name="cashFlow" value={cashFlow ? "true" : "false"} />

        <div className="space-y-1.5">
          <Label htmlFor="v-date">日期</Label>
          <Input id="v-date" name="date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="v-dir">方向</Label>
          <Select id="v-dir" name="direction" value={direction} onChange={(e) => setDirection(e.target.value)}>
            <option value="EXPENSE">支出</option>
            <option value="INCOME">收入</option>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="v-cat">科目／類別</Label>
          <Input
            id="v-cat"
            name="category"
            list="finance-categories"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder="如 材料、人工、工程估驗款"
          />
          <datalist id="finance-categories">
            {financeCategoryOptions.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="v-amt">金額 (TWD)</Label>
          <Input id="v-amt" name="amount" type="number" step="any" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="v-cp">對象</Label>
          <Input id="v-cp" name="counterparty" value={counterparty} onChange={(e) => setCounterparty(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="v-no">傳票號</Label>
          <Input id="v-no" name="voucherNo" placeholder="自動或自訂" />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="v-sum">摘要</Label>
          <Input id="v-sum" name="summary" value={summary} onChange={(e) => setSummary(e.target.value)} />
        </div>
        <label className="flex items-center gap-2 text-sm sm:col-span-2">
          <input
            type="checkbox"
            checked={cashFlow}
            onChange={(e) => setCashFlow(e.target.checked)}
            className="size-4 rounded border-input"
          />
          影響現金水位（實際收付現）
        </label>
        <div className="sm:col-span-2">
          <Button type="submit" variant="secondary" disabled={!category || !amount}>
            <Plus className="size-4" />
            建立傳票
          </Button>
        </div>
      </form>
    </div>
  );
}
