"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Fingerprint, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Segmented } from "@/components/ui/segmented";
import { authClient } from "@/lib/auth-client";

type Mode = "login" | "signup";

export function LoginForm({ next }: { next: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showHelp, setShowHelp] = useState(false);

  function done() {
    router.replace(next);
    router.refresh();
  }

  // Face ID-forslag rett i e-postfeltet (passkey-autofyll) når nettleseren støtter det.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (typeof PublicKeyCredential === "undefined") return;
      const available = await PublicKeyCredential.isConditionalMediationAvailable?.().catch(() => false);
      if (!available || cancelled) return;
      const { data } = await authClient.signIn.passkey({ autoFill: true });
      if (data && !cancelled) done();
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function passkeyLogin() {
    setBusy(true);
    setError(null);
    const { error: err } = await authClient.signIn.passkey();
    setBusy(false);
    if (err) {
      setError("Fant ingen Face ID-nøkkel for denne enheten. Logg inn med passord, og slå på Face ID under Innstillinger.");
      return;
    }
    done();
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error: err } =
      mode === "login"
        ? await authClient.signIn.email({ email, password, rememberMe: true })
        : await authClient.signUp.email({ email, password, name: email.split("@")[0] });
    setBusy(false);
    if (err) {
      setError(translate(err.message ?? "", err.status));
      return;
    }
    done();
  }

  return (
    <div className="flex flex-col gap-5">
      <Button type="button" size="lg" variant="secondary" onClick={passkeyLogin} disabled={busy}>
        <Fingerprint className="h-5 w-5" aria-hidden /> Logg inn med Face ID
      </Button>

      <div className="flex items-center gap-3 text-xs text-[var(--color-muted)]">
        <span className="h-px flex-1 bg-[var(--color-border)]" /> eller <span className="h-px flex-1 bg-[var(--color-border)]" />
      </div>

      <Segmented
        label="Velg"
        value={mode}
        onChange={(m) => {
          setMode(m);
          setError(null);
        }}
        options={[
          { value: "login", label: "Logg inn" },
          { value: "signup", label: "Første gang" },
        ]}
      />

      <form onSubmit={submit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="email">E-post</Label>
          <Input
            id="email"
            type="email"
            inputMode="email"
            autoComplete="username webauthn"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="password">{mode === "signup" ? "Velg passord" : "Passord"}</Label>
          <Input
            id="password"
            type="password"
            autoComplete={mode === "signup" ? "new-password" : "current-password"}
            required
            minLength={8}
            placeholder={mode === "signup" ? "Minst 8 tegn" : undefined}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <Button type="submit" size="lg" disabled={busy}>
          {busy ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> : null}
          {mode === "login" ? "Logg inn" : "Lag konto"}
        </Button>
        {error ? (
          <p role="alert" className="text-sm text-[var(--color-danger)]">
            {error}
          </p>
        ) : null}
      </form>

      <button
        type="button"
        onClick={() => setShowHelp((v) => !v)}
        className="min-h-11 text-sm text-[var(--color-muted)] underline underline-offset-2"
        aria-expanded={showHelp}
      >
        Glemt passord?
      </button>
      {showHelp ? (
        <p className="text-sm text-[var(--color-muted)]">
          Har du slått på Face ID, kan du logge inn med det. Ellers kan den andre voksne i familien sette et nytt
          passord for deg under Innstillinger.
        </p>
      ) : null}
    </div>
  );
}

function translate(message: string, status?: number): string {
  const m = message.toLowerCase();
  if (status === 403 || m.includes("tilgang")) return "Denne e-posten har ikke tilgang til appen.";
  if (m.includes("invalid email or password") || m.includes("invalid password")) return "Feil e-post eller passord.";
  if (m.includes("already exists") || m.includes("already")) return "Det finnes allerede en konto med denne e-posten. Logg inn i stedet.";
  if (m.includes("password") && m.includes("short")) return "Passordet må være minst 8 tegn.";
  if (m.includes("too many") || status === 429) return "For mange forsøk. Vent litt og prøv igjen.";
  return "Noe gikk galt. Prøv igjen.";
}
