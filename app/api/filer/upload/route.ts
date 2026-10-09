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

  const body = (await request.json()) as HandleUploadPresignedBody;
  try {
    const result = await handleUploadPresigned({
      body,
      request,
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
    return NextResponse.json({ error: error instanceof Error ? error.message : "Opplasting feilet" }, { status: 400 });
  }
}
