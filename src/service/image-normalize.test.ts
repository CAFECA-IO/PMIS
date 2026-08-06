import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

import {
  MAX_CONVERT_BYTES,
  hasHeifExtension,
  isHeifMime,
  jpegFileName,
  normalizeImage,
  sniffHeif,
} from "./image-normalize";

/** 真實 libheif 產出的 64×64 HEIC（691 bytes），用於實際走完解碼路徑。 */
const FIXTURE = path.join(import.meta.dirname, "__fixtures__", "sample.heic");

/** 組出一個 ftyp box：size + "ftyp" + major + minor + compatible brands。 */
function ftyp(major: string, compatible: string[] = []): Uint8Array {
  const size = 16 + compatible.length * 4;
  const buf = new Uint8Array(size);
  buf[0] = (size >> 24) & 0xff;
  buf[1] = (size >> 16) & 0xff;
  buf[2] = (size >> 8) & 0xff;
  buf[3] = size & 0xff;
  const write = (s: string, at: number) => {
    for (let i = 0; i < 4; i += 1) buf[at + i] = s.charCodeAt(i);
  };
  write("ftyp", 4);
  write(major, 8);
  write("\0\0\0\0", 12);
  compatible.forEach((b, i) => write(b, 16 + i * 4));
  return buf;
}

// ── sniffHeif ───────────────────────────────────────────────

test("sniffHeif 認出主品牌為 heic", () => {
  assert.equal(sniffHeif(ftyp("heic")), true);
});

test("sniffHeif 認出相容品牌中的 heic（主品牌為泛用值）", () => {
  // 實務常見：major=mif1，heic 只出現在相容清單
  assert.equal(sniffHeif(ftyp("mif1", ["mif1", "heic"])), true);
});

test("sniffHeif 不誤判 AVIF（同為 ISO-BMFF 但編碼為 AV1）", () => {
  // mif1 是 HEIF 通用結構品牌，AVIF 也會帶；不可據此判定為 HEIC
  assert.equal(sniffHeif(ftyp("avif", ["avif", "mif1"])), false);
  assert.equal(sniffHeif(ftyp("mif1", ["mif1", "avif"])), false);
});

test("sniffHeif 認出真實 libheif 產出的 HEIC", async () => {
  const bytes = new Uint8Array(await readFile(FIXTURE));
  assert.equal(sniffHeif(bytes), true);
});

test("sniffHeif 不誤判 MP4 與 JPEG", () => {
  assert.equal(sniffHeif(ftyp("isom", ["isom", "mp42"])), false);
  assert.equal(sniffHeif(new Uint8Array([0xff, 0xd8, 0xff, 0xe0])), false);
});

test("sniffHeif 對過短與畸形輸入回 false，不拋錯", () => {
  assert.equal(sniffHeif(new Uint8Array(0)), false);
  assert.equal(sniffHeif(new Uint8Array([0, 1, 2])), false);
  assert.equal(sniffHeif(new Uint8Array(11)), false);
  // box size 宣告超過實際長度時，不可信任相容品牌掃描
  const bad = ftyp("isom", ["heic"]);
  bad[3] = 0xff;
  assert.equal(sniffHeif(bad), false);
});

// ── 輔助判定 ────────────────────────────────────────────────

test("isHeifMime 認出 heic／heif 及 sequence 變體", () => {
  assert.equal(isHeifMime("image/heic"), true);
  assert.equal(isHeifMime("IMAGE/HEIF"), true);
  assert.equal(isHeifMime("image/heic-sequence"), true);
  assert.equal(isHeifMime("image/jpeg"), false);
  assert.equal(isHeifMime(""), false);
  assert.equal(isHeifMime(undefined), false);
});

test("hasHeifExtension 忽略大小寫", () => {
  assert.equal(hasHeifExtension("IMG_1234.HEIC"), true);
  assert.equal(hasHeifExtension("a.heif"), true);
  assert.equal(hasHeifExtension("a.jpg"), false);
  assert.equal(hasHeifExtension(undefined), false);
});

test("jpegFileName 換掉副檔名而非附加", () => {
  assert.equal(jpegFileName("IMG_1234.HEIC"), "IMG_1234.jpg");
  assert.equal(jpegFileName("工地照片.heif"), "工地照片.jpg");
  assert.equal(jpegFileName("無副檔名"), "無副檔名.jpg");
  assert.equal(jpegFileName("  "), "photo.jpg");
});

// ── normalizeImage ──────────────────────────────────────────

test("normalizeImage 非 HEIC 原樣通過且不標記轉檔", async () => {
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
  const r = await normalizeImage(jpeg, "image/jpeg", "a.jpg");
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.converted, false);
  assert.equal(r.mimeType, "image/jpeg");
  assert.equal(r.fileName, "a.jpg");
  assert.deepEqual(r.bytes, jpeg);
});

test("normalizeImage 對誤標為 heic 的非 HEIC 內容原樣交還（不進解碼器）", async () => {
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4, 5, 6, 7, 8]);
  const r = await normalizeImage(png, "image/heic", "mislabeled.heic");
  assert.equal(r.ok, true);
  if (!r.ok) return;
  // 交還原始 MIME 與位元組，由既有白名單決定收或拒
  assert.equal(r.converted, false);
  assert.deepEqual(r.bytes, png);
});

test("normalizeImage 拒收超過上限的輸入", async () => {
  // 前 12 bytes 為合法 heic ftyp，其後填充至超過上限
  const head = ftyp("heic");
  const big = new Uint8Array(MAX_CONVERT_BYTES + 1);
  big.set(head, 0);
  const r = await normalizeImage(big, "image/heic", "big.heic");
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.equal(r.reason, "too_large");
});

test("normalizeImage 對 magic 正確但內容損毀者回 decode_failed 而非拋錯", async () => {
  const broken = new Uint8Array(64);
  broken.set(ftyp("heic"), 0);
  const r = await normalizeImage(broken, "image/heic", "broken.heic");
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.equal(r.reason, "decode_failed");
});

test("normalizeImage 把真實 HEIC 轉為可解析的 JPEG", async () => {
  const bytes = new Uint8Array(await readFile(FIXTURE));
  assert.equal(sniffHeif(bytes), true, "fixture 應為 HEIC");

  const r = await normalizeImage(bytes, "image/heic", "IMG_0001.HEIC");
  assert.equal(r.ok, true);
  if (!r.ok) return;

  assert.equal(r.converted, true);
  assert.equal(r.mimeType, "image/jpeg");
  assert.equal(r.fileName, "IMG_0001.jpg");
  // JPEG SOI 標記
  assert.equal(r.bytes[0], 0xff);
  assert.equal(r.bytes[1], 0xd8);
  // EOI 標記，確認輸出完整而非截斷
  assert.equal(r.bytes[r.bytes.byteLength - 2], 0xff);
  assert.equal(r.bytes[r.bytes.byteLength - 1], 0xd9);
  assert.ok(r.bytes.byteLength > 500, "轉出的 JPEG 不應是空殼");
});
