import sharp from "sharp";
import { afterEach, describe, expect, it } from "vitest";

import { bindMetadataStage, MAX_LOGO_BYTES, prepareMetadata } from "./ipfs.js";
import { store } from "./store.js";

const router = "0x1111111111111111111111111111111111111111" as const;
const attributedData = "0x1234" as const;

async function logoFile(sizeOverride?: number): Promise<Express.Multer.File> {
  const buffer = await sharp({
    create: {
      width: 256,
      height: 256,
      channels: 4,
      background: { r: 0, g: 82, b: 255, alpha: 1 }
    }
  })
    .png()
    .toBuffer();

  return {
    fieldname: "logo",
    originalname: "logo.png",
    encoding: "7bit",
    mimetype: "image/png",
    size: sizeOverride ?? buffer.length,
    destination: "",
    filename: "logo.png",
    path: "",
    buffer,
    stream: undefined as never
  };
}

describe("protected metadata staging", () => {
  const stageIds: string[] = [];

  afterEach(async () => {
    await Promise.all(stageIds.splice(0).map((stageId) => store.deleteMetadataStage(stageId)));
  });

  it("keeps bytes off Lighthouse and requires the private stage credentials", async () => {
    const prepared = await prepareMetadata(
      {
        name: "Secure Logo",
        symbol: "SLOGO",
        description: "A protected metadata stage",
        externalLink: "https://example.com",
        variant: "asset"
      },
      await logoFile()
    );
    stageIds.push(prepared.stageId);

    expect(prepared.logo.provider).toBe("staged");
    expect(prepared.storage.verified).toBe(false);
    expect(prepared.stageToken).toMatch(/^[A-Za-z0-9_-]{43}$/);

    await expect(
      bindMetadataStage({
        stageId: prepared.stageId,
        contractURI: prepared.contract.uri,
        idempotencyKey: "test-launch",
        to: router,
        attributedData
      })
    ).rejects.toMatchObject({ status: 403 });

    await bindMetadataStage({
      stageId: prepared.stageId,
      stageToken: prepared.stageToken,
      contractURI: prepared.contract.uri,
      idempotencyKey: "test-launch",
      to: router,
      attributedData
    });

    const stored = await store.getMetadataStage(prepared.stageId);
    expect(stored?.status).toBe("bound");
    expect(stored?.secretHash).not.toBe(prepared.stageToken);
  });

  it("accepts a logo at exactly one megabyte", async () => {
    const prepared = await prepareMetadata(
      { name: "Boundary Logo", symbol: "BOUND", variant: "asset" },
      await logoFile(MAX_LOGO_BYTES)
    );
    stageIds.push(prepared.stageId);

    expect(prepared.logo.provider).toBe("staged");
  });

  it("rejects a logo above the one megabyte boundary", async () => {
    await expect(
      prepareMetadata(
        { name: "Large Logo", symbol: "LARGE", variant: "asset" },
        await logoFile(MAX_LOGO_BYTES + 1)
      )
    ).rejects.toMatchObject({
      status: 400,
      message: "Logo must be 1 MB or smaller."
    });
  });
});
