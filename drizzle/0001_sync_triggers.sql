-- Live-synk: én teller som økes ved hver endring i datatabellene.
-- Telefonene spør /api/sync om versjonen og oppdaterer når den har endret seg.
INSERT INTO "sync_state" ("id", "version") VALUES (1, 0) ON CONFLICT ("id") DO NOTHING;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION bump_sync_version() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  UPDATE "sync_state" SET "version" = "version" + 1 WHERE "id" = 1;
  RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER people_sync AFTER INSERT OR UPDATE OR DELETE ON "people" FOR EACH STATEMENT EXECUTE FUNCTION bump_sync_version();
--> statement-breakpoint
CREATE TRIGGER events_sync AFTER INSERT OR UPDATE OR DELETE ON "events" FOR EACH STATEMENT EXECUTE FUNCTION bump_sync_version();
--> statement-breakpoint
CREATE TRIGGER shopping_items_sync AFTER INSERT OR UPDATE OR DELETE ON "shopping_items" FOR EACH STATEMENT EXECUTE FUNCTION bump_sync_version();
--> statement-breakpoint
CREATE TRIGGER tasks_sync AFTER INSERT OR UPDATE OR DELETE ON "tasks" FOR EACH STATEMENT EXECUTE FUNCTION bump_sync_version();
--> statement-breakpoint
CREATE TRIGGER messages_sync AFTER INSERT OR UPDATE OR DELETE ON "messages" FOR EACH STATEMENT EXECUTE FUNCTION bump_sync_version();
--> statement-breakpoint
CREATE TRIGGER documents_sync AFTER INSERT OR UPDATE OR DELETE ON "documents" FOR EACH STATEMENT EXECUTE FUNCTION bump_sync_version();
