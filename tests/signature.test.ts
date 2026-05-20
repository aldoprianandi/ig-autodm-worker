import { describe, expect, it } from "vitest";
import { createMetaSignature, verifyMetaSignature } from "../src/security/signature";

describe("Meta signature verification", () => {
  it("accepts a valid SHA-256 signature", async () => {
    const body = '{"object":"instagram"}';
    const secret = "app-secret";
    const signature = await createMetaSignature(body, secret);

    await expect(verifyMetaSignature(body, signature, secret)).resolves.toBe(true);
  });

  it("rejects an invalid signature", async () => {
    await expect(
      verifyMetaSignature('{"object":"instagram"}', "sha256=bad", "app-secret")
    ).resolves.toBe(false);
  });

  it("rejects a valid signature when the body is changed", async () => {
    const signature = await createMetaSignature('{"object":"instagram"}', "app-secret");

    await expect(verifyMetaSignature('{"object":"tampered"}', signature, "app-secret")).resolves.toBe(false);
  });

  it("rejects a missing signature", async () => {
    await expect(verifyMetaSignature("{}", null, "app-secret")).resolves.toBe(false);
  });
});
