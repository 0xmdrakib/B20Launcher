import { getAddress, isAddress, type Address } from "viem";

export type WalletToken = { address: string; name: string; symbol: string; decimals: number; logoURI: string };
type TokenWallet = {
  getChainId: () => Promise<number>;
  watchAsset: (args: { type: "ERC20"; options: { address: Address; symbol: string; decimals: number; image: string } }) => Promise<boolean>;
};

export async function watchToken(wallet: TokenWallet, token: WalletToken) {
  if (!isAddress(token.address, { strict: false })) throw new Error("Invalid token address.");
  const image = new URL(token.logoURI);
  if (image.protocol !== "https:" || image.username || image.password) throw new Error("Invalid token image URL.");
  if (!Number.isInteger(token.decimals) || token.decimals < 0 || token.decimals > 255) throw new Error("Invalid token decimals.");
  if (await wallet.getChainId() !== 8453) throw new Error("Switch your wallet to Base and try again.");
  return wallet.watchAsset({
    type: "ERC20",
    options: { address: getAddress(token.address), symbol: token.symbol, decimals: token.decimals, image: image.href }
  });
}
