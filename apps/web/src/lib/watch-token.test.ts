import { describe, expect, it, vi } from "vitest";
import { watchToken } from "./watch-token";

const token = { address: "0xb200000000000000000000D9B4BfBC70F8929C64", name: "B20 Logo Test", symbol: "B20TEST", decimals: 18, logoURI: "https://protective-walrus-h5noy.lighthouseweb3.xyz/ipfs/bafybeiexqpn5tbibpp23cqlp6vpwcw3nlox4euockfy2fc7i4kmf4kp2tu" };

describe("wallet token import", () => {
  it("passes the real image and decimals to the wallet, preserving declined requests", async () => {
    const wallet = { getChainId: vi.fn().mockResolvedValue(8453), watchAsset: vi.fn().mockResolvedValue(false) };
    expect(await watchToken(wallet, token)).toBe(false);
    expect(wallet.watchAsset).toHaveBeenCalledWith({ type: "ERC20", options: { address: token.address, symbol: token.symbol, decimals: 18, image: token.logoURI } });
  });
  it("never imports on the wrong chain or passes a local image URL", async () => {
    const wallet = { getChainId: vi.fn().mockResolvedValue(1), watchAsset: vi.fn() };
    await expect(watchToken(wallet, token)).rejects.toThrow("Switch your wallet to Base");
    await expect(watchToken(wallet, { ...token, logoURI: "blob:private-preview" })).rejects.toThrow("Invalid token image URL");
    expect(wallet.watchAsset).not.toHaveBeenCalled();
  });
});
