import { cookies } from "next/headers";

import { NavTracker } from "@/components/back-button";
import { LiveSync } from "@/components/live-sync";
import { MobileNav } from "@/components/mobile-nav";
import { ServiceWorkerRegister } from "@/components/service-worker-register";
import { BOTTOM_NAV_COOKIE } from "@/lib/config";
import { parseNavCookie } from "@/lib/nav-items";
import { getFamily } from "@/lib/session";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const [, cookieStore] = await Promise.all([getFamily(), cookies()]); // getFamily: innlogget + fullført oppstart
  const nav = parseNavCookie(cookieStore.get(BOTTOM_NAV_COOKIE)?.value);
  return (
    <div className="min-h-dvh pb-24">
      <ServiceWorkerRegister />
      <LiveSync />
      <NavTracker />
      {children}
      <MobileNav selected={nav} />
    </div>
  );
}
