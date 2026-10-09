import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Invitasjonskode for én e-post, avledet med BETTER_AUTH_SECRET — ingen tabell trengs.
 * Når første konto finnes, kan nye kontoer bare lages med riktig kode (se lib/auth.ts),
 * så ingen andre kan «ta» samboerens konto før hen har registrert seg.
 */
export function inviteCode(email: string): string {
  return createHmac("sha256", process.env.BETTER_AUTH_SECRET ?? "")
    .update(`invite:${email.trim().toLowerCase()}`)
    .digest("base64url")
    .slice(0, 16);
}

export function isValidInvite(email: string, code: string | null | undefined): boolean {
  if (!code) return false;
  const expected = Buffer.from(inviteCode(email));
  const given = Buffer.from(code);
  return expected.length === given.length && timingSafeEqual(expected, given);
}
