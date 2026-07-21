import * as orgRepo from "@/repository/orgUnit.repository";
import * as positionRepo from "@/repository/position.repository";
import * as accountRepo from "@/repository/account.repository";
import { accountRoleMeta, accountStatusMeta } from "@/constant/people";
import type { AccountRole, AccountStatus } from "@/generated/prisma/enums";

const VALID_ROLES = Object.keys(accountRoleMeta) as AccountRole[];
const VALID_STATUSES = Object.keys(accountStatusMeta) as AccountStatus[];

// ── queries ────────────────────────────────────────────────
export function listOrgUnits() {
  return orgRepo.list();
}
export function listPositions() {
  return positionRepo.list();
}
export function listAccounts() {
  return accountRepo.list();
}

export async function getOverview() {
  const [orgUnits, positions, accounts] = await Promise.all([
    orgRepo.list(),
    positionRepo.list(),
    accountRepo.list(),
  ]);
  return {
    orgUnits,
    positions,
    accounts,
    chart: buildOrgChartMarkdown(orgUnits),
  };
}

// ── org units ──────────────────────────────────────────────
export type OrgUnitInput = { name?: string; code?: string; parentId?: string };

export async function createOrgUnit(input: OrgUnitInput) {
  const name = input.name?.trim();
  if (!name) return;
  await orgRepo.create({
    name,
    code: input.code?.trim() || undefined,
    parentId: input.parentId?.trim() || undefined,
  });
}
export const deleteOrgUnit = (id: string) => orgRepo.softDelete(id);
export const restoreOrgUnit = (id: string) => orgRepo.restore(id);

// ── positions ──────────────────────────────────────────────
export type PositionInput = { name?: string; rank?: string };

export async function createPosition(input: PositionInput) {
  const name = input.name?.trim();
  if (!name) return;
  const rank =
    input.rank && !Number.isNaN(Number(input.rank)) ? Number(input.rank) : 0;
  await positionRepo.create({ name, rank });
}
export const deletePosition = (id: string) => positionRepo.softDelete(id);
export const restorePosition = (id: string) => positionRepo.restore(id);

// ── accounts ───────────────────────────────────────────────
export type AccountInput = {
  name?: string;
  email?: string;
  phone?: string;
  role?: string;
  status?: string;
  orgUnitId?: string;
  positionId?: string;
};

export type AccountResult = { ok: true } | { ok: false; error: string };

export async function createAccount(input: AccountInput): Promise<AccountResult> {
  const name = input.name?.trim();
  const email = input.email?.trim();
  if (!name || !email) {
    return { ok: false, error: "姓名與 Email 為必填欄位。" };
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: "Email 格式不正確。" };
  }
  const existing = await accountRepo.findByEmail(email);
  if (existing) {
    return { ok: false, error: `Email「${email}」已被使用。` };
  }

  const role: AccountRole = VALID_ROLES.includes(input.role as AccountRole)
    ? (input.role as AccountRole)
    : "ENGINEER";
  const status: AccountStatus = VALID_STATUSES.includes(
    input.status as AccountStatus,
  )
    ? (input.status as AccountStatus)
    : "ACTIVE";

  await accountRepo.create({
    name,
    email,
    phone: input.phone?.trim() || undefined,
    role,
    status,
    orgUnitId: input.orgUnitId?.trim() || undefined,
    positionId: input.positionId?.trim() || undefined,
  });
  return { ok: true };
}

export async function setAccountStatus(id: string, status: string) {
  if (!VALID_STATUSES.includes(status as AccountStatus)) return;
  await accountRepo.setStatus(id, status as AccountStatus);
}
export const deleteAccount = (id: string) => accountRepo.softDelete(id);
export const restoreAccount = (id: string) => accountRepo.restore(id);

// ── org chart (mermaid + markdown) ─────────────────────────
type OrgNode = {
  id: string;
  name: string;
  parentId: string | null;
  _count: { accounts: number };
};

export function buildOrgChartMarkdown(units: OrgNode[]): string {
  if (units.length === 0) {
    return "## 組織架構圖\n\n_尚未建立組織單位。_";
  }

  const idToNode = new Map(units.map((u, i) => [u.id, `U${i}`]));
  const lines: string[] = ["graph TD"];

  for (const u of units) {
    const node = idToNode.get(u.id)!;
    const label = `${u.name}<br/>${u._count.accounts} 人`;
    lines.push(`  ${node}["${label}"]`);
  }
  for (const u of units) {
    if (u.parentId && idToNode.has(u.parentId)) {
      lines.push(`  ${idToNode.get(u.parentId)} --> ${idToNode.get(u.id)}`);
    }
  }

  return ["## 組織架構圖", "", "```mermaid", ...lines, "```"].join("\n");
}
