import { TopBar } from "@/components/top-bar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getHousehold } from "@/lib/household";
import { createClient } from "@/lib/supabase/server";
import type { ExternalCalendar } from "@/lib/types";

import { CalendarFeed } from "./calendar-feed";
import { ExternalCalendars } from "./external-calendars";
import { FamilyEditor } from "./family-editor";
import { InviteShare } from "./invite-share";
import { PushToggle } from "./push-toggle";

export const metadata = { title: "Innstillinger" };

export default async function SettingsPage() {
  const [{ household, people, userId }, supabase] = await Promise.all([getHousehold(), createClient()]);
  const [{ data: feed }, { data: calendars }, { data: auth }] = await Promise.all([
    supabase.from("calendar_feeds").select("token").eq("user_id", userId).maybeSingle(),
    supabase.from("external_calendars").select("*").eq("household_id", household.id).order("created_at"),
    supabase.auth.getUser(),
  ]);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? "";
  const adults = people.filter((p) => p.kind === "voksen");

  return (
    <>
      <TopBar title="Innstillinger" />
      <main className="mx-auto flex max-w-xl flex-col gap-4 px-4 py-4">
        <FamilyEditor householdId={household.id} people={people} />

        {adults.length < 2 ? <InviteShare code={household.invite_code} appUrl={appUrl} /> : null}

        <CalendarFeed householdId={household.id} userId={userId} token={feed?.token ?? null} appUrl={appUrl} />

        <ExternalCalendars
          householdId={household.id}
          people={people}
          calendars={(calendars ?? []) as ExternalCalendar[]}
        />

        <PushToggle householdId={household.id} userId={userId} />

        {adults.length >= 2 ? <InviteShare code={household.invite_code} appUrl={appUrl} compact /> : null}

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Konto</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            <p className="text-sm text-[var(--color-muted)]">Logget inn som {auth.user?.email}</p>
            <form action="/auth/logout" method="post">
              <Button type="submit" variant="outline" className="w-full">
                Logg ut
              </Button>
            </form>
          </CardContent>
        </Card>
      </main>
    </>
  );
}
