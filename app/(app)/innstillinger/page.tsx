import { inArray } from "drizzle-orm";

import { TopBar } from "@/components/top-bar";
import { allowedEmails } from "@/lib/auth";
import { db } from "@/lib/db";
import { user as userTable } from "@/lib/db/schema";
import { getFamily } from "@/lib/session";

import { AccessCard } from "./access-card";
import { AccountCard } from "./account-card";
import { FamilyEditor } from "./family-editor";
import { PasskeyCard } from "./passkey-card";
import { PushToggle } from "./push-toggle";

export const metadata = { title: "Innstillinger" };

export default async function SettingsPage() {
  const { people, me, userId } = await getFamily();
  const emails = allowedEmails();
  const registered = emails.length
    ? await db.select({ id: userTable.id, email: userTable.email }).from(userTable).where(inArray(userTable.email, emails))
    : [];
  const myEmail = registered.find((u) => u.id === userId)?.email ?? null;
  const partner = people.find((p) => p.kind === "voksen" && p.user_id && p.user_id !== userId) ?? null;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? "";

  return (
    <>
      <TopBar title="Innstillinger" />
      <main className="mx-auto flex max-w-xl flex-col gap-4 px-4 py-4">
        <FamilyEditor people={people} meId={me.id} />
        <PasskeyCard />
        <PushToggle />
        <AccessCard
          appUrl={appUrl}
          pending={emails.filter((e) => !registered.some((r) => r.email.toLowerCase() === e))}
          partner={partner ? { id: partner.id, name: partner.name } : null}
        />
        <AccountCard email={myEmail} />
      </main>
    </>
  );
}
