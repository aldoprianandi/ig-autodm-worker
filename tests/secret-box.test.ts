import { describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret } from "../src/security/secret-box";

describe("secret box", () => {
  it("encrypts and decrypts secrets without storing plaintext", async () => {
    const key = "0123456789abcdef0123456789abcdef";

    const encrypted = await encryptSecret("ig-token-secret", key);
    const decrypted = await decryptSecret(encrypted, key);

    expect(decrypted).toBe("ig-token-secret");
    expect(encrypted.ciphertext).not.toContain("ig-token-secret");
    expect(encrypted.iv).toMatch(/^[A-Za-z0-9+/]+=*$/);
  });

  it("rejects weak token encryption keys", async () => {
    await expect(encryptSecret("ig-token-secret", "short")).rejects.toThrow(
      "TOKEN_ENCRYPTION_KEY must be at least 32 characters"
    );
  });
});
