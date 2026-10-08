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

  it("uses the env token and never attempts a refresh without an encryption key", async () => {
    const repo = new FakeTokenRepo();
    const meta = {
      async refreshLongLivedToken() {
        throw new Error("should not refresh");
      }
    };
    const env = { INSTAGRAM_ACCESS_TOKEN: "env-token" };

    expect(await getInstagramAccessToken(env, repo)).toBe("env-token");
    expect(await refreshInstagramTokenIfDue(env, repo, meta, { force: true })).toEqual({
      attempted: false,
      refreshed: false,
      source: "env",
      expiresAt: null
    });
  });

  it("falls back to the env token when no stored token exists", async () => {
    const token = await getInstagramAccessToken(
      { INSTAGRAM_ACCESS_TOKEN: "env-token", TOKEN_ENCRYPTION_KEY: encryptionKey },
      new FakeTokenRepo()
    );

    expect(token).toBe("env-token");
  });

  it("refreshes a stored token inside the refresh window using the decrypted stored value", async () => {
    const repo = new FakeTokenRepo();
    repo.token = {
      ...(await encryptSecret("stored-token", encryptionKey)),
      expiresAt: "2026-05-10T00:00:00.000Z",
      refreshedAt: "2026-03-10T00:00:00.000Z",
      lastError: null
    };
    const seen: string[] = [];
    const meta = {
      async refreshLongLivedToken(token: string) {
        seen.push(token);
        return { ok: true as const, accessToken: "rotated-token", expiresIn: 86_400 };
      }
    };

    const result = await refreshInstagramTokenIfDue(
      { INSTAGRAM_ACCESS_TOKEN: "env-token", TOKEN_ENCRYPTION_KEY: encryptionKey },
      repo,
      meta,
      { now: new Date("2026-05-08T00:00:00.000Z") }
    );

    expect(seen).toEqual(["stored-token"]);
    expect(result).toEqual({ attempted: true, refreshed: true, source: "stored", expiresAt: "2026-05-09T00:00:00.000Z" });
  });

  it("treats an unparseable expiry as due and records a failed refresh without changing the stored token", async () => {
    const repo = new FakeTokenRepo();
    const stored = {
      ...(await encryptSecret("stored-token", encryptionKey)),
      expiresAt: "not-a-date",
      refreshedAt: null,
      lastError: null
    };
    repo.token = stored;
    const meta = {
      async refreshLongLivedToken() {
        return { ok: false as const, retryable: true, code: "rate_limited", message: "Rate limited, try later" };
      }
    };

    const result = await refreshInstagramTokenIfDue(
      { INSTAGRAM_ACCESS_TOKEN: "env-token", TOKEN_ENCRYPTION_KEY: encryptionKey },
      repo,
      meta,
      { now: new Date("2026-05-08T00:00:00.000Z") }
    );

    expect(result).toEqual({ attempted: true, refreshed: false, source: "stored", expiresAt: "not-a-date" });
    expect(repo.token).toBe(stored);
    expect(repo.events).toContainEqual(
      expect.objectContaining({
        eventType: "token_refresh_failed",
        status: "failed",
        metadata: { source: "stored", code: "rate_limited", retryable: true }
      })
    );
  });
});
