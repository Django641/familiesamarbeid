import { TopBar } from "@/components/top-bar";
import { getHousehold } from "@/lib/household";
import { createClient } from "@/lib/supabase/server";
import type { Message } from "@/lib/types";

import { MessageFeed } from "./message-feed";

export const metadata = { title: "Beskjeder" };

export default async function MessagesPage() {
  const [{ household, people, userId }, supabase] = await Promise.all([getHousehold(), createClient()]);
  const { data } = await supabase
    .from("messages")
    .select("*")
    .eq("household_id", household.id)
    .order("created_at", { ascending: false })
    .limit(100);

  return (
    <>
      <TopBar title="Beskjeder" />
      <main className="mx-auto max-w-xl px-4 py-4">
        <MessageFeed
          householdId={household.id}
          messages={((data ?? []) as Message[]).reverse()}
          people={people}
          userId={userId}
        />
      </main>
    </>
  );
}
