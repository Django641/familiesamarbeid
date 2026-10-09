// Radtyper avledet fra Drizzle-skjemaet (lib/db/app-schema.ts). Kun typer — trygt i klientkode.
import type { documents, events, messages, people, shopping_items, tasks } from "@/lib/db/app-schema";

export type Person = typeof people.$inferSelect;
export type CalendarEvent = typeof events.$inferSelect;
export type ShoppingItem = typeof shopping_items.$inferSelect;
export type ShoppingStatus = ShoppingItem["status"];
export type Task = typeof tasks.$inferSelect;
export type Message = typeof messages.$inferSelect;
export type DocumentRow = typeof documents.$inferSelect;
