import path from "node:path";

import { config as loadEnv } from "dotenv";

import { getAddress, isAddress, type Address } from "viem";
import { z } from "zod";

import { BASE_MAINNET_CHAIN_ID, ZERO_ADDRESS } from "@base-b20/b20";

import { DEFAULT_LIGHTHOUSE_GATEWAY_URL, normalizeLighthouseGatewayUrl } from "./lib/lighthouse-gateway.js";

export const CDP_X402_FACILITATOR_URL = "https://api.cdp.coinbase.com/platform/v2/x402";

const cwd = process.cwd();
const workspaceRoot =
  path.basename(cwd) === "api" && path.basename(path.dirname(cwd)) === "apps"
    ? path.resolve(cwd, "../..")
    : cwd;

loadEnv({ path: path.join(workspaceRoot, ".env.local"), override: false, quiet: true });
loadEnv({ path: path.join(workspaceRoot, ".env"), override: false, quiet: true });

const rawConfigSchema = z.object({
  NODE_ENV: z.string().optional().default("development"),
  VERCEL_ENV: z.string().optional().default("development"),
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
    .default(DEFAULT_LIGHTHOUSE_GATEWAY_URL),
  DATABASE_URL: z.string().optional().default(""),
  CDP_API_KEY_ID: z.string().optional().default(""),
  CDP_API_KEY_SECRET: z.string().optional().default(""),
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
    .default(CDP_X402_FACILITATOR_URL)
});

const normalizedEnv = Object.fromEntries(
  Object.entries(process.env).map(([key, value]) => [key, value === "" ? undefined : value])
);
const parsed = rawConfigSchema.parse(normalizedEnv);
const {
  CDP_API_KEY_ID: cdpApiKeyId,
  CDP_API_KEY_SECRET: cdpApiKeySecret,
  ...safeParsed
} = parsed;
const effectiveX402Enabled =
  parsed.X402_ENABLED && parsed.VERCEL_ENV !== "preview";

function optionalAddress(value: string, key: string): Address {
  if (!isAddress(value)) {
    throw new Error(`${key} must be a valid EVM address`);
  }
  return getAddress(value) as Address;
}

export const config = {
  ...safeParsed,
  X402_ENABLED: effectiveX402Enabled,
  LIGHTHOUSE_GATEWAY_URL: normalizeLighthouseGatewayUrl(parsed.LIGHTHOUSE_GATEWAY_URL),
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

if (config.X402_ENABLED && !/^\$\d+(?:\.\d+)?$/.test(config.X402_PRICE)) {
  throw new Error('X402_PRICE must be a dollar-prefixed value such as "$0.01"');
}

if (config.X402_ENABLED && !/^eip155:\d+$/.test(config.X402_NETWORK)) {
  throw new Error("X402_NETWORK must use an EVM CAIP-2 identifier such as eip155:8453");
}

if (config.X402_ENABLED && config.X402_NETWORK !== `eip155:${config.BASE_CHAIN_ID}`) {
  throw new Error("X402_NETWORK must match BASE_CHAIN_ID for this Base-only application");
}

if (config.X402_ENABLED && config.X402_FACILITATOR_URL !== CDP_X402_FACILITATOR_URL) {
  throw new Error(`X402_FACILITATOR_URL must be ${CDP_X402_FACILITATOR_URL}`);
}

if (config.X402_ENABLED && (!cdpApiKeyId.trim() || !cdpApiKeySecret.trim())) {
  throw new Error("CDP_API_KEY_ID and CDP_API_KEY_SECRET are required when X402_ENABLED=true");
}
