import { defineConfig } from "drizzle-kit";

// Migrasjoner genereres lokalt (`npm run db:generate`), committes i drizzle/,
// og kjøres automatisk i Vercel-builden (scripts/migrate.mjs).
export default defineConfig({
  dialect: "postgresql",
  schema: "./lib/db/schema.ts",
  out: "./drizzle",
  dbCredentials: { url: process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL ?? "" },
});
