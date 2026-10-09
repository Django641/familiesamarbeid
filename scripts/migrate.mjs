// Kjører Drizzle-migrasjonene i drizzle/ mot Neon før `next build` på Vercel.
// Bruker den upoolede URL-en (migrasjoner trenger en vanlig sesjon, ikke PgBouncer).
// Mangler database-URL (f.eks. lokalt uten .env), hoppes steget over.
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";

const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
if (!url) {
  console.warn("⚠️  Ingen DATABASE_URL — hopper over databasemigrasjoner.");
  process.exit(0);
}

const client = new pg.Client({ connectionString: url });
await client.connect();
try {
  await migrate(drizzle({ client }), { migrationsFolder: "./drizzle" });
  console.log("✓ Databasemigrasjoner er oppdatert.");
} finally {
  await client.end();
}
