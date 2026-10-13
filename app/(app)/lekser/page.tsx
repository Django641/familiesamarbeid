import { and, eq, inArray } from "drizzle-orm";

import { TopBar } from "@/components/top-bar";
import { Card, CardContent } from "@/components/ui/card";
import { db } from "@/lib/db";
import { documents, homework_items, homework_weeks } from "@/lib/db/schema";
import { defaultWeekStart, type HomeworkEntry, isWeekendMode } from "@/lib/homework";
import { getFamily } from "@/lib/session";
import { addDays, osloDateKey, osloTime } from "@/lib/utils";
import { mondayOf } from "@/lib/week-layout";
import { isDateKey } from "@/lib/weekly-plan-draft";

import { HomeworkBoard } from "./homework-board";

export const metadata = { title: "Lekser" };

export default async function HomeworkPage({ searchParams }: { searchParams: Promise<{ uke?: string; barn?: string }> }) {
  const [{ people }, sp] = await Promise.all([getFamily(), searchParams]);
  const children = people.filter((p) => p.kind === "barn");
  const selected = children.find((c) => c.id === sp.barn)?.id ?? "alle";
  const shownIds = (selected === "alle" ? children : children.filter((c) => c.id === selected)).map((c) => c.id);

  const now = new Date();
  const todayKey = osloDateKey(now);

  let weekStart: string;
  if (sp.uke && isDateKey(sp.uke)) {
    weekStart = mondayOf(sp.uke);
  } else {
    // Fra fredag kl. 14 vises neste uke hvis den finnes.
    const time = osloTime(now);
    const next = addDays(mondayOf(todayKey), 7);
    const nextExists =
      isWeekendMode(todayKey, time) && shownIds.length > 0
        ? (
            await db
              .select({ id: homework_weeks.id })
              .from(homework_weeks)
              .where(and(eq(homework_weeks.week_start, next), inArray(homework_weeks.person_id, shownIds)))
              .limit(1)
          ).length > 0
        : false;
    weekStart = defaultWeekStart(todayKey, time, nextExists);
  }

  if (children.length === 0) {
    return (
      <>
        <TopBar title="Lekser" />
        <main className="mx-auto flex max-w-xl flex-col gap-4 px-4 py-4">
          <Card>
            <CardContent className="py-8 text-center text-[var(--color-muted)]">
              Legg til barna under Innstillinger for å bruke Lekser.
            </CardContent>
          </Card>
        </main>
      </>
    );
  }

  const [rows, docs] = await Promise.all([
    db
      .select({ item: homework_items, person_id: homework_weeks.person_id })
      .from(homework_items)
      .innerJoin(homework_weeks, eq(homework_weeks.id, homework_items.week_id))
      .where(and(eq(homework_weeks.week_start, weekStart), inArray(homework_weeks.person_id, shownIds))),
    db
      .select({ id: documents.id, name: documents.name, person_id: homework_weeks.person_id })
      .from(documents)
      .innerJoin(homework_weeks, eq(homework_weeks.id, documents.homework_week_id))
      .where(and(eq(homework_weeks.week_start, weekStart), inArray(homework_weeks.person_id, shownIds)))
      .orderBy(documents.created_at),
  ]);

  const entries: HomeworkEntry[] = rows.map(({ item, person_id }) => ({
    id: item.id,
    person_id,
    kind: item.kind,
    due_date: item.due_date,
    text: item.text,
    done: item.done,
    done_at: item.done_at,
    source: item.source,
    position: item.position,
  }));

  return (
    <>
      <TopBar title="Lekser" />
      <main className="mx-auto flex max-w-xl flex-col gap-4 px-4 py-4">
        <HomeworkBoard
          kids={children}
          selected={selected}
          weekStart={weekStart}
          todayKey={todayKey}
          entries={entries}
          documents={docs}
        />
      </main>
    </>
  );
}
