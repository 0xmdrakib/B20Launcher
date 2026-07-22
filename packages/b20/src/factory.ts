import { encodeAbiParameters, type Address, type Hex } from "viem";

import { B20_CREATE_PARAMS_VERSION } from "./constants.js";

export function encodeAssetCreateParams(input: {
  name: string;
  symbol: string;
  initialAdmin: Address;
  decimals: number;
}): Hex {
  return encodeAbiParameters(
    [
      {
        type: "tuple",
        components: [
          { name: "version", type: "uint8" },
          { name: "name", type: "string" },
          { name: "symbol", type: "string" },
          { name: "initialAdmin", type: "address" },
          { name: "decimals", type: "uint8" }
        ]
      }
    ],
    [
      {
        version: B20_CREATE_PARAMS_VERSION,
        name: input.name,
        symbol: input.symbol,
        initialAdmin: input.initialAdmin,
        decimals: input.decimals
      }
    ]
  );
}

export function encodeStablecoinCreateParams(input: {
  name: string;
  symbol: string;
  initialAdmin: Address;
  currency: string;
}): Hex {
  return encodeAbiParameters(
    [
      {
        type: "tuple",
        components: [
          { name: "version", type: "uint8" },
          { name: "name", type: "string" },
          { name: "symbol", type: "string" },
          { name: "initialAdmin", type: "address" },
          { name: "currency", type: "string" }
        ]
      }
    ],
    [
      {
        version: B20_CREATE_PARAMS_VERSION,
        name: input.name,
        symbol: input.symbol,
        initialAdmin: input.initialAdmin,
        currency: input.currency
      }
    ]
  );
}
