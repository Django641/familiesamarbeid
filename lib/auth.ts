import "server-only";

import { passkey } from "@better-auth/passkey";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { count } from "drizzle-orm";

import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { isValidInvite } from "@/lib/invite";

const appUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? "http://localhost:3000";

/** Bare disse e-postene kan lage konto (kommaseparert i ALLOWED_EMAILS). */
export function allowedEmails(): string[] {
  return (process.env.ALLOWED_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export const auth = betterAuth({
  baseURL: appUrl,
  secret: process.env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(db, { provider: "pg", schema }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    autoSignIn: true,
  },
  session: {
    // Logget inn i et år; fornyes ved bruk. Cookie-cache sparer databasekall ved hver sidevisning.
    expiresIn: 60 * 60 * 24 * 365,
    updateAge: 60 * 60 * 24,
    cookieCache: { enabled: true, maxAge: 5 * 60 },
    // Lange sesjoner + Face ID-registrering senere: ikke krev «fersk» innlogging.
    freshAge: 0,
  },
  hooks: {
    // Første konto (eieren) kan registreres fritt. Deretter kreves invitasjonskode
    // fra Innstillinger, så ingen kan registrere seg med samboerens e-post først.
    before: createAuthMiddleware(async (ctx) => {
      if (ctx.path !== "/sign-up/email") return;
      const [{ value: users }] = await db.select({ value: count() }).from(schema.user);
      if (users === 0) return;
      const email = String((ctx.body as { email?: unknown } | undefined)?.email ?? "");
      if (!isValidInvite(email, ctx.headers?.get("x-invite-code"))) {
        throw new APIError("FORBIDDEN", { message: "Du trenger en invitasjonslenke for å lage konto." });
      }
    }),
  },
  databaseHooks: {
    user: {
      create: {
        before: async (user) => {
          if (!allowedEmails().includes(user.email.toLowerCase())) {
            throw new APIError("FORBIDDEN", { message: "Denne e-posten har ikke tilgang til appen." });
          }
          return { data: user };
        },
      },
    },
  },
  plugins: [
    passkey({
      rpID: new URL(appUrl).hostname,
      rpName: "Familiesamarbeid",
      origin: appUrl,
    }),
    nextCookies(), // må stå sist
  ],
});

export type Session = typeof auth.$Infer.Session;
