import "server-only";

import { attachDatabasePool } from "@vercel/functions";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as schema from "./schema";

// Neon via Vercel Marketplace. Anbefalt oppsett på Vercel Fluid compute er en
// vanlig TCP-pool i modul-scope + attachDatabasePool, så ledige tilkoblinger
// lukkes før funksjonen fryses. DATABASE_URL er den poolede (PgBouncer) URL-en.
const globalForDb = globalThis as unknown as { pool?: Pool };

const pool =
  globalForDb.pool ??
  new Pool({
    // Neon gir «sslmode=require», som pg allerede behandler som verify-full — men med en
    // advarsel i hver logglinje. Å si verify-full eksplisitt gir samme sikkerhet uten støy.
    connectionString: process.env.DATABASE_URL?.replace("sslmode=require", "sslmode=verify-full"),
    max: 5,
    idleTimeoutMillis: 10_000,
  });

if (process.env.NODE_ENV !== "production") globalForDb.pool = pool;
attachDatabasePool(pool);

export const db = drizzle({ client: pool, schema });
export { schema };
