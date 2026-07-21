"use server";

import { revalidatePath } from "next/cache";

import * as financeService from "@/service/finance.service";
import { requireUser } from "@/service/auth.service";
import type { VoucherStatus } from "@/generated/prisma/enums";

function field(formData: FormData, key: string): string | undefined {
  const v = formData.get(key);
  return typeof v === "string" ? v : undefined;
}

async function actor() {
  const user = await requireUser();
  return { id: user.id, name: user.name, role: user.role };
}

export async function createVoucherAction(formData: FormData) {
  const projectId = field(formData, "projectId");
  if (!projectId) return;
  await financeService.createVoucher(
    {
      projectId,
      voucherNo: field(formData, "voucherNo"),
      date: field(formData, "date"),
      direction: field(formData, "direction"),
      category: field(formData, "category"),
      amount: field(formData, "amount"),
      cashFlow: field(formData, "cashFlow"),
      counterparty: field(formData, "counterparty"),
      summary: field(formData, "summary"),
      evidenceUrl: field(formData, "evidenceUrl"),
      aiExtracted: field(formData, "aiExtracted") === "true",
    },
    await actor(),
  );
  revalidatePath("/finance");
}

export async function setVoucherStatusAction(
  id: string,
  status: VoucherStatus,
) {
  await financeService.setVoucherStatus(id, status, await actor());
  revalidatePath("/finance");
}

export async function removeVoucherAction(id: string) {
  await financeService.removeVoucher(id, await actor());
  revalidatePath("/finance");
}
