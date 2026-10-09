import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  date,
  doublePrecision,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

import { user } from "./auth-schema";

// Appens egne tabeller. Én familie per installasjon — derfor ingen household_id:
// alle innloggede brukere (bare e-postene i ALLOWED_EMAILS) ser og endrer alt.
// Egenskapsnavn er snake_case så de matcher kolonnene 1:1.

const createdAt = () => timestamp("created_at", { withTimezone: true }).defaultNow().notNull();
const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date());
const createdBy = () => text("created_by").references(() => user.id, { onDelete: "set null" });

/** Familiemedlemmer (voksne med konto + barn uten). Brukes til «hvem gjelder det». */
export const people = pgTable("people", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  kind: text("kind", { enum: ["voksen", "barn"] }).notNull().default("barn"),
  color: text("color").notNull().default("#2563eb"),
  user_id: text("user_id")
    .unique()
    .references(() => user.id, { onDelete: "set null" }),
  position: integer("position").notNull().default(0),
  /** Kjennetegn AI-en bruker for å koble meldinger til riktig person (klasse, lag, skole, jobb). */
  hints: text("hints").notNull().default(""),
  created_at: createdAt(),
});

export const events = pgTable(
  "events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    title: text("title").notNull(),
    description: text("description"),
    location: text("location"),
    category: text("category").notNull().default("avtale"),
    starts_at: timestamp("starts_at", { withTimezone: true }).notNull(),
    /** Heldag: start av siste dag (inklusiv). Null = samme dag / uten slutt. */
    ends_at: timestamp("ends_at", { withTimezone: true }),
    all_day: boolean("all_day").notNull().default(false),
    person_ids: uuid("person_ids").array().notNull().default(sql`'{}'::uuid[]`),
    /** Satt når hendelsen ble laget med «gjenta hver uke». */
    series_id: uuid("series_id"),
    created_by: createdBy(),
    created_at: createdAt(),
    updated_at: updatedAt(),
  },
  (t) => [index("events_starts_at_idx").on(t.starts_at), index("events_series_idx").on(t.series_id)]
);

/** Handleliste — portert fra Hyttekompis (se docs/HANDLELISTE.md der). */
export const shopping_items = pgTable(
  "shopping_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    category: text("category", { enum: ["dagligvare", "annet"] }).notNull().default("dagligvare"),
    store: text("store"),
    status: text("status", { enum: ["ma_kjopes", "kjopt"] }).notNull().default("ma_kjopes"),
    /** AI-butikkrekkefølge. Null = usortert (vises sist). Desimaler ved auto-innsortering. */
    sort_order: doublePrecision("sort_order"),
    created_by: createdBy(),
    created_at: createdAt(),
    updated_at: updatedAt(),
  },
  (t) => [index("shopping_items_status_idx").on(t.status)]
);

export const tasks = pgTable(
  "tasks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    title: text("title").notNull(),
    notes: text("notes"),
    assignee_person_id: uuid("assignee_person_id").references(() => people.id, { onDelete: "set null" }),
    due_date: date("due_date", { mode: "string" }),
    done: boolean("done").notNull().default(false),
    done_at: timestamp("done_at", { withTimezone: true }),
    created_by: createdBy(),
    created_at: createdAt(),
    updated_at: updatedAt(),
  },
  (t) => [index("tasks_done_idx").on(t.done, t.due_date)]
);

export const messages = pgTable(
  "messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    body: text("body").notNull(),
    pinned: boolean("pinned").notNull().default(false),
    created_by: createdBy(),
    created_at: createdAt(),
    updated_at: updatedAt(),
  },
  (t) => [index("messages_created_idx").on(t.created_at)]
);

/** Metadata for filer i privat Vercel Blob-lagring. */
export const documents = pgTable(
  "documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    pathname: text("pathname").notNull().unique(),
    content_type: text("content_type"),
    size_bytes: bigint("size_bytes", { mode: "number" }),
    category: text("category").notNull().default("annet"),
    created_by: createdBy(),
    created_at: createdAt(),
  },
  (t) => [index("documents_created_idx").on(t.created_at)]
);

export const push_subscriptions = pgTable("push_subscriptions", {
  id: uuid("id").primaryKey().defaultRandom(),
  user_id: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  endpoint: text("endpoint").notNull().unique(),
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
  created_at: createdAt(),
});

/**
 * Én rad som telles opp av triggere ved hver endring i datatabellene.
 * Telefonene spør om versjonen hvert 5. sekund og henter nye data når den endres.
 */
export const sync_state = pgTable("sync_state", {
  id: integer("id").primaryKey().default(1),
  version: bigint("version", { mode: "number" }).notNull().default(0),
});
