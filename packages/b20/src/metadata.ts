import { z } from "zod";

export const contractMetadataSchema = z.object({
  name: z.string().min(1).max(128),
  symbol: z.string().min(1).max(32).optional(),
  description: z.string().max(2000).optional(),
  image: z.string().url().or(z.string().startsWith("ipfs://")).optional(),
  banner_image: z.string().url().or(z.string().startsWith("ipfs://")).optional(),
  featured_image: z.string().url().or(z.string().startsWith("ipfs://")).optional(),
  external_link: z.string().url().optional(),
  collaborators: z.array(z.string()).optional(),
  b20: z
    .object({
      platform: z.string(),
      variant: z.enum(["asset", "stablecoin"]),
      chainId: z.number().int(),
      preparedAt: z.string(),
      logoCid: z.string().optional(),
      metadataCid: z.string().optional()
    })
    .optional()
});

export type ContractMetadata = z.infer<typeof contractMetadataSchema>;

export function buildContractMetadata(input: {
  name: string;
  symbol: string;
  description?: string | undefined;
  image?: string | undefined;
  externalLink?: string | undefined;
  variant: "asset" | "stablecoin";
  chainId: number;
  logoCid?: string | undefined;
  metadataCid?: string | undefined;
}): ContractMetadata {
  return contractMetadataSchema.parse({
    name: input.name,
    symbol: input.symbol,
    description: input.description,
    image: input.image,
    external_link: input.externalLink,
    b20: {
      platform: "b20-launcher",
      variant: input.variant,
      chainId: input.chainId,
      preparedAt: new Date().toISOString(),
      logoCid: input.logoCid,
      metadataCid: input.metadataCid
    }
  });
}
