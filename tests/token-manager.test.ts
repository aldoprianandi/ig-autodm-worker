import { describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret } from "../src/security/secret-box";
import { getInstagramAccessToken, refreshInstagramTokenIfDue } from "../src/token/manager";

const encryptionKey = "0123456789abcdef0123456789abcdef";

class FakeTokenRepo {
  token: {
    encryptedToken: string;
    iv: string;
    expiresAt: string;
    refreshedAt: string | null;
    lastError: string | null;
  } | null = null;
  events: Array<Record<string, unknown>> = [];

  async getInstagramTokenState() {
    return this.token;
  }

  async upsertInstagramTokenState(input: {
    encryptedToken: string;
    iv: string;
    expiresAt: string;
    refreshedAt: string;
    lastError: string | null;
  }) {
    this.token = input;
  }

  async recordInstagramTokenRefreshError(message: string) {
    this.events.push({ type: "token_refresh_failed", message });
  }

  async insertOperationalEvent(input: Record<string, unknown>) {
    this.events.push(input);
  }
}

describe("instagram token manager", () => {
  it("uses the encrypted D1 token before the bootstrap env token", async () => {
    const repo = new FakeTokenRepo();
    repo.token = {
      ...(await encryptSecret("stored-token", encryptionKey)),
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      refreshedAt: new Date().toISOString(),
      lastError: null
    };

    const token = await getInstagramAccessToken(
      { INSTAGRAM_ACCESS_TOKEN: "env-token", TOKEN_ENCRYPTION_KEY: encryptionKey },
      repo
    );

    expect(token).toBe("stored-token");
  });

  it("refreshes the bootstrap token, stores it encrypted, and never returns token text in status", async () => {
    const repo = new FakeTokenRepo();
    const meta = {
      async refreshLongLivedToken(token: string) {
        expect(token).toBe("env-token");
        return { ok: true as const, accessToken: "new-token", expiresIn: 5_184_000 };
      }
    };

    const result = await refreshInstagramTokenIfDue(
      { INSTAGRAM_ACCESS_TOKEN: "env-token", TOKEN_ENCRYPTION_KEY: encryptionKey },
      repo,
      meta,
      { force: true, now: new Date("2026-05-08T00:00:00.000Z") }
    );

    expect(result).toEqual({
      attempted: true,
      refreshed: true,
      source: "env",
      expiresAt: "2026-07-07T00:00:00.000Z"
    });
    expect(repo.token?.encryptedToken).not.toContain("new-token");
    expect(
      await decryptSecret({ ciphertext: repo.token?.encryptedToken ?? "", iv: repo.token?.iv ?? "" }, encryptionKey)
    ).toBe("new-token");
  });

  it("skips refresh when stored token is not due", async () => {
    const repo = new FakeTokenRepo();
    repo.token = {
      ...(await encryptSecret("stored-token", encryptionKey)),
      expiresAt: "2026-07-01T00:00:00.000Z",
      refreshedAt: "2026-05-08T00:00:00.000Z",
      lastError: null
    };
    const meta = {
      async refreshLongLivedToken() {
        throw new Error("should not refresh");
      }
    };

    const result = await refreshInstagramTokenIfDue(
      { INSTAGRAM_ACCESS_TOKEN: "env-token", TOKEN_ENCRYPTION_KEY: encryptionKey },
      repo,
      meta,
      { now: new Date("2026-05-08T00:00:00.000Z") }
    );

    expect(result).toEqual({
      attempted: false,
      refreshed: false,
      source: "stored",
      expiresAt: "2026-07-01T00:00:00.000Z"
    });
  });
});
