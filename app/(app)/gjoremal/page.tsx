import { TopBar } from "@/components/top-bar";
import { getHousehold } from "@/lib/household";
import { createClient } from "@/lib/supabase/server";
import type { Task } from "@/lib/types";

import { TaskList } from "./task-list";

export const metadata = { title: "Gjøremål" };

export default async function TasksPage() {
  const [{ household, people, me }, supabase] = await Promise.all([getHousehold(), createClient()]);
  const { data } = await supabase
    .from("tasks")
    .select("*")
    .eq("household_id", household.id)
    .order("done", { ascending: true })
    .order("due_date", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(300);

  return (
    <>
      <TopBar title="Gjøremål" />
      <main className="mx-auto max-w-xl px-4 py-4">
        <TaskList
          householdId={household.id}
          tasks={(data ?? []) as Task[]}
          people={people}
          myPersonId={me?.id ?? null}
        />
      </main>
    </>
  );
}
