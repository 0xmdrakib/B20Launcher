export const b20LaunchRouterAbi = [
  {
    type: "function",
    name: "launchAsset",
    stateMutability: "nonpayable",
    inputs: [
      {
        name: "launch",
        type: "tuple",
        components: [
          {
            name: "common",
            type: "tuple",
            components: [
              { name: "name", type: "string" },
              { name: "symbol", type: "string" },
              { name: "admin", type: "address" },
              { name: "salt", type: "bytes32" },
              { name: "contractURI", type: "string" },
              { name: "supplyCap", type: "uint256" },
              {
                name: "roleGrants",
                type: "tuple[]",
                components: [
                  { name: "role", type: "bytes32" },
                  { name: "account", type: "address" }
                ]
              },
              {
                name: "initialMints",
                type: "tuple[]",
                components: [
                  { name: "recipient", type: "address" },
                  { name: "amount", type: "uint256" }
                ]
              },
              {
                name: "policies",
                type: "tuple[]",
                components: [
                  { name: "scope", type: "bytes32" },
                  { name: "policyId", type: "uint64" }
                ]
              },
              { name: "pauseFeatures", type: "uint8[]" }
            ]
          },
          { name: "decimals", type: "uint8" },
          {
            name: "extraMetadata",
            type: "tuple[]",
            components: [
              { name: "key", type: "string" },
              { name: "value", type: "string" }
            ]
          },
          { name: "multiplier", type: "uint256" }
        ]
      }
    ],
    outputs: [{ name: "token", type: "address" }]
  },
  {
    type: "function",
    name: "launchStablecoin",
    stateMutability: "nonpayable",
    inputs: [
      {
        name: "launch",
        type: "tuple",
        components: [
          {
            name: "common",
            type: "tuple",
            components: [
              { name: "name", type: "string" },
              { name: "symbol", type: "string" },
              { name: "admin", type: "address" },
              { name: "salt", type: "bytes32" },
              { name: "contractURI", type: "string" },
              { name: "supplyCap", type: "uint256" },
              {
                name: "roleGrants",
                type: "tuple[]",
                components: [
                  { name: "role", type: "bytes32" },
                  { name: "account", type: "address" }
                ]
              },
              {
                name: "initialMints",
                type: "tuple[]",
                components: [
                  { name: "recipient", type: "address" },
                  { name: "amount", type: "uint256" }
                ]
              },
              {
                name: "policies",
                type: "tuple[]",
                components: [
                  { name: "scope", type: "bytes32" },
                  { name: "policyId", type: "uint64" }
                ]
              },
              { name: "pauseFeatures", type: "uint8[]" }
            ]
          },
          { name: "currency", type: "string" }
        ]
      }
    ],
    outputs: [{ name: "token", type: "address" }]
  },
  {
    type: "event",
    name: "PlatformB20Launched",
    inputs: [
      { name: "issuer", type: "address", indexed: true },
      { name: "token", type: "address", indexed: true },
      { name: "variant", type: "uint8", indexed: true },
      { name: "salt", type: "bytes32", indexed: false },
      { name: "contractURI", type: "string", indexed: false }
    ]
  }
] as const;

export const b20FactoryAbi = [
  {
    type: "function",
    name: "getB20Address",
    stateMutability: "view",
    inputs: [
      { name: "variant", type: "uint8" },
      { name: "sender", type: "address" },
      { name: "salt", type: "bytes32" }
    ],
    outputs: [{ name: "token", type: "address" }]
  },
  {
    type: "function",
    name: "isB20Initialized",
    stateMutability: "view",
    inputs: [{ name: "token", type: "address" }],
    outputs: [{ name: "initialized", type: "bool" }]
  }
] as const;
