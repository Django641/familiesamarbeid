import { MobileNav } from "@/components/mobile-nav";
import { RealtimeSync } from "@/components/realtime-sync";
import { ServiceWorkerRegister } from "@/components/service-worker-register";
import { getHousehold } from "@/lib/household";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { household } = await getHousehold();
  return (
    <div className="min-h-dvh pb-24">
      <ServiceWorkerRegister />
      <RealtimeSync householdId={household.id} />
      {children}
      <MobileNav />
    </div>
  );
}
