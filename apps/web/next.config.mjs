import path from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(__dirname, "../..");

loadEnv({ path: path.join(workspaceRoot, ".env.local"), override: false, quiet: true });
loadEnv({ path: path.join(workspaceRoot, ".env"), override: false, quiet: true });

/** @type {import('next').NextConfig} */
const nextConfig = {
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
