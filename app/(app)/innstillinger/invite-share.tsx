"use client";

import { useState } from "react";
import { Copy, Share2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function InviteShare({ code, appUrl, compact }: { code: string; appUrl: string; compact?: boolean }) {
  const [copied, setCopied] = useState(false);
  const link = `${appUrl || (typeof window !== "undefined" ? window.location.origin : "")}/bli-med/${code}`;

  async function share() {
    if (navigator.share) {
      try {
        await navigator.share({ title: "Bli med i familien", url: link });
        return;
      } catch {
        // avbrutt — fall tilbake til kopiering
      }
    }
    await navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{compact ? "Invitasjonskode" : "Inviter samboeren din"}</CardTitle>
        {!compact ? (
          <p className="text-xs text-[var(--color-muted)]">Send lenken. Hen lager konto og havner rett i familien.</p>
        ) : null}
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <p className="text-center font-mono text-2xl font-bold tracking-widest">{code}</p>
        <Button type="button" variant={compact ? "outline" : "default"} onClick={share}>
          {copied ? <Copy className="h-4 w-4" aria-hidden /> : <Share2 className="h-4 w-4" aria-hidden />}
          {copied ? "Lenke kopiert" : "Del invitasjonslenke"}
        </Button>
      </CardContent>
    </Card>
  );
}
