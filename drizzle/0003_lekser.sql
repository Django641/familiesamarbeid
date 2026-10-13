CREATE TABLE "homework_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"week_id" uuid NOT NULL,
	"kind" text DEFAULT 'lekse' NOT NULL,
	"due_date" date,
	"text" text NOT NULL,
	"source" text DEFAULT 'manuell' NOT NULL,
	"done" boolean DEFAULT false NOT NULL,
	"done_at" timestamp with time zone,
	"position" integer DEFAULT 0 NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "homework_items_kind_ck" CHECK ("homework_items"."kind" in ('lekse', 'mal')),
	CONSTRAINT "homework_items_source_ck" CHECK ("homework_items"."source" in ('ukeplan', 'manuell'))
);
--> statement-breakpoint
CREATE TABLE "homework_weeks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"person_id" uuid NOT NULL,
	"week_start" date NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "homework_weeks_person_week_uq" UNIQUE("person_id","week_start"),
	CONSTRAINT "homework_weeks_monday_ck" CHECK (extract(isodow from "homework_weeks"."week_start") = 1)
);
--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "homework_week_id" uuid;--> statement-breakpoint
ALTER TABLE "homework_items" ADD CONSTRAINT "homework_items_week_id_homework_weeks_id_fk" FOREIGN KEY ("week_id") REFERENCES "public"."homework_weeks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "homework_items" ADD CONSTRAINT "homework_items_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "homework_weeks" ADD CONSTRAINT "homework_weeks_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "homework_weeks" ADD CONSTRAINT "homework_weeks_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "homework_items_week_due_idx" ON "homework_items" USING btree ("week_id","due_date");--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_homework_week_id_homework_weeks_id_fk" FOREIGN KEY ("homework_week_id") REFERENCES "public"."homework_weeks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "documents_homework_week_idx" ON "documents" USING btree ("homework_week_id");