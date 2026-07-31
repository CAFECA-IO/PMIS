"use client";

import { useRouter } from "next/navigation";
import { UserMinus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { unassignProjectMemberAction } from "./actions";

/**
 * 移除專案成員。
 *
 * 不走確認視窗：移除是可逆的（再加回來即可），而人力調動本來就頻繁，
 * 每次都問會讓真正需要確認的操作（如刪除專案）失去份量。
 */
export function StaffingRemoveButton({
  id,
  name,
  project,
}: {
  id: string;
  name: string;
  project: string;
}) {
  const router = useRouter();
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      aria-label={`自${project}移除 ${name}`}
      onClick={async () => {
        await unassignProjectMemberAction(id);
        router.refresh();
      }}
    >
      <UserMinus className="size-4 text-muted-foreground" />
    </Button>
  );
}
