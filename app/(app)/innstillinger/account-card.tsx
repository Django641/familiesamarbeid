"use client";

import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { authClient } from "@/lib/auth-client";

export function AccountCard({ email }: { email: string | null }) {
  const router = useRouter();
  async function logout() {
    await authClient.signOut();
    router.replace("/login");
    router.refresh();
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Konto</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {email ? <p className="text-sm text-[var(--color-muted)]">Logget inn som {email}</p> : null}
        <Button variant="outline" onClick={logout}>
          <LogOut className="h-4 w-4" aria-hidden /> Logg ut
        </Button>
      </CardContent>
    </Card>
  );
}
