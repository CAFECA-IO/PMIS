import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { ProjectForm } from "./project-form";

export const metadata = { title: "新增專案 — PMIS" };

export default function NewProjectPage() {
  return (
    <>
      <PageHeader title="新增工程專案" description="建立一筆新的監造專案" />
      <div className="max-w-3xl p-8">
        <Card>
          <CardContent className="p-6">
            <ProjectForm />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
