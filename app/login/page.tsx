import { redirect } from "next/navigation";

import { APP_NAME, APP_TAGLINE } from "@/lib/config";
import { safeNext } from "@/lib/safe-next";
import { getSession } from "@/lib/session";

import { LoginForm } from "./login-form";

export const metadata = { title: "Logg inn" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const [{ next }, session] = await Promise.all([searchParams, getSession()]);
  if (session) redirect(safeNext(next));

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-5 py-10">
      <div className="mb-8 text-center">
        <h1 className="text-3xl font-bold text-[var(--color-primary)]">{APP_NAME}</h1>
        <p className="mt-2 text-[var(--color-muted)]">{APP_TAGLINE}</p>
      </div>
      <LoginForm next={safeNext(next)} />
    </main>
  );
}
