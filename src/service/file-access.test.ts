import { test } from "node:test";
import assert from "node:assert/strict";

import { canReadFile, denialStatus, type FileViewer } from "./file-access";

const admin: FileViewer = { id: "u1", role: "ADMIN", memberProjectIds: [] };
const manager: FileViewer = { id: "u2", role: "MANAGER", memberProjectIds: [] };
const member: FileViewer = {
  id: "u3",
  role: "MEMBER",
  memberProjectIds: ["pA"],
};
const outsider: FileViewer = {
  id: "u4",
  role: "MEMBER",
  memberProjectIds: ["pB"],
};

test("未登入一律拒絕", () => {
  assert.equal(canReadFile(null, { projectId: "pA" }), false);
  assert.equal(canReadFile(undefined, { projectId: null }), false);
});

test("ADMIN／MANAGER 可讀全部，包含未指派專案的檔案", () => {
  assert.equal(canReadFile(admin, { projectId: "pA" }), true);
  assert.equal(canReadFile(manager, { projectId: "pZ" }), true);
  assert.equal(
    canReadFile(admin, { projectId: null, uploadedById: "someone" }),
    true,
  );
});

test("專案檔案：成員可讀，非成員不可讀", () => {
  assert.equal(canReadFile(member, { projectId: "pA" }), true);
  assert.equal(canReadFile(outsider, { projectId: "pA" }), false);
});

test("未指派專案的檔案：僅上傳者本人可讀", () => {
  assert.equal(
    canReadFile(member, { projectId: null, uploadedById: "u3" }),
    true,
  );
  assert.equal(
    canReadFile(outsider, { projectId: null, uploadedById: "u3" }),
    false,
  );
});

test("未指派且上傳者不明時不開放（不成為公共可讀區）", () => {
  assert.equal(canReadFile(member, { projectId: null }), false);
  assert.equal(
    canReadFile(member, { projectId: null, uploadedById: null }),
    false,
  );
});

test("狀態碼區分未登入與無權", () => {
  assert.equal(denialStatus(null), 401);
  assert.equal(denialStatus(member), 403);
});
