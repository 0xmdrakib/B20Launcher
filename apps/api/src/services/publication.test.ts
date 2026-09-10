import { randomUUID } from "node:crypto";
import sharp from "sharp";
import Hash from "ipfs-only-hash";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { verifyMessage } from "viem";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { config } from "../config.js";
import { store } from "./store.js";
import { bindMetadataStage, commitMetadata, prepareMetadata, publicationChallenge, publishMetadata } from "./ipfs.js";

const rpc = vi.hoisted(() => ({ verifyMessage: vi.fn(), getBlockNumber: vi.fn(), getTransaction: vi.fn(), getTransactionReceipt: vi.fn() }));
const upload = vi.hoisted(() => vi.fn());
vi.mock("viem", async original => ({ ...await original<typeof import("viem")>(), createPublicClient: () => rpc }));
vi.mock("./lighthouse.js", () => ({ uploadToLighthouse: upload }));
const router = "0x1111111111111111111111111111111111111111" as const;
const txHash = `0x${"ab".repeat(32)}` as const;
const stages: string[] = [];

beforeEach(() => {
  config.B20_LAUNCH_ROUTER_ADDRESS = router;
  config.LIGHTHOUSE_API_KEY = "test-only";
  config.PUBLICATION_DAILY_LIMIT = 100;
  rpc.verifyMessage.mockImplementation(verifyMessage);
  rpc.getBlockNumber.mockResolvedValue(100n);
  upload.mockImplementation(async (body: Buffer | string) => ({ Hash: await Hash.of(body, { cidVersion: 1 }) }));
});
afterEach(async () => {
  vi.clearAllMocks(); vi.unstubAllGlobals();
  await Promise.all(stages.splice(0).map(id => store.deleteMetadataStage(id)));
});
async function fixture() {
  const account = privateKeyToAccount(generatePrivateKey());
  const body = await sharp({ create: { width: 128, height: 128, channels: 4, background: "blue" } }).png().toBuffer();
  const prepared = await prepareMetadata({ name: "Prelaunch", symbol: "PRE" }, { buffer: body, size: body.length, mimetype: "image/png", originalname: "logo.png" });
  stages.push(prepared.stageId);
  const idempotencyKey = randomUUID();
  await store.saveLaunch({ idempotencyKey, predictedToken: router, payload: {}, createdAt: new Date().toISOString() });
  await bindMetadataStage({ stageId: prepared.stageId, stageToken: prepared.stageToken, contractURI: prepared.contract.uri, idempotencyKey, to: router, attributedData: "0x1234" });
  const approval = { stageId: prepared.stageId, stageToken: prepared.stageToken!, account: account.address, idempotencyKey };
  const challenge = await publicationChallenge(approval);
  const signature = await account.signMessage({ message: challenge.message });
  const stage = (await store.getMetadataStage(prepared.stageId))!;
  vi.stubGlobal("fetch", vi.fn(async (url: string) => new Response(url.endsWith(prepared.logo.cid) ? new Uint8Array(stage.logoBody!) : stage.contractBody!, { headers: { "Content-Type": url.endsWith(prepared.logo.cid) ? "image/png" : "application/json" } })));
  return { prepared, approval, challenge, signature };
}
describe("wallet-authorized prepublication", () => {
  it("verifies both public files before launch, locks the package, and avoids uploading again after confirmation", async () => {
    const f = await fixture();
    expect(upload).not.toHaveBeenCalled();
    const ready = await publishMetadata({ ...f.approval, deadline: f.challenge.deadline, signature: f.signature });
    expect(ready.storage).toMatchObject({ status: "ready", verified: true });
    expect(ready.gatewayHealth).toHaveLength(2);
    expect(upload).toHaveBeenCalledTimes(2);
    await expect(bindMetadataStage({ stageId: f.prepared.stageId, stageToken: f.prepared.stageToken, contractURI: f.prepared.contract.uri, idempotencyKey: "modified", to: router, attributedData: "0xabcd" })).rejects.toMatchObject({ status: 409 });
    rpc.getTransaction.mockResolvedValue({ to: router, input: "0x1234" });
    rpc.getTransactionReceipt.mockResolvedValue({ status: "success", transactionHash: txHash });
    expect((await commitMetadata({ ...f.approval, txHash })).storage.status).toBe("committed");
    expect(upload).toHaveBeenCalledTimes(2);
  });
  it("rejects signatures from another wallet and expired challenges without using storage", async () => {
    const f = await fixture();
    const wrongSignature = await privateKeyToAccount(generatePrivateKey()).signMessage({ message: f.challenge.message });
    await expect(publishMetadata({ ...f.approval, deadline: f.challenge.deadline, signature: wrongSignature })).rejects.toMatchObject({ status: 403 });
    await expect(publishMetadata({ ...f.approval, deadline: 100, signature: f.signature })).rejects.toMatchObject({ status: 410 });
    await expect(publicationChallenge({ ...f.approval, stageToken: "x".repeat(43) })).rejects.toMatchObject({ status: 403 });
    expect(upload).not.toHaveBeenCalled();
  });
  it("fails closed when the gateway serves different bytes", async () => {
    const f = await fixture();
    vi.stubGlobal("fetch", vi.fn(async () => new Response("wrong content")));
    await expect(publishMetadata({ ...f.approval, deadline: f.challenge.deadline, signature: f.signature })).rejects.toMatchObject({ status: 502 });
    const stage = (await store.getMetadataStage(f.prepared.stageId))!;
    expect(stage.status).toBe("publishing");
    expect((stage.prepared as typeof f.prepared).storage.verified).toBe(false);
    expect(stage.logoBody).toBeDefined();
  });
  it("invalidates a signature if a quote is rebound while the wallet prompt is open", async () => {
    const f = await fixture();
    await bindMetadataStage({ stageId: f.prepared.stageId, stageToken: f.prepared.stageToken, contractURI: f.prepared.contract.uri, idempotencyKey: f.approval.idempotencyKey, to: router, attributedData: "0xabcd" });
    await expect(publishMetadata({ ...f.approval, deadline: f.challenge.deadline, signature: f.signature })).rejects.toMatchObject({ status: 403 });
    expect(upload).not.toHaveBeenCalled();
  });
  it("enforces the global paid-storage budget before uploading", async () => {
    const f = await fixture();
    config.PUBLICATION_DAILY_LIMIT = 1;
    await store.consumeRateLimit("publication:global", 1, 86400_000);
    await expect(publishMetadata({ ...f.approval, deadline: f.challenge.deadline, signature: f.signature })).rejects.toMatchObject({ status: 429 });
    expect(upload).not.toHaveBeenCalled();
  });
  it("atomically rejects a rebind after signature verification started", async () => {
    const f = await fixture();
    rpc.verifyMessage.mockImplementationOnce(async (args) => {
      await store.bindMetadataStage(f.prepared.stageId, { idempotencyKey: f.approval.idempotencyKey, to: router, attributedData: "0xabcd" });
      return verifyMessage(args);
    });
    await expect(publishMetadata({ ...f.approval, deadline: f.challenge.deadline, signature: f.signature })).rejects.toMatchObject({ status: 409 });
    expect(upload).not.toHaveBeenCalled();
  });
});
