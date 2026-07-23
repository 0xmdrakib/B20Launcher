import { HTTPFacilitatorClient, x402ResourceServer } from "@x402/core/server";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { BUILDER_CODE, declareBuilderCodeExtension } from "@x402/extensions/builder-code";
import { config } from "@base-b20/api/core";

export function createB20X402Server() {
  const facilitator = new HTTPFacilitatorClient({ url: config.X402_FACILITATOR_URL });
  return new x402ResourceServer(facilitator).register(
    config.X402_NETWORK as `${string}:${string}`,
    new ExactEvmScheme()
  );
}

export const b20X402Route = {
  accepts: {
    scheme: "exact" as const,
    price: config.X402_PRICE,
    network: config.X402_NETWORK as `${string}:${string}`,
    payTo: config.X402_PAY_TO
  },
  description: "Build a validated unsigned Base B20 launch transaction package.",
  mimeType: "application/json",
  extensions: {
    [BUILDER_CODE]: declareBuilderCodeExtension(config.BASE_BUILDER_CODE)
  }
};
