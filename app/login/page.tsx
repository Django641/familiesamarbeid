import { APP_NAME, APP_TAGLINE } from "@/lib/config";

import { LoginForm } from "./login-form";

export const metadata = { title: "Logg inn" };

export default function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ message?: string; next?: string; mode?: string }>;
}) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-5 py-10">
      <div className="mb-8 text-center">
        <h1 className="text-3xl font-bold text-[var(--color-primary)]">{APP_NAME}</h1>
        <p className="mt-2 text-[var(--color-muted)]">{APP_TAGLINE}</p>
      </div>
      <LoginForm searchParamsPromise={searchParams} />
    </main>
  );
}
