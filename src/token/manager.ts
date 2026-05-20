import { redactSensitiveText } from "../security/redaction";
import { decryptSecret, encryptSecret } from "../security/secret-box";

export type InstagramTokenState = {
  encryptedToken?: string;
  ciphertext?: string;
  iv: string;
  expiresAt: string;
  refreshedAt: string | null;
  refreshAfter?: string | null;
  lastError: string | null;
};

type TokenEnv = {
  INSTAGRAM_ACCESS_TOKEN: string;
  TOKEN_ENCRYPTION_KEY?: string;
};

type TokenRepository = {
  getInstagramTokenState(): Promise<InstagramTokenState | null>;
  upsertInstagramTokenState(input: {
    encryptedToken: string;
    iv: string;
    expiresAt: string;
    refreshedAt: string;
    lastError: string | null;
  }): Promise<void>;
  recordInstagramTokenRefreshError?(message: string): Promise<void>;
  insertOperationalEvent?(input: {
    eventType: string;
    status: string;
    message?: string;
    metadata?: Record<string, unknown>;
  }): Promise<void>;
};

type TokenMetaClient = {
  refreshLongLivedToken(
    token: string
  ): Promise<
    | { ok: true; accessToken: string; expiresIn: number }
    | { ok: false; retryable: boolean; code: string; message: string }
  >;
};

export type TokenRefreshResult = {
  attempted: boolean;
  refreshed: boolean;
  source: "stored" | "env";
  expiresAt: string | null;
};

const REFRESH_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;

export async function getInstagramAccessToken(env: TokenEnv, repo: Pick<TokenRepository, "getInstagramTokenState">): Promise<string> {
  if (!env.TOKEN_ENCRYPTION_KEY) return env.INSTAGRAM_ACCESS_TOKEN;

  const state = await repo.getInstagramTokenState();
  if (!state) return env.INSTAGRAM_ACCESS_TOKEN;

  return decryptSecret(
    {
      ciphertext: tokenCiphertext(state),
      iv: state.iv
    },
    env.TOKEN_ENCRYPTION_KEY
  );
}

export async function refreshInstagramTokenIfDue(
  env: TokenEnv,
  repo: TokenRepository,
  meta: TokenMetaClient,
  options: { force?: boolean; now?: Date } = {}
): Promise<TokenRefreshResult> {
  const now = options.now ?? new Date();
  const state = env.TOKEN_ENCRYPTION_KEY ? await repo.getInstagramTokenState() : null;
  const source = state ? "stored" : "env";
  const expiresAt = state?.expiresAt ?? null;

  if (!env.TOKEN_ENCRYPTION_KEY) {
    return { attempted: false, refreshed: false, source, expiresAt };
  }

  if (state && !options.force && !isRefreshDue(state, now)) {
    return { attempted: false, refreshed: false, source: "stored", expiresAt: state.expiresAt };
  }

  const token = state
    ? await decryptSecret({ ciphertext: tokenCiphertext(state), iv: state.iv }, env.TOKEN_ENCRYPTION_KEY)
    : env.INSTAGRAM_ACCESS_TOKEN;

  const result = await meta.refreshLongLivedToken(token);
  if (!result.ok) {
    const message = redactSensitiveText(result.message) ?? "Instagram token refresh failed";
    await repo.recordInstagramTokenRefreshError?.(message);
    await repo.insertOperationalEvent?.({
      eventType: "token_refresh_failed",
      status: "failed",
      message,
      metadata: { source, code: result.code, retryable: result.retryable }
    });
    return { attempted: true, refreshed: false, source, expiresAt };
  }

  const encrypted = await encryptSecret(result.accessToken, env.TOKEN_ENCRYPTION_KEY);
  const refreshedAt = now.toISOString();
  const refreshedExpiresAt = new Date(now.getTime() + result.expiresIn * 1000).toISOString();
  await repo.upsertInstagramTokenState({
    encryptedToken: encrypted.ciphertext,
    iv: encrypted.iv,
    expiresAt: refreshedExpiresAt,
    refreshedAt,
    lastError: null
  });
  await repo.insertOperationalEvent?.({
    eventType: "token_refreshed",
    status: "ok",
    metadata: { source, expiresAt: refreshedExpiresAt }
  });

  return {
    attempted: true,
    refreshed: true,
    source,
    expiresAt: refreshedExpiresAt
  };
}

function isRefreshDue(state: InstagramTokenState, now: Date): boolean {
  const refreshAfterMs = state.refreshAfter ? Date.parse(state.refreshAfter) : Number.NaN;
  if (Number.isFinite(refreshAfterMs)) return now.getTime() >= refreshAfterMs;

  const expiresAtMs = Date.parse(state.expiresAt);
  if (!Number.isFinite(expiresAtMs)) return true;
  return expiresAtMs - now.getTime() <= REFRESH_WINDOW_MS;
}

function tokenCiphertext(state: InstagramTokenState): string {
  return state.encryptedToken ?? state.ciphertext ?? "";
}
