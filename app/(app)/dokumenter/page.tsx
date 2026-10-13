import { desc, isNull } from "drizzle-orm";

import { TopBar } from "@/components/top-bar";
import { db } from "@/lib/db";
import { documents } from "@/lib/db/schema";
import { getFamily } from "@/lib/session";

import { DocumentLibrary } from "./document-library";

export const metadata = { title: "Dokumenter" };

export default async function DocumentsPage() {
  const { people } = await getFamily();
  // Ukeplan-originaler som hører til en uke vises under Lekser, ikke her.
  const rows = await db
    .select()
    .from(documents)
    .where(isNull(documents.homework_week_id))
    .orderBy(desc(documents.created_at))
    .limit(500);

  return (
    <>
      <TopBar title="Dokumenter" />
      <main className="mx-auto max-w-xl px-4 py-4">
        <DocumentLibrary documents={rows} people={people} />
      </main>
    </>
  );
}
