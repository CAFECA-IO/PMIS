import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { mkdtempSync } from "node:fs";
import path from "node:path";
import os from "node:os";

/**
 * STORAGE_DIR 於模組載入時讀取，故必須在 import 之前設定。
 * 因此本檔以動態 import 取得 storage（不可用靜態 import：會被提升到最前）。
 * 亦刻意不用 top-level await —— 專案未設 "type": "module"，
 * tsx 會轉為 CJS，top-level await 在該格式下無法編譯。
 */
const STORE = mkdtempSync(path.join(os.tmpdir(), "pmis-storage-test-"));
process.env.STORAGE_DIR = STORE;

const FIXTURE = path.join(import.meta.dirname, "__fixtures__", "sample.heic");

const loadStorage = () => import("./storage.service");

test("saveFile 把 HEIC 轉為 JPEG 存檔，並改寫 MIME 與副檔名", async () => {
  const storage = await loadStorage();
  const bytes = await readFile(FIXTURE);
  // MIME 刻意留空，重現手機／瀏覽器回報不一致的情形
  const file = new File([bytes], "IMG_0042.HEIC", { type: "" });

  const saved = await storage.saveFile(file);
  assert.ok(saved, "應成功存檔");
  assert.equal(saved.mimeType, "image/jpeg");
  assert.equal(saved.fileName, "IMG_0042.jpg");
  assert.ok(saved.storedName.endsWith(".jpg"), "storedName 應為 .jpg");

  // 實際落地的位元組必須是 JPEG，且 size 與檔案一致
  const written = await readFile(path.join(STORE, saved.storedName));
  assert.equal(written[0], 0xff);
  assert.equal(written[1], 0xd8);
  assert.equal(saved.size, written.byteLength);
});

test("saveFile 不改動既有格式（jpg 位元組原樣存檔）", async () => {
  const storage = await loadStorage();
  const jpeg = Buffer.from([
    0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0xff, 0xd9,
  ]);
  const file = new File([jpeg], "plain.jpg", { type: "image/jpeg" });

  const saved = await storage.saveFile(file);
  assert.ok(saved);
  assert.equal(saved.mimeType, "image/jpeg");
  assert.equal(saved.fileName, "plain.jpg");
  assert.equal(saved.size, jpeg.byteLength, "未轉檔者位元組數不應變動");
});

test("saveFile 拒收非白名單格式與空檔", async () => {
  const storage = await loadStorage();
  assert.equal(
    await storage.saveFile(
      new File([new Uint8Array([1, 2, 3])], "evil.html", {
        type: "text/html",
      }),
    ),
    null,
  );
  assert.equal(
    await storage.saveFile(new File([], "empty.jpg", { type: "image/jpeg" })),
    null,
  );
});

test("saveFile 對聲稱 heic 但內容損毀者回 null，不拋錯", async () => {
  const storage = await loadStorage();
  const broken = new Uint8Array(64);
  // 合法的 heic magic，但沒有 meta box
  const write = (s: string, at: number) => {
    for (let i = 0; i < 4; i += 1) broken[at + i] = s.charCodeAt(i);
  };
  broken[3] = 0x1c;
  write("ftyp", 4);
  write("heic", 8);
  const file = new File([broken], "broken.heic", { type: "image/heic" });
  assert.equal(await storage.saveFile(file), null);
});

test("isAllowed 以檔名補判 MIME 缺失或誤標的 HEIC", async () => {
  const storage = await loadStorage();
  assert.equal(storage.isAllowed("", "IMG.HEIC"), true);
  assert.equal(storage.isAllowed("application/octet-stream", "a.heic"), true);
  assert.equal(storage.isAllowed("image/heic"), true);
  // 既有格式行為不變
  assert.equal(storage.isAllowed("image/jpeg"), true);
  assert.equal(storage.isAllowed("application/pdf"), true);
  // 不因帶了檔名就放行危險型別
  assert.equal(storage.isAllowed("text/html", "evil.html"), false);
  assert.equal(storage.isAllowed(""), false);
});

test("ALLOWED_ACCEPT 含 heic／heif，選檔器才選得到手機照片", async () => {
  const storage = await loadStorage();
  assert.ok(storage.ALLOWED_ACCEPT.includes(".heic"));
  assert.ok(storage.ALLOWED_ACCEPT.includes(".heif"));
  // 既有型別不可因此遺漏
  assert.ok(storage.ALLOWED_ACCEPT.includes(".pdf"));
  assert.ok(storage.ALLOWED_ACCEPT.includes(".png"));
  assert.ok(storage.ALLOWED_ACCEPT.includes(".jpg"));
});
