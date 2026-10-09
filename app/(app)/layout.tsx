import { LiveSync } from "@/components/live-sync";
import { MobileNav } from "@/components/mobile-nav";
import { ServiceWorkerRegister } from "@/components/service-worker-register";
import { getFamily } from "@/lib/session";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await getFamily(); // innlogget + har fullført oppstart
  return (
    <div className="min-h-dvh pb-24">
      <ServiceWorkerRegister />
      <LiveSync />
      {children}
      <MobileNav />
    </div>
  );
}
