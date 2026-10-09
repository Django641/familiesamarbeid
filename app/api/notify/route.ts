import { NextResponse } from "next/server";
import webpush from "web-push";
import { z } from "zod";

import { APP_NAME } from "@/lib/config";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 15;

// Sender web push til de ANDRE medlemmene av avsenderens husstand.

const RequestSchema = z.object({
  message: z.string().min(1).max(200),
  url: z.string().min(1).max(200).startsWith("/"),
  tag: z.string().max(50).optional(),
});

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Ikke autentisert" }, { status: 401 });

  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey || !process.env.SUPABASE_SECRET_KEY) {
    return NextResponse.json({ sent: 0 }); // push ikke konfigurert → no-op
  }

  const parsed = RequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Ugyldig forespørsel" }, { status: 400 });
  const { message, url, tag } = parsed.data;

  const [{ data: membership }, { data: profile }] = await Promise.all([
    supabase.from("household_members").select("household_id").eq("user_id", user.id).limit(1).maybeSingle(),
    supabase.from("profiles").select("display_name").eq("id", user.id).maybeSingle(),
  ]);
  if (!membership) return NextResponse.json({ error: "Ingen husstand" }, { status: 403 });

  const admin = createAdminClient();
  const { data: subscriptions } = await admin
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("household_id", membership.household_id)
    .neq("user_id", user.id);
  if (!subscriptions?.length) return NextResponse.json({ sent: 0 });

  webpush.setVapidDetails(process.env.VAPID_SUBJECT ?? "mailto:post@example.com", publicKey, privateKey);
  const payload = JSON.stringify({
    title: APP_NAME,
    body: `${profile?.display_name ?? "Noen"} ${message}`,
    url,
    tag,
  });

  let sent = 0;
  await Promise.all(
    subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload,
          { TTL: 86400 }
        );
        sent++;
      } catch (error) {
        const statusCode = (error as { statusCode?: number }).statusCode;
        if (statusCode === 404 || statusCode === 410) {
          await admin.from("push_subscriptions").delete().eq("id", sub.id);
        }
      }
    })
  );
  return NextResponse.json({ sent });
}
