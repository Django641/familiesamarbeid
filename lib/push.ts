import "server-only";

import { eq, ne } from "drizzle-orm";
import webpush from "web-push";

import { APP_NAME } from "@/lib/config";
import { db } from "@/lib/db";
import { people, push_subscriptions } from "@/lib/db/schema";

/**
 * Sender web push til de ANDRE voksne (alle enheter de har slått på varsler på).
 * Kalles i `after()` fra server actions, så den aldri forsinker eller feiler en mutasjon.
 */
export async function notifyOthers(senderUserId: string, message: string, url: string, tag?: string) {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) return;

  const [subs, [sender]] = await Promise.all([
    db.select().from(push_subscriptions).where(ne(push_subscriptions.user_id, senderUserId)),
    db.select({ name: people.name }).from(people).where(eq(people.user_id, senderUserId)),
  ]);
  if (subs.length === 0) return;

  webpush.setVapidDetails(process.env.VAPID_SUBJECT ?? "mailto:post@example.com", publicKey, privateKey);
  const payload = JSON.stringify({ title: APP_NAME, body: `${sender?.name ?? "Noen"} ${message}`, url, tag });

  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload,
          { TTL: 86400 }
        );
      } catch (error) {
        const statusCode = (error as { statusCode?: number }).statusCode;
        if (statusCode === 404 || statusCode === 410) {
          await db.delete(push_subscriptions).where(eq(push_subscriptions.id, sub.id));
        }
      }
    })
  );
}
