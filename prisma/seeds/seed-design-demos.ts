/**
 * 建立各專案的展示用 3D 施工動畫版本。
 *
 * 執行：npx tsx prisma/seeds/seed-design-demos.ts
 *
 * 這支是**加法式**且可重複執行的：不刪任何既有資料，只在該專案「尚無設計版本」
 * 時補上示範版本（已有版本則跳過，避免蓋掉使用者用費思產生的成果）。
 * 加上 --force 可強制重建（會軟刪除既有示範版本後重新寫入）。
 */

import "dotenv/config";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

import { PrismaClient } from "../../src/generated/prisma/client";
import { buildAnimationHtml, designPayload } from "./design-animation";
import { PROJECT_DEMOS } from "./design-demos";

function databaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("缺少 DATABASE_URL，請確認 .env。");
  return url;
}

async function main() {
  const force = process.argv.includes("--force");
  const adapter = new PrismaBetterSqlite3({ url: databaseUrl() });
  const prisma = new PrismaClient({ adapter });

  let created = 0;
  let skipped = 0;

  try {
    for (const demo of PROJECT_DEMOS) {
      const project = await prisma.project.findFirst({
        where: { code: demo.code, deletedAt: null },
        select: { id: true, name: true, keyRequirements: true },
      });
      if (!project) {
        console.log(`- 略過 ${demo.code}：資料庫中找不到此專案`);
        continue;
      }

      // 關鍵要求重點：示範資料的一部分，動畫寫實度靠它。原本沒填才補上。
      if (!project.keyRequirements?.trim()) {
        await prisma.project.update({
          where: { id: project.id },
          data: { keyRequirements: demo.keyRequirements },
        });
        console.log(`  ${demo.code} 已補上關鍵要求重點`);
      }

      const existing = await prisma.designVersion.count({
        where: { projectId: project.id, deletedAt: null },
      });
      if (existing > 0 && !force) {
        console.log(`- 略過 ${demo.code}：已有 ${existing} 個設計版本（--force 可強制重建）`);
        skipped += 1;
        continue;
      }
      if (existing > 0 && force) {
        await prisma.designVersion.updateMany({
          where: { projectId: project.id, deletedAt: null },
          data: { deletedAt: new Date() },
        });
        console.log(`  ${demo.code} 已軟刪除 ${existing} 個舊版本`);
      }

      // 版號由現有最大值續編，避免與 @@unique([projectId, version]) 衝突
      const latest = await prisma.designVersion.findFirst({
        where: { projectId: project.id },
        orderBy: { version: "desc" },
        select: { version: true },
      });
      let next = (latest?.version ?? 0) + 1;

      for (const v of demo.versions) {
        const html = buildAnimationHtml(v.spec);
        const design = designPayload(v.spec);
        await prisma.designVersion.create({
          data: {
            projectId: project.id,
            version: next,
            html,
            design: JSON.stringify(design),
            summary: design.reply,
            instruction: v.instruction ?? null,
            baseVersion: v.baseVersion ?? null,
          },
        });
        console.log(
          `+ ${demo.code} v${next}（${v.spec.items.length} 分項、` +
            `${Math.round(html.length / 1024)} KB${v.instruction ? `、修訂：${v.instruction}` : ""}）`,
        );
        next += 1;
        created += 1;
      }
    }

    console.log(`\n完成：新增 ${created} 個版本，略過 ${skipped} 件已有版本的專案。`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
