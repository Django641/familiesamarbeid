import { asc, desc, eq, gte, or } from "drizzle-orm";

import { TopBar } from "@/components/top-bar";
import { db } from "@/lib/db";
import { tasks } from "@/lib/db/schema";
import { getFamily } from "@/lib/session";

import { TaskBoard } from "./task-board";

export const metadata = { title: "Gjøremål" };

export default async function TasksPage() {
  const { people, me } = await getFamily();
  // Åpne gjøremål + det som er gjort siste 14 dager (eldre gjorte vises ikke).
  const since = new Date(Date.now() - 14 * 86_400_000);
  const rows = await db
    .select()
    .from(tasks)
    .where(or(eq(tasks.done, false), gte(tasks.done_at, since)))
    .orderBy(asc(tasks.due_date), desc(tasks.created_at))
    .limit(400);

  return (
    <>
      <TopBar title="Gjøremål" />
      <main className="mx-auto max-w-xl px-4 py-4">
        <TaskBoard tasks={rows} people={people} me={me} />
      </main>
    </>
  );
}
