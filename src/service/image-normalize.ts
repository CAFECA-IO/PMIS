/**
 * HEIC／HEIF → JPEG 影像正規化。
 *
 * 為何需要：iPhone 相機預設輸出 HEIC，而儲存區白名單僅收 pdf/png/jpg，
 * 監造在工地以手機拍照後直接上傳會被拒收，且錯誤訊息無法指引使用者。
 * HEIC 亦無法在多數瀏覽器內嵌預覽，故選擇「伺服器端轉為 JPEG 存檔」，
 * 而非單純把 HEIC 加進白名單原樣保存（存了看不到）。
 *
 * 為何以 magic bytes 判定而非 MIME：瀏覽器與作業系統對 .heic 回報的
 * MIME 並不一致（image/heic、image/heif、空字串、application/octet-stream
 * 均曾出現），單看 file.type 會漏判。ISO-BMFF 的 ftyp box 是檔案本身的
 * 事實，不受回報端影響，因此以它為準、MIME 與副檔名僅作輔助。
 *
 * 相依說明：解碼 HEIC 需 HEVC 解碼器，無法以手寫守衛替代
 * （本專案其他解析器刻意手寫以避免新增相依，此處是必要的例外）。
 * heic-convert 為純 JS（libheif asm.js），無原生模組，部署環境不需編譯。
 * 以動態 import 載入 —— 未遇到 HEIC 時不付這份載入成本。
 *
 * 效能實測（本機，libheif asm.js）：
 *   640×480   HEIC 46 KB   → JPEG 22 KB   約 0.34 秒
 *   4032×3024 HEIC 1.67 MB → JPEG 0.98 MB 約 2.75 秒（iPhone 12MP 量級）
 * 解碼為 CPU-bound 且會佔用 event loop，故設有輸入大小上限（見
 * MAX_CONVERT_BYTES）。批次上傳數十張時應逐張處理並考慮前端顯示進度。
 */

/** 僅供伺服器端使用（動態載入 heic-convert）。 */

/**
 * 可解碼的 HEIF 品牌（HEVC 編碼的影像／影像序列）。
 *
 * 刻意**不含** `mif1`／`msf1`：這兩個是 HEIF 的通用結構品牌，
 * AVIF 也會把 `mif1` 寫進相容品牌清單。若納入，AVIF 會被誤判為 HEIC
 * 而走進轉檔路徑並失敗——而 AVIF 本可直接存檔。
 * 同理不含 `avif`／`avis`（AV1 編碼，heic-convert 無法解碼）。
 */
const HEIF_BRANDS = new Set([
  "heic",
  "heix",
  "heim",
  "heis",
  "hevc",
  "hevx",
  "hevm",
  "hevs",
  "heif",
]);

/** 轉檔輸出品質。0.85 在檔案大小與可辨識度之間取平衡。 */
const JPEG_QUALITY = 0.85;

/**
 * 允許轉檔的輸入上限（位元組）。
 *
 * 解碼耗時與像素數成正比且佔用 event loop，需要上限以免單一大檔
 * 拖垮同時間的其他請求。40 MB 足以容納一般手機照片（12MP HEIC 約 1–3 MB），
 * 同時擋掉異常大檔。
 */
export const MAX_CONVERT_BYTES = 40 * 1024 * 1024;

/** 轉檔後的 MIME 與副檔名。 */
export const CONVERTED_MIME = "image/jpeg";
export const CONVERTED_EXT = "jpg";

/** HEIC／HEIF 的 MIME（供白名單放行；實際判定仍以 magic bytes 為準）。 */
export const HEIF_MIME_TYPES = [
  "image/heic",
  "image/heif",
  "image/heic-sequence",
  "image/heif-sequence",
];

/** HEIC／HEIF 的副檔名（供 accept 屬性與 MIME 缺失時的輔助判定）。 */
export const HEIF_EXTENSIONS = ["heic", "heif"];

function brandAt(bytes: Uint8Array, offset: number): string {
  let s = "";
  for (let i = offset; i < offset + 4; i += 1) {
    s += String.fromCharCode(bytes[i]);
  }
  return s.toLowerCase();
}

/**
 * 以 ISO-BMFF 的 ftyp box 判定是否為 HEIF 家族影像。
 *
 * 結構：[4 bytes box size]["ftyp"][4 bytes major brand][4 bytes minor version]
 *       [compatible brands…（每 4 bytes 一個，至 box 結尾）]
 *
 * 主品牌可能是泛用值（如 mif1），真正的 heic 只出現在相容品牌清單中，
 * 故兩者都要檢查。永不拋錯：輸入過短或 box size 異常一律回 false。
 */
