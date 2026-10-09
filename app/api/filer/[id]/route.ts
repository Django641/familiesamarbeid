import { get } from "@vercel/blob";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/lib/db";
import { documents } from "@/lib/db/schema";
import { getSession } from "@/lib/session";

export const runtime = "nodejs";

const INLINE_TYPES = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "image/heic",
  "image/heif",
  "text/plain",
]);

// Viser en privat fil. Tilgang sjekkes her (ikke bare i proxy), og svaret caches
// aldri i CDN — bare privat i nettleseren, med ETag for raske 304-svar.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getSession())) return new NextResponse("Ikke innlogget", { status: 401 });
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return new NextResponse("Ikke funnet", { status: 404 });

  const [doc] = await db.select().from(documents).where(eq(documents.id, id));
  if (!doc) return new NextResponse("Ikke funnet", { status: 404 });

  const result = await get(doc.pathname, {
    access: "private",
    ifNoneMatch: request.headers.get("if-none-match") ?? undefined,
  });
  if (!result) return new NextResponse("Ikke funnet", { status: 404 });

  const headers = new Headers({
    "Cache-Control": "private, no-cache",
    "X-Content-Type-Options": "nosniff",
  });
  const etag = result.headers.get("etag");
  if (etag) headers.set("ETag", etag);
  if (result.statusCode === 304) return new NextResponse(null, { status: 304, headers });

  // Bare typer som ikke kan kjøre script vises i nettleseren. Alt annet (HTML, SVG,
  // ukjent) lastes ned som binærfil — ellers kunne en opplastet fil kjøre kode på vårt domene.
  const type = (result.blob.contentType || doc.content_type || "").split(";")[0].trim().toLowerCase();
  const inlineSafe = INLINE_TYPES.has(type);
  const download = !inlineSafe || new URL(request.url).searchParams.has("last-ned");
  headers.set("Content-Type", inlineSafe ? type : "application/octet-stream");
  headers.set(
    "Content-Disposition",
    `${download ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(doc.name)}`
  );
  if (type !== "application/pdf") headers.set("Content-Security-Policy", "sandbox; default-src 'none'; img-src 'self'");
  return new NextResponse(result.stream, { headers });
}
