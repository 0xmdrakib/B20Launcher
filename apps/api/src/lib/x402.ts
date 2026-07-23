import type { RequestHandler } from "express";
import { HTTPFacilitatorClient } from "@x402/core/server";
import { paymentMiddleware, x402ResourceServer } from "@x402/express";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { BUILDER_CODE, declareBuilderCodeExtension } from "@x402/extensions/builder-code";

import type { config as appConfig } from "../config.js";

type AppConfig = typeof appConfig;

export function createX402Middleware(config: AppConfig): RequestHandler[] {
  if (!config.X402_ENABLED) {
    return [
      (_req, res, next) => {
        res.setHeader("X-B20-X402-Mode", "disabled-local-development");
        next();
      }
    ];
  }

  const facilitatorClient = new HTTPFacilitatorClient({ url: config.X402_FACILITATOR_URL });
  const network = config.X402_NETWORK as `${string}:${string}`;
  const server = new x402ResourceServer(facilitatorClient).register(
    network,
    new ExactEvmScheme()
  );

  return [
    paymentMiddleware(
      {
        "POST /x402/b20/build": {
          accepts: [
            {
              scheme: "exact",
              price: config.X402_PRICE,
              network,
              payTo: config.X402_PAY_TO
            }
          ],
          description: "Build a validated unsigned Base B20 launch transaction package.",
          mimeType: "application/json",
          extensions: {
            [BUILDER_CODE]: declareBuilderCodeExtension(config.BASE_BUILDER_CODE)
          }
        }
      },
      server
    )
  ];
}
