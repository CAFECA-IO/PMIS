<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# 專案慣例

以下四項先前只靠既有程式碼的先例維持，未寫成文件 —— 於是曾在單一 PR 中
偏離上千行。寫在這裡是為了讓偏離在 review 前就被發現。

## 註解署名

所有註解一律帶署名，格式為 `Info: (yyyymmdd - Author) 說明`：

```ts
// Info: (20260810 - Luphia) 快取失敗不影響回應
```

- **單行 `//` 註解逐行署名。** 多行段落的每一行都要，不是只有第一行。
- **區塊註解整段一個署名**，置於第一行內容：`/* */`、`/** */`、
  JSX `{/* */}`、Prisma schema 的連續 `///` 段落皆同。
- 署名記錄的是**撰寫者與撰寫日期**，不是最後修改者。
- 適用範圍含測試碼、`prisma/schema.prisma` 與 `globals.css`。
- 工具指示（`eslint-disable`、`@ts-`、`prettier-`）不署名。

## 分層：只有 repository 能碰資料庫

```
route / page / component  →  service  →  repository  →  prisma
```

- `src/repository/client.ts` 是 Prisma client 的唯一實例化處，
  **只有 `src/repository/**` 可以 import 它**。
- service 不得直接呼叫 `prisma.*`，一律經 repository。
- route、page、server action、component 不得 import `@/repository/**`，
  一律經 service。repository 也不得反向 import service／app／component。
- 交易（`$transaction`）屬 repository 層。
- 自 `@/generated/prisma/enums` 取**型別**不受此限（不含 client）。

尚未收口的既存例外（勿新增，遇到請一併修）：
`src/service/alert.service.ts`、`src/app/api/documents/file/[id]/route.ts`、
`src/app/api/file-manager/upload/route.ts`。

## API 路由回應

路由一律以 `jsonOk`／`jsonFail` 回應（`src/lib/api-response.ts`），
不直接呼叫 `NextResponse.json`：

```ts
import { jsonOk, jsonFail, jsonError } from "@/lib/api-response";
import { API_ERRORS } from "@/lib/api-error";

if (!user) return jsonFail(API_ERRORS.AU_NOT_SIGNED_IN);
return jsonOk({ id: row.id });
```

- **不要自己寫 HTTP 狀態碼。** 狀態由錯誤定義的 `status`（`ApiCode`）
  經 `HTTP_MAP` 推導，只有一個決定點。
- 錯誤一律登錄於 `src/lib/api-error.ts` 的 `API_ERRORS`，讓前端有穩定的
  `errorCode` 可判斷；不要就地拼裝 `IErrorDef`，那等於沒有穩定識別碼。
- 回應資料在信封的 `payload` 之下，錯誤文案在 `message`。
- 檔案下載用 `src/lib/file-response.ts` 的 `fileResponse`。
- `src/lib/api-response.test.ts` 有 source-guard：未遷移路由的豁免清單
  只能變短。遷移一個就從清單移除一個。

此契約與 iSunFA `src/lib/utils/response.ts` 相同，匯出名稱一致；
檔名採本專案的 kebab-case（`src/lib/utils.ts` 已存在，無法再建同名目錄）。
