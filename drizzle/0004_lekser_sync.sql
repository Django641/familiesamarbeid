-- Live-synk for Lekser (se 0001_sync_triggers.sql).
CREATE TRIGGER homework_weeks_sync AFTER INSERT OR UPDATE OR DELETE ON "homework_weeks" FOR EACH STATEMENT EXECUTE FUNCTION bump_sync_version();
--> statement-breakpoint
CREATE TRIGGER homework_items_sync AFTER INSERT OR UPDATE OR DELETE ON "homework_items" FOR EACH STATEMENT EXECUTE FUNCTION bump_sync_version();
