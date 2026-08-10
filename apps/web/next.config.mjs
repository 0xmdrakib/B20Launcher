import path from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(__dirname, "../..");

loadEnv({ path: path.join(workspaceRoot, ".env.local"), override: false, quiet: true });
loadEnv({ path: path.join(workspaceRoot, ".env"), override: false, quiet: true });

/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
          { key: "Strict-Transport-Security", value: "max-age=31536000" }
        ]
      }
    ];
  },
  transpilePackages: ["@base-b20/api"],
  serverExternalPackages: ["@lighthouse-web3/sdk", "postgres", "sharp"],
  experimental: {
    optimizePackageImports: ["lucide-react"]
  },
  turbopack: {
    root: workspaceRoot
  }
};

export default nextConfig;
