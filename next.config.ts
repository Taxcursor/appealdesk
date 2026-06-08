import type { NextConfig } from "next";

// Derive the Supabase storage hostname from the env var so the image
// allow-list can never drift out of sync with the actual project URL.
const supabaseHostname = (() => {
  try {
    return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").hostname;
  } catch {
    return undefined;
  }
})();

const nextConfig: NextConfig = {
  devIndicators: false,
  images: {
    remotePatterns: [
      ...(supabaseHostname
        ? [{ protocol: "https" as const, hostname: supabaseHostname }]
        : [
            {
              protocol: "https" as const,
              hostname: "ulctjnzadowpxcxpnwdz.supabase.co",
            },
          ]),
    ],
  },
};

export default nextConfig;
