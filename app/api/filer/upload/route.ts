import { handleUploadPresigned, type HandleUploadPresignedBody } from "@vercel/blob/client";
import { issueSignedToken } from "@vercel/blob";
import { NextResponse } from "next/server";

import { getSession } from "@/lib/session";

export const runtime = "nodejs";

const MAX_BYTES = 50 * 1024 * 1024;

// Gir nettleseren en kortlevd, signert tillatelse til å laste opp ÉN fil direkte
// til privat Vercel Blob (ingen 4,5 MB-grense via funksjonen). Klienten registrerer
// filen i databasen etterpå med server action `registerDocument`.
export async function POST(request: Request) {
  if (!(await getSession())) return NextResponse.json({ error: "Ikke innlogget" }, { status: 401 });

  const body = (await request.json().catch(() => null)) as HandleUploadPresignedBody | null;
  // Vi bruker bare «gi meg en opplastings-URL». Fullført-varsler fra Blob (webhook)
  // brukes ikke — klienten registrerer fila selv med `registerDocument` — så de avvises.
  if (body?.type !== "blob.generate-presigned-url") {
    return NextResponse.json({ error: "Ugyldig forespørsel" }, { status: 400 });
  }
  try {
    const result = await handleUploadPresigned({
      body,
      request,
      // Biblioteket krever en nøkkel for å verifisere webhook-signaturer, selv om den
      // bare brukes for «upload-completed», som vi avviser over. Uten den feiler alt.
      webhookPublicKey: process.env.BLOB_WEBHOOK_PUBLIC_KEY || "brukes-ikke",
      getSignedToken: async (pathname) => {
        if (!/^dokumenter\/[0-9a-f-]{36}-[A-Za-z0-9._-]{1,120}$/.test(pathname)) {
          throw new Error("Ugyldig filsti");
        }
        const token = await issueSignedToken({
          pathname,
          operations: ["put"],
          maximumSizeInBytes: MAX_BYTES,
          validUntil: Date.now() + 10 * 60_000,
        });
        return { token, urlOptions: { maximumSizeInBytes: MAX_BYTES } };
      },
    });
    return NextResponse.json(result);
  } catch (error) {
    console.error("filer/upload: kunne ikke lage opplastings-URL", error);
    return NextResponse.json({ error: "Kunne ikke starte opplastingen. Prøv igjen." }, { status: 400 });
  }
}
