import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    optimizePackageImports: ["lucide-react"],
    // Kort klient-cache av RSC-payload så hopp mellom bunnfaner føles instant.
    // router.refresh() invaliderer umiddelbart etter mutasjoner.
    staleTimes: {
      dynamic: 15,
      static: 180,
    },
  },
};

export default nextConfig;
