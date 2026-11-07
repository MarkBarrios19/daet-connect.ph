import type { NextConfig } from "next";

// Package and attraction photos live in Supabase Storage. next/image refuses
// remote hosts that are not listed, so allow the project's own host.
function supabaseImagePatterns(): NonNullable<NextConfig["images"]>["remotePatterns"] {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) return [];
  try {
    const { hostname, protocol } = new URL(url);
    return [
      {
        protocol: protocol === "http:" ? "http" : "https",
        hostname,
        pathname: "/storage/v1/object/**",
      },
    ];
  } catch {
    return [];
  }
}

// Headers that hold for every response. A strict Content-Security-Policy is not
// here yet: the maps, the photo gallery and the assistant all load from several
// origins, and a policy written without testing them would break pages quietly.
// These are safe to add without touching a feature.
const securityHeaders = [
  // Never let a browser guess a type: an uploaded file served as text/html is
  // how a stored-XSS gets a foothold.
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Send the full address within the site, only the origin elsewhere.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // No speculative DNS lookups to hosts a page has not asked for yet.
  { key: "X-DNS-Prefetch-Control", value: "off" },
  ...(process.env.NODE_ENV === "production"
    ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }]
    : []),
];

const nextConfig: NextConfig = {
  cacheComponents: true,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  // The Arena preview is hosted on a dynamic e2b.app subdomain. Allow its
  // origin for Next dev assets and Server Action requests through the proxy.
  allowedDevOrigins: ["*.e2b.app"],
  images: { remotePatterns: supabaseImagePatterns() },
  // Registration sends small document uploads through a Server Action. Each
  // guide file is independently capped and validated on the server.
  experimental: {
    serverActions: {
      allowedOrigins: ["*.e2b.app"],
      bodySizeLimit: "18mb",
    },
  },
};

export default nextConfig;
