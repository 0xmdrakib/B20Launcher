import path from "node:path";

import { config as loadEnv } from "dotenv";

import { getAddress, isAddress, type Address } from "viem";
import { z } from "zod";

import { BASE_MAINNET_CHAIN_ID, ZERO_ADDRESS } from "@base-b20/b20";

const cwd = process.cwd();
const workspaceRoot =
  path.basename(cwd) === "api" && path.basename(path.dirname(cwd)) === "apps"
    ? path.resolve(cwd, "../..")
    : cwd;

loadEnv({ path: path.join(workspaceRoot, ".env.local"), override: false, quiet: true });
loadEnv({ path: path.join(workspaceRoot, ".env"), override: false, quiet: true });

const rawConfigSchema = z.object({
  NODE_ENV: z.string().optional().default("development"),
  API_PORT: z.coerce.number().int().positive().optional().default(4020),
  WEB_ORIGIN: z.string().optional().default("http://localhost:3000"),
  BASE_CHAIN_ID: z.coerce.number().int().positive().optional().default(BASE_MAINNET_CHAIN_ID),
  BASE_RPC_URL: z.string().url().optional().default("https://mainnet.base.org"),
  BASE_BUILDER_CODE: z.string().optional().default("your_builder_code"),
  B20_LAUNCH_ROUTER_ADDRESS: z.string().optional().default(ZERO_ADDRESS),
  LIGHTHOUSE_API_KEY: z.string().optional().default(""),
  LIGHTHOUSE_GATEWAY_URL: z
    .string()
    .url()
    .optional()
    .default("https://gateway.lighthouse.storage/ipfs"),
  DATABASE_URL: z.string().optional().default(""),
  X402_ENABLED: z
    .string()
    .optional()
    .default("false")
    .transform((value) => value === "true"),
  X402_PAY_TO: z.string().optional().default(ZERO_ADDRESS),
  X402_PRICE: z.string().optional().default(""),
  X402_NETWORK: z.string().optional().default("eip155:8453"),
  X402_FACILITATOR_URL: z
    .string()
    .optional()
    .default("")
});

const normalizedEnv = Object.fromEntries(
  Object.entries(process.env).map(([key, value]) => [key, value === "" ? undefined : value])
);
const parsed = rawConfigSchema.parse(normalizedEnv);

function optionalAddress(value: string, key: string): Address {
  if (!isAddress(value)) {
    throw new Error(`${key} must be a valid EVM address`);
  }
  return getAddress(value) as Address;
}

export const config = {
  ...parsed,
  B20_LAUNCH_ROUTER_ADDRESS: optionalAddress(
    parsed.B20_LAUNCH_ROUTER_ADDRESS,
    "B20_LAUNCH_ROUTER_ADDRESS"
  ),
  X402_PAY_TO: optionalAddress(parsed.X402_PAY_TO, "X402_PAY_TO")
};

if (config.X402_ENABLED && config.X402_PAY_TO === ZERO_ADDRESS) {
  throw new Error("X402_PAY_TO must be non-zero when X402_ENABLED=true");
}

if (config.X402_ENABLED && !config.X402_PRICE) {
  throw new Error("X402_PRICE is required when X402_ENABLED=true");
}
if (config.X402_ENABLED && !config.X402_FACILITATOR_URL) {
  throw new Error("X402_FACILITATOR_URL is required when X402_ENABLED=true");
}
