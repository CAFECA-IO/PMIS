# GIS 向量 seed（PMIS-12）

此資料夾放置**依類別 × 年份**下載的政府圖資向量檔（GeoJSON, WGS84 / EPSG:4326），
供「周邊風險摘要」以本地空間查詢（point-in-polygon / 最近距離）計算，
不需即時打外部 API。

`GisLayerSeed.filePath` 指向本資料夾下的檔案（相對於專案根目錄）。

> ⚠ 本資料夾目前的 `*_demo.geojson` 為**示範資料**（涵蓋捷運藍線工地周邊），
> 僅供功能展示。正式導入時，請以下列來源的實際圖資覆蓋：
> - 土壤液化潛勢：內政部國土測繪中心 / 經濟部地質調查及礦業管理中心
> - 地質敏感區（山崩地滑、活動斷層）：地質調查及礦業管理中心
> - 各級學校範圍、避難收容所、消防栓：國土測繪中心 / 各地方政府開放資料

下載後可用 `GisLayerSeed` 的 `category/year/source` 版本化管理。

## 匯入工具

使用 `scripts/gis-fetch.ts` 下載並登錄圖層（見該檔頭說明）：

```bash
npm run gis:fetch -- \
  --url "https://<來源>/wfs?...&outputFormat=application/json&srsName=EPSG:4326" \
  --out soil_liquefaction_2024.geojson \
  --layer gl_soil --category RISK --title "土壤液化潛勢" --source NLSC --year 2024
```

完成後會輸出可貼入 `prisma/seed.ts` 或直接執行的 `GisLayerSeed` 登錄 SQL。

## 目前檔案

| 檔案 | 類別 | 對應圖層 | 說明 |
| --- | --- | --- | --- |
| `soil_liquefaction_demo.geojson` | RISK | `gl_soil` | 土壤液化潛勢（示範，面） |
| `geo_sensitive_demo.geojson` | RISK | `gl_geo2` | 地質敏感區（示範，面） |
| `school_demo.geojson` | FACILITY | `gl_school` | 各級學校（示範，點） |
| `shelter_demo.geojson` | FACILITY | `gl_shelter` | 避難收容所（示範，點） |
| `fire_hydrant_demo.geojson` | FACILITY | `gl_fire` | 消防栓（示範，點） |
| `village_stats_demo.geojson` | STATS | `gl_stats_pop` | 村里人口面量（示範，面＋value） |

> STATS 類別（社經統計）以 `value` 屬性做分級面量（choropleth），由前端 `/api/gis/vector/{id}` 讀取渲染。
