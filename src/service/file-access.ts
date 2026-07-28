import type { AccountRole } from "@/generated/prisma/enums";

/**
 * 檔案讀取權限的單一判定規則（純函式）。
 *
 * 全站所有檔案路由都套用這一份，避免各路由各自為政 ——
 * 先前 /api/files/[id] 完全沒有檢查，另兩個只驗「已登入」而未驗專案歸屬。
 *
 * 規則：
 *  1. 未登入一律拒絕。
 *  2. 有全案檢視權者（ADMIN／MANAGER）可讀取全部。
 *  3. 檔案屬於某專案：須為該專案成員。
 *  4. 檔案未指派專案（費思一般對話的上傳）：僅上傳者本人可讀。
 */
export type FileViewer = {
  id: string;
  role: AccountRole;
  /** 該使用者為成員的專案 id。 */
  memberProjectIds: string[];
};

export type FileOwner = {
  /** 檔案所屬專案；null 表示未指派。 */
  projectId: string | null;
  /** 上傳者 id；未知時為 null。 */
  uploadedById?: string | null;
};

/** 是否具備全案檢視權限。與 lib/auth.canSeeAllProjects 同義，此處避免相依。 */
function seesAllProjects(role: AccountRole): boolean {
  return role === "ADMIN" || role === "MANAGER";
}

export function canReadFile(
  viewer: FileViewer | null | undefined,
  file: FileOwner,
): boolean {
  if (!viewer) return false;
  if (seesAllProjects(viewer.role)) return true;

  if (file.projectId) {
    return viewer.memberProjectIds.includes(file.projectId);
  }
  // 未指派專案：只有上傳者本人看得到，避免成為全體可讀的公共區
  return Boolean(file.uploadedById) && file.uploadedById === viewer.id;
}

/** 拒絕時對應的 HTTP 狀態：未登入 401，已登入但無權 403。 */
export function denialStatus(viewer: FileViewer | null | undefined): 401 | 403 {
  return viewer ? 403 : 401;
}

/**
 * 簽核文件附件的權限。
 *
 * ApprovalDocument 在資料模型上「不隸屬任何專案」，因此無法套用專案層級規則。
 * 對應的最小合理範圍是「與該簽核案有關的人」：
 *  1. 具全案檢視權者（ADMIN／MANAGER）
 *  2. 申請人本人
 *  3. 流程關卡指定職位的持有者（即應簽核者）
 */
export type ApprovalViewer = {
  id: string;
  role: AccountRole;
  positionId?: string | null;
};

export type ApprovalFileOwner = {
  applicantId: string;
  /** 流程各關卡指定的職位 id。 */
  stepPositionIds: string[];
};

export function canReadApprovalFile(
  viewer: ApprovalViewer | null | undefined,
  file: ApprovalFileOwner,
): boolean {
  if (!viewer) return false;
  if (seesAllProjects(viewer.role)) return true;
  if (viewer.id === file.applicantId) return true;
  return Boolean(
    viewer.positionId && file.stepPositionIds.includes(viewer.positionId),
  );
}
