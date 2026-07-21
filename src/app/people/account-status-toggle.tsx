"use client";

import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { setAccountStatusAction } from "./actions";

export function AccountStatusToggle({
  id,
  status,
}: {
  id: string;
  status: string;
}) {
  const router = useRouter();
  const next = status === "ACTIVE" ? "DISABLED" : "ACTIVE";
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={async () => {
        await setAccountStatusAction(id, next);
        router.refresh();
      }}
    >
      {status === "ACTIVE" ? "停用" : "啟用"}
    </Button>
  );
}
