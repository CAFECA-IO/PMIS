"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, MapPin } from "lucide-react";

import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { searchCities } from "@/constant/cities";

/**
 * Info: (20260721 - Luphia)
 * 可搜尋的縣市選擇器 — 以下拉提供台灣縣市，可依名稱或 ISO 代碼過濾，並仍允許自由輸入（如追加行政區）。
 */
export function CityCombobox({
  id,
  name,
  defaultValue = "",
  placeholder,
}: {
  id?: string;
  name: string;
  defaultValue?: string;
  placeholder?: string;
}) {
  const [value, setValue] = useState(defaultValue);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);

  const matches = useMemo(() => searchCities(value), [value]);

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  function pick(cityName: string) {
    setValue(cityName);
    setOpen(false);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!open) setOpen(true);
      setActive((a) => Math.min(a + 1, matches.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter") {
      if (open && matches[active]) {
        e.preventDefault();
        pick(matches[active].name);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div ref={wrapRef} className="relative">
      <Input
        id={id}
        name={name}
        value={value}
        autoComplete="off"
        placeholder={placeholder}
        className="pr-8"
        onChange={(e) => {
          setValue(e.target.value);
          setActive(0);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
      />
      <ChevronDown className="pointer-events-none absolute right-2 top-1/2 size-4 -translate-y-1/2 opacity-50" />

      {open && matches.length > 0 ? (
        <ul className="absolute z-50 mt-1 max-h-60 w-full overflow-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-lg">
          {matches.map((c, i) => (
            <li key={c.code}>
              <button
                type="button"
                onClick={() => pick(c.name)}
                onMouseEnter={() => setActive(i)}
                className={cn(
                  "flex w-full items-center justify-between gap-2 rounded px-2 py-1.5 text-left text-sm",
                  i === active
                    ? "bg-accent text-accent-foreground"
                    : "text-foreground",
                )}
              >
                <span className="flex items-center gap-2">
                  <MapPin className="size-3.5 text-muted-foreground" />
                  {c.name}
                </span>
                <span className="font-mono text-xs text-muted-foreground">
                  {c.code}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