export function sniffHeif(bytes: Uint8Array): boolean {
  if (bytes.byteLength < 12) return false;
  if (brandAt(bytes, 4) !== "ftyp") return false;

  if (HEIF_BRANDS.has(brandAt(bytes, 8))) return true;

  // box size 為大端 32 位元；異常值時僅檢查主品牌（上方已做）
  const boxSize =
    ((bytes[0] << 24) | (bytes[1] << 16) | (bytes[2] << 8) | bytes[3]) >>> 0;
  if (boxSize < 16 || boxSize > bytes.byteLength) return false;

  // 相容品牌自 offset 16 起，每 4 bytes 一個
  for (let off = 16; off + 4 <= boxSize; off += 4) {
    if (HEIF_BRANDS.has(brandAt(bytes, off))) return true;
  }
  return false;
}

/** 副檔名是否為 heic／heif（MIME 缺失時的輔助線索，非判定依據）。 */
export function hasHeifExtension(fileName: string | undefined | null): boolean {
  const name = fileName?.trim().toLowerCase();
  if (!name) return false;
  return HEIF_EXTENSIONS.some((ext) => name.endsWith(`.${ext}`));
}

/** MIME 是否宣告為 HEIF 家族。 */
export function isHeifMime(mimeType: string | undefined | null): boolean {
  const m = mimeType?.trim().toLowerCase();
  if (!m) return false;
  return HEIF_MIME_TYPES.includes(m);
}

/** 把 .heic／.heif 副檔名換成 .jpg；無該副檔名者附加。 */
export function jpegFileName(fileName: string): string {
  const trimmed = fileName.trim() || "photo";
  const lower = trimmed.toLowerCase();
  for (const ext of HEIF_EXTENSIONS) {
    if (lower.endsWith(`.${ext}`)) {
      return `${trimmed.slice(0, trimmed.length - ext.length - 1)}.${CONVERTED_EXT}`;
    }
  }
  return `${trimmed}.${CONVERTED_EXT}`;
}

export type NormalizeResult =
  | {
      ok: true;
      bytes: Uint8Array;
      mimeType: string;
      fileName: string;
      /** 是否實際做了轉檔（非 HEIC 輸入為 false，原樣通過）。 */
      converted: boolean;
    }
  | {
      ok: false;
      /** 失敗原因代號，供呼叫端決定訊息；不直接外洩解碼器訊息。 */
      reason: "too_large" | "decode_failed";
    };

/**
 * 若輸入為 HEIC／HEIF 則轉為 JPEG，否則原樣回傳。
 *
 * 契約：永不拋錯。解碼失敗回 { ok: false }，由呼叫端決定如何拒收——
 * 上傳流程不應因單一檔案格式異常而 500。
 */
export async function normalizeImage(
  bytes: Uint8Array,
  mimeType: string,
  fileName: string,
): Promise<NormalizeResult> {
  const looksHeif =
    sniffHeif(bytes) || isHeifMime(mimeType) || hasHeifExtension(fileName);

  // 非 HEIF：原樣通過，不載入解碼器
  if (!looksHeif) {
    return { ok: true, bytes, mimeType, fileName, converted: false };
  }

  // 宣告為 HEIF 但內容不是（副檔名或 MIME 誤標）：交還原始位元組，
  // 由既有白名單判斷。硬送進解碼器只會得到無意義的失敗。
  if (!sniffHeif(bytes)) {
    return { ok: true, bytes, mimeType, fileName, converted: false };
  }

  if (bytes.byteLength > MAX_CONVERT_BYTES) {
    return { ok: false, reason: "too_large" };
  }

  try {
    const { default: convert } = await import("heic-convert");
    const out = await convert({
      buffer: bytes,
      format: "JPEG",
      quality: JPEG_QUALITY,
    });
    if (out.byteLength === 0) return { ok: false, reason: "decode_failed" };

    return {
      ok: true,
      bytes: out,
      mimeType: CONVERTED_MIME,
      fileName: jpegFileName(fileName),
      converted: true,
    };
  } catch {
    // libheif 會把解析細節印到 console；此處僅回代號，不轉述其訊息
    return { ok: false, reason: "decode_failed" };
  }
}
