import assert from "node:assert/strict";
import test from "node:test";
import { extractConsumerRecord } from "./check-token-visibility.mjs";

const token = `0x${"ab".repeat(20)}`;
const other = `0x${"cd".repeat(20)}`;

test("does not attribute a DEX pair base-token logo to the requested quote token", () => {
  const pair = { chainId: "base", baseToken: { address: other }, quoteToken: { address: token }, info: { imageUrl: "https://cdn.dexscreener.com/other.png" } };
  assert.deepEqual(extractConsumerRecord("dexscreener", 200, [pair], token), { state: "logo_missing", pairCount: 1, imageUrls: [] });
  pair.baseToken.address = token.toUpperCase();
  pair.quoteToken.address = other;
  assert.equal(extractConsumerRecord("dexscreener", 200, [pair], token).state, "image_reported");
  pair.chainId = "ethereum";
  assert.equal(extractConsumerRecord("dexscreener", 200, [pair], token).state, "no_indexed_pair");
});

test("requires chain and address identity before accepting GeckoTerminal images", () => {
  const data = { data: { id: `base_${token}`, attributes: { address: token, image_url: "https://assets.geckoterminal.com/test" } } };
  assert.equal(extractConsumerRecord("geckoterminal", 200, data, token).state, "image_reported");
  data.data.id = `eth_${token}`;
  assert.equal(extractConsumerRecord("geckoterminal", 200, data, token).state, "identity_mismatch");
  assert.equal(extractConsumerRecord("geckoterminal", 429, {}, token).state, "request_failed");
  assert.equal(extractConsumerRecord("geckoterminal", 404, {}, token).state, "not_indexed");
});

test("requires the explorer's actual token record and a nonempty icon", () => {
  assert.equal(extractConsumerRecord("blockscout", 200, { address_hash: other, icon_url: "https://example.org/image" }, token).state, "identity_mismatch");
  assert.equal(extractConsumerRecord("blockscout", 200, { address_hash: token, icon_url: null }, token).state, "logo_missing");
  assert.equal(extractConsumerRecord("blockscout", 200, { address_hash: token, icon_url: "https://example.org/image" }, token).state, "image_reported");
});
