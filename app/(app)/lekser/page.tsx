import { TopBar } from "@/components/top-bar";
import { Card, CardContent } from "@/components/ui/card";
import { requireUser } from "@/lib/session";

export const metadata = { title: "Lekser" };

export default async function HomeworkPage() {
  await requireUser();
  return (
    <>
      <TopBar title="Lekser" />
      <main className="mx-auto flex max-w-xl flex-col gap-4 px-4 py-4">
        <Card>
          <CardContent className="py-8 text-center text-[var(--color-muted)]">Kommer snart</CardContent>
        </Card>
      </main>
    </>
  );
}
