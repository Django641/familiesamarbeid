"use client";

import { useRouter } from "next/navigation";
import { use, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { safeNext } from "@/lib/safe-next";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

type Mode = "login" | "signup" | "forgot";

export function LoginForm({
  searchParamsPromise,
}: {
  searchParamsPromise: Promise<{ message?: string; next?: string; mode?: string }>;
}) {
  const router = useRouter();
  const params = use(searchParamsPromise);
  const [mode, setMode] = useState<Mode>(params.mode === "signup" ? "signup" : "login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const next = safeNext(params.next);

  // Bruk kanonisk app-URL fra env hvis satt, ellers gjeldende origin
  function appOrigin(): string {
    const fromEnv = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
    if (fromEnv) return fromEnv;
    return window.location.origin;
  }

  function setTab(m: "login" | "signup") {
    setMode(m);
    setError(null);
    setInfo(null);
    setConfirm("");
  }

  async function handlePassword(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setInfo(null);
    const supabase = createClient();

    if (mode === "login") {
      const { error: err } = await supabase.auth.signInWithPassword({ email, password });
      setBusy(false);
      if (err) {
        setError(translateAuthError(err.message));
        return;
      }
      router.replace(next);
      router.refresh();
      return;
    }

    if (mode === "signup") {
      if (password !== confirm) {
        setBusy(false);
        setError("Passordene er ikke like.");
        return;
      }
      // Etter e-postbekreftelse: gå via /auth/confirmed for en tydelig "✓ bekreftet"-melding
      const afterConfirm = `/auth/confirmed?next=${encodeURIComponent(next)}`;
      const redirectTo = `${appOrigin()}/auth/callback?next=${encodeURIComponent(afterConfirm)}`;
      const { data, error: err } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: redirectTo },
      });
      setBusy(false);
      if (err) {
        setError(translateAuthError(err.message));
        return;
      }
      if (data.session) {
        // E-postbekreftelse er av — logget inn umiddelbart
        router.replace(next);
        router.refresh();
      } else {
        // E-postbekreftelse er på — be brukeren sjekke innboksen
        setInfo(
          `Vi har sendt en bekreftelseslenke til ${email}. Klikk lenken i e-posten for å fullføre registreringen.`
        );
      }
    }
  }

  async function handleForgot(e: React.FormEvent) {
    e.preventDefault();
    if (!email) {
      setError("Skriv inn e-postadressen først.");
      return;
    }
    setBusy(true);
    setError(null);
    setInfo(null);
    const supabase = createClient();
    const redirectTo = `${appOrigin()}/auth/callback?next=${encodeURIComponent("/auth/reset-password")}`;
    const { error: err } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo,
    });
    setBusy(false);
    if (err) {
      setError(translateAuthError(err.message));
      return;
    }
    setInfo(
      `Vi har sendt en lenke til ${email} for å tilbakestille passordet. Klikk lenken i e-posten.`
    );
  }

  if (info) {
    return (
      <div className="rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5 text-center">
        <h2 className="text-lg font-semibold">Sjekk e-posten din</h2>
        <p className="mt-2 text-sm text-[var(--color-muted)]">{info}</p>
      </div>
    );
  }

  if (mode === "forgot") {
    return (
      <form onSubmit={handleForgot} className="flex flex-col gap-4">
        <div>
          <h2 className="text-lg font-semibold">Glemt passord</h2>
          <p className="mt-1 text-sm text-[var(--color-muted)]">
            Skriv inn e-posten din, så sender vi en lenke for å lage et nytt passord.
          </p>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="email">E-postadresse</Label>
          <Input
            id="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <Button type="submit" size="lg" disabled={busy}>
          {busy ? "Sender …" : "Send tilbakestillingslenke"}
        </Button>
        <button
          type="button"
          onClick={() => setTab("login")}
          className="text-sm text-[var(--color-muted)] underline"
        >
          Tilbake til innlogging
        </button>
        {error ? <p className="text-sm text-[var(--color-danger)]">{error}</p> : null}
      </form>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {params.message ? (
        <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900">{params.message}</p>
      ) : null}

      <div role="tablist" className="grid grid-cols-2 gap-2 rounded-xl bg-[var(--color-bg)] p-1">
        <button
          type="button"
          role="tab"
          aria-selected={mode === "login"}
          onClick={() => setTab("login")}
          className={cn(
            "h-10 rounded-lg text-sm font-medium transition-colors",
            mode === "login"
              ? "bg-[var(--color-surface)] text-[var(--color-text)] shadow-sm"
              : "text-[var(--color-muted)]"
          )}
        >
          Logg inn
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === "signup"}
          onClick={() => setTab("signup")}
          className={cn(
            "h-10 rounded-lg text-sm font-medium transition-colors",
            mode === "signup"
              ? "bg-[var(--color-surface)] text-[var(--color-text)] shadow-sm"
              : "text-[var(--color-muted)]"
          )}
        >
          Lag konto
        </button>
      </div>

      <form onSubmit={handlePassword} className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="email">E-postadresse</Label>
          <Input
            id="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            required
            placeholder="navn@eksempel.no"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="password">Passord</Label>
            {mode === "login" ? (
              <button
                type="button"
                onClick={() => {
                  setMode("forgot");
                  setError(null);
                  setInfo(null);
                }}
                className="text-xs text-[var(--color-muted)] underline"
              >
                Glemt passord?
              </button>
            ) : null}
          </div>
          <Input
            id="password"
            type="password"
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            required
            minLength={mode === "signup" ? 8 : undefined}
            placeholder={mode === "signup" ? "Minst 8 tegn" : "••••••••"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        {mode === "signup" ? (
          <div className="flex flex-col gap-2">
            <Label htmlFor="confirm">Gjenta passord</Label>
            <Input
              id="confirm"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              placeholder="Skriv passordet en gang til"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </div>
        ) : null}
        <Button type="submit" size="lg" disabled={busy}>
          {busy
            ? mode === "login"
              ? "Logger inn …"
              : "Oppretter konto …"
            : mode === "login"
              ? "Logg inn"
              : "Opprett konto"}
        </Button>
        {error ? <p className="text-sm text-[var(--color-danger)]">{error}</p> : null}
      </form>
    </div>
  );
}

function translateAuthError(msg: string): string {
  const m = msg.toLowerCase();
  if (m.includes("invalid login") || m.includes("invalid credentials")) {
    return "Feil e-post eller passord.";
  }
  if (m.includes("already registered") || m.includes("user already")) {
    return "Det finnes allerede en konto med denne e-posten. Logg inn i stedet.";
  }
  if (m.includes("password should be") || m.includes("password is too")) {
    return "Passordet er for kort. Bruk minst 8 tegn.";
  }
  if (m.includes("rate limit") || m.includes("too many")) {
    return "For mange forsøk. Vent litt og prøv igjen.";
  }
  if (m.includes("email not confirmed")) {
    return "E-posten er ikke bekreftet ennå. Sjekk innboksen for bekreftelseslenken.";
  }
  return msg;
}
