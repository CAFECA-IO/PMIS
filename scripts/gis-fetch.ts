/**
 * PMIS-12 GIS 向量圖資匯入工具（離線批次）。
 *
 * 將政府開放圖資（GeoJSON，或 WFS 之 GeoJSON 輸出）下載、正規化並存為 seed 檔，
 * 供「周邊風險摘要」以本地空間查詢使用（見 src/service/gis.service.ts）。
 *
 * 用法：
 *   tsx scripts/gis-fetch.ts \
 *     --url "https://<來源>/wfs?...&outputFormat=application/json" \
 *     --out soil_liquefaction_2024.geojson \
 *     --layer gl_soil --category RISK --title "土壤液化潛勢" --source NLSC --year 2024
 *
 *   # 或僅就地登錄既有檔案（不下載）：
 *   tsx scripts/gis-fetch.ts --out my_layer.geojson --layer gl_x --category RISK ... --register-only
 *
 * 完成後會：
 *   1. 於 prisma/seeds/gis/ 寫入 GeoJSON（WGS84 / EPSG:4326）。
 *   2. 印出可貼入 prisma/seed.ts 或直接執行的 SQL，將圖層登錄至 GisLayerSeed。
 *
 * 注意：座標系須為 EPSG:4326（[lng, lat]）。若來源為 TWD97（EPSG:3826）等，
 * 請於來源服務要求 outputFormat 並指定 srsName=EPSG:4326，或另行轉換後再匯入。
 */

import fs from "node:fs";
import path from "node:path";

type Args = Record<string, string | boolean>;

function parseArgs(argv: string[]): Args {
  const out: Args = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith("--")) {
        out[key] = next;
        i++;
      } else {
        out[key] = true;
      }
    }
  }
  return out;
}

const SEED_DIR = path.join(process.cwd(), "prisma", "seeds", "gis");

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || (!args.url && !args["register-only"])) {
    console.log(
      "用法見檔頭註解。必要參數：--out <檔名> --layer <id> --category <RISK|FACILITY|STATS|...> --title <名稱> --source <NLSC|TGOS|SEGIS> --year <年份>",
    );
    process.exit(args.help ? 0 : 1);
  }

  const out = String(args.out ?? "");
  if (!out.endsWith(".geojson")) {
    console.error("--out 必須是 .geojson 檔名");
    process.exit(1);
  }
  fs.mkdirSync(SEED_DIR, { recursive: true });
  const target = path.join(SEED_DIR, out);

  if (!args["register-only"]) {
    const url = String(args.url);
    console.log(`↓ 下載：${url}`);
    const res = await fetch(url);
    if (!res.ok) {
      console.error(`下載失敗：HTTP ${res.status}`);
      process.exit(1);
    }
    const json = (await res.json()) as { type?: string; features?: unknown[] };
    if (json.type !== "FeatureCollection" || !Array.isArray(json.features)) {
      console.error("來源不是 GeoJSON FeatureCollection");
      process.exit(1);
    }
    fs.writeFileSync(target, JSON.stringify(json, null, 2), "utf8");
    console.log(`✔ 已寫入 ${target}（${json.features.length} 筆 features）`);
  } else if (!fs.existsSync(target)) {
    console.error(`找不到既有檔案：${target}`);
    process.exit(1);
  }

  const relPath = path.relative(process.cwd(), target).split(path.sep).join("/");
  const layer = String(args.layer ?? "gl_custom");
  const category = String(args.category ?? "RISK");
  const title = String(args.title ?? out);
  const source = String(args.source ?? "NLSC");
  const year = Number(args.year ?? new Date().getFullYear());

  console.log("\n── 登錄 SQL（可執行或改寫進 prisma/seed.ts）──");
  console.log(
    `INSERT INTO "GisLayerSeed" ("id","category","title","source","year","srs","filePath","active")\n` +
      `VALUES ('${layer}','${category}','${title}','${source}',${year},'EPSG:4326','${relPath}',1)\n` +
      `ON CONFLICT("id") DO UPDATE SET "filePath"=excluded."filePath","year"=excluded."year";`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
