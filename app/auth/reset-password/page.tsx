import { APP_NAME } from "@/lib/config";

import { ResetPasswordForm } from "./form";

export const metadata = { title: "Nytt passord" };

export default function ResetPasswordPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-5 py-10">
      <div className="mb-8 text-center">
        <h1 className="text-3xl font-bold text-[var(--color-primary)]">{APP_NAME}</h1>
        <p className="mt-2 text-[var(--color-muted)]">Velg et nytt passord</p>
      </div>
      <ResetPasswordForm />
    </main>
  );
}
