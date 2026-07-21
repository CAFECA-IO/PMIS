"use client";

import { useRouter } from "next/navigation";
import { UserMinus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { removeProjectMemberAction } from "../actions";

export function MemberRemoveButton({
  id,
  projectId,
  name,
}: {
  id: string;
  projectId: string;
  name: string;
}) {
  const router = useRouter();
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      aria-label={`移除 ${name}`}
      onClick={async () => {
        await removeProjectMemberAction(id, projectId);
        router.refresh();
      }}
    >
      <UserMinus className="size-4 text-muted-foreground" />
    </Button>
  );
}
