import { desc } from "drizzle-orm";

import { TopBar } from "@/components/top-bar";
import { db } from "@/lib/db";
import { messages } from "@/lib/db/schema";
import { getFamily } from "@/lib/session";

import { Chat } from "./chat";

export const metadata = { title: "Beskjeder" };

export default async function MessagesPage() {
  const { people, userId } = await getFamily();
  const rows = await db.select().from(messages).orderBy(desc(messages.created_at)).limit(200);

  return (
    <>
      <TopBar title="Beskjeder" />
      <Chat messages={rows.reverse()} people={people} userId={userId} />
    </>
  );
}
