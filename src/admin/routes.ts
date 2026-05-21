import { Hono, type Context } from "hono";
import { z } from "zod";
import { ADMIN_REQUESTS_PER_MINUTE, metaSendsPerMinute } from "../config";
import { Repository } from "../db/repository";
import { MAX_DM_STEPS } from "../flows/steps";
import { normalizeMessageVariants } from "../flows/variants";
import { POLL_LIMIT_PER_MEDIA } from "../poller/comments";
import { timingSafeEqual } from "../security/constant-time";
import { redactSensitiveText } from "../security/redaction";
import { getInstagramAccessToken } from "../token/manager";
import type { Env } from "../types";
import { adminTransportSecurityHeaders } from "./ui-auth";

const CAMPAIGN_ID_PATTERN = /^[a-z0-9][a-z0-9_-]{2,63}$/;
const META_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
const MAX_ADMIN_JSON_BYTES = 64 * 1024;
const MIN_ADMIN_TOKEN_LENGTH = 24;
const MIN_ADMIN_USERNAME_LENGTH = 3;
const MIN_ADMIN_PASSWORD_LENGTH = 10;
const ADMIN_SESSION_COOKIE = "ig_admin_session";
const ADMIN_SESSION_TTL_SECONDS = 30 * 60;
const CSRF_HEADER = "X-CSRF-Token";
const MAX_OPENING_VARIANTS = 50;
const MAX_COMMENT_REPLY_VARIANTS = 100;

const dmStepSchema = z.object({
  text: z.string().trim().min(1).max(640),
  textVariants: z.array(z.string().trim().min(1).max(640)).max(MAX_OPENING_VARIANTS).optional().default([]),
  buttonTitle: z.string().trim().min(1).max(20)
}).transform((step) => ({
  ...step,
  textVariants: normalizeVariantPool(step.text, step.textVariants, MAX_OPENING_VARIANTS)
}));

const createCampaignSchema = z.object({
  id: z.string().trim().regex(CAMPAIGN_ID_PATTERN),
  name: z.string().trim().min(1).max(80),
  mediaId: z.string().trim().regex(META_ID_PATTERN),
  keyword: z.string().trim().min(1).max(80),
  openingText: z.string().trim().min(1).max(640),
  openingTextVariants: z.array(z.string().trim().min(1).max(640)).max(MAX_OPENING_VARIANTS).optional().default([]),
  buttonTitle: z.string().trim().min(1).max(20),
  buttonPayload: z.string().trim().min(1).max(2048),
  dmSteps: z.array(dmStepSchema).max(MAX_DM_STEPS).optional().default([]),
  deliveryText: z.string().trim().min(1).max(2000),
  commentReplyText: z.string().trim().min(1).max(300).nullable().optional(),
  commentReplyTextVariants: z.array(z.string().trim().min(1).max(300)).max(MAX_COMMENT_REPLY_VARIANTS).optional().default([]),
  openingFailureReplyText: z.string().trim().max(300).nullable().optional(),
  followGateEnabled: z.boolean().default(false),
  followGateText: z.string().trim().max(640).nullable().optional(),
  followGateButtonTitle: z.string().trim().max(20).nullable().optional(),
  enabled: z.boolean().default(false)
}).transform((campaign) => {
  const commentReplyText = campaign.commentReplyText ?? null;
  const openingFailureReplyText = campaign.openingFailureReplyText?.trim() || null;
  const followGateText = campaign.followGateText?.trim() || null;
  const followGateButtonTitle = campaign.followGateButtonTitle?.trim() || null;
  const commentReplyTextVariants = normalizeVariantPool(
    commentReplyText,
    campaign.commentReplyTextVariants,
    MAX_COMMENT_REPLY_VARIANTS
  );
  const directLinkButton = isHttpUrl(campaign.buttonPayload);
  return {
    ...campaign,
    buttonPayload: `${campaign.id}:confirm`,
    dmSteps: [],
    openingTextVariants: normalizeVariantPool(campaign.openingText, campaign.openingTextVariants, MAX_OPENING_VARIANTS),
    commentReplyText: commentReplyText ?? commentReplyTextVariants[0] ?? null,
    commentReplyTextVariants,
    openingFailureReplyText,
    followGateEnabled: directLinkButton ? false : campaign.followGateEnabled,
    followGateText,
    followGateButtonTitle
  };
});

const subscriptionFieldSchema = z.enum(["comments", "messages", "messaging_postbacks"]);
const variantKindSchema = z.enum(["opening", "comment_reply"]);
const campaignWriteModeSchema = z.enum(["create", "update", "upsert"]);
const variantTemplateBaseSchema = z.object({
  kind: variantKindSchema,
  text: z.string().trim().min(1).max(640)
});
const variantTemplateSchema = variantTemplateBaseSchema.superRefine((value, ctx) => {
  if (value.kind === "comment_reply" && value.text.length > 300) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["text"],
      message: "Public comment reply templates must be 300 characters or less"
    });
  }
});
const variantTemplateBulkSchema = z.object({
  kind: variantKindSchema,
  texts: z.array(z.string().trim().min(1).max(640)).min(1).max(MAX_COMMENT_REPLY_VARIANTS)
}).superRefine((value, ctx) => {
  if (value.kind !== "comment_reply") return;
  value.texts.forEach((text, index) => {
    if (text.length > 300) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["texts", index],
        message: "Public comment reply templates must be 300 characters or less"
      });
    }
  });
});
const subscriptionSchema = z
  .object({
    fields: z.array(subscriptionFieldSchema).min(1).default(["comments", "messages", "messaging_postbacks"])
  })
  .default({ fields: ["comments", "messages", "messaging_postbacks"] });

const loginSchema = z.object({
  username: z.string().trim().min(1).max(120),
  password: z.string().min(1).max(4096),
  adminToken: z.string().min(1).max(4096),
  turnstileToken: z.string().min(1).max(4096).optional()
});

type AdminAuth = {
  actorKeyHash: string;
  sessionIdHash?: string;
  mode: "bearer" | "session";
};

type AdminRouteEnv = {
  Bindings: Env;
  Variables: {
    adminAuth: AdminAuth;
  };
};

type AdminContext = Context<AdminRouteEnv>;

export const adminRoutes = new Hono<AdminRouteEnv>();

adminRoutes.use("*", async (c, next) => {
  await next();
  for (const [key, value] of Object.entries(adminTransportSecurityHeaders(c.req.url))) {
    c.header(key, String(value));
  }
});

const ADMIN_RATE_LIMIT = {
  limit: ADMIN_REQUESTS_PER_MINUTE,
  windowSeconds: 60
};

const ADMIN_LOGIN_RATE_LIMIT = {
  limit: 5,
  windowSeconds: 15 * 60
};

const ADMIN_FAILED_AUTH_GLOBAL_LIMIT = {
  limit: 30,
  windowSeconds: 15 * 60
};

type InstagramError = {
  error?: {
    code?: number;
    type?: string;
    message?: string;
  };
};

async function sha256Hex(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function hmacSha256Hex(key: string, text: string): Promise<string> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(text));
  return [...new Uint8Array(signature)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function clientKey(c: Context<any>): string {
  return c.req.header("CF-Connecting-IP") || "unknown";
}

function userAgent(c: Context<any>): string {
  return c.req.header("User-Agent") || "unknown";
}

function setAdminSecurityHeaders(c: Context<any>): void {
  c.header("Cache-Control", "no-store");
  c.header("Pragma", "no-cache");
  c.header("Referrer-Policy", "no-referrer");
  c.header("X-Content-Type-Options", "nosniff");
  c.header("X-Frame-Options", "DENY");
  c.header("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()");
}

async function matchesBearerToken(provided: string | undefined, expected: string): Promise<boolean> {
  return matchesSecret(provided, expected);
}

async function matchesSecret(provided: string | undefined, expected: string): Promise<boolean> {
  const [providedHash, expectedHash] = await Promise.all([sha256Hex(provided ?? ""), sha256Hex(expected)]);
  return timingSafeEqual(providedHash, expectedHash);
}

function adminTokenConfigured(token: string | undefined): token is string {
  return Boolean(token && token.trim().length >= MIN_ADMIN_TOKEN_LENGTH && !token.includes("replace-with"));
}

function adminLoginConfigured(
  env: Env
): env is Env & { ADMIN_LOGIN_USERNAME: string; ADMIN_LOGIN_PASSWORD: string } {
  return Boolean(
    env.ADMIN_LOGIN_USERNAME &&
      env.ADMIN_LOGIN_USERNAME.trim().length >= MIN_ADMIN_USERNAME_LENGTH &&
      !env.ADMIN_LOGIN_USERNAME.includes("replace-with") &&
      env.ADMIN_LOGIN_PASSWORD &&
      env.ADMIN_LOGIN_PASSWORD.length >= MIN_ADMIN_PASSWORD_LENGTH &&
      !env.ADMIN_LOGIN_PASSWORD.includes("replace-with")
  );
}

function adminStorageConfigured(db: D1Database | undefined): db is D1Database {
  return Boolean(db);
}

function turnstileConfigured(
  env: Env
): env is Env & { TURNSTILE_SITE_KEY: string; TURNSTILE_SECRET_KEY: string } {
  return Boolean(env.TURNSTILE_SITE_KEY?.trim() && env.TURNSTILE_SECRET_KEY?.trim());
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function randomToken(bytes = 32): string {
  const values = crypto.getRandomValues(new Uint8Array(bytes));
  let binary = "";
  for (const value of values) {
    binary += String.fromCharCode(value);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function cookieValue(header: string | undefined, name: string): string | null {
  if (!header) return null;
  const prefix = `${name}=`;
  for (const part of header.split(";")) {
    const trimmed = part.trim();
    if (trimmed.startsWith(prefix)) return trimmed.slice(prefix.length);
  }
  return null;
}

function sessionCookieHeader(value: string, requestUrl: string, maxAgeSeconds: number): string {
  const secure = new URL(requestUrl).protocol === "https:" ? "; Secure" : "";
  return `${ADMIN_SESSION_COOKIE}=${value}; Path=/admin; HttpOnly; SameSite=Strict; Max-Age=${maxAgeSeconds}${secure}`;
}

function clearSessionCookieHeader(requestUrl: string): string {
  return sessionCookieHeader("", requestUrl, 0);
}

function normalizeVariantPool(primaryText: string | null, variants: string[], limit: number): string[] {
  return normalizeMessageVariants(primaryText, variants).slice(0, limit);
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function contentLengthTooLarge(c: Context<any>, maxBytes: number): boolean {
  const raw = c.req.header("Content-Length");
  if (!raw) return false;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > maxBytes;
}

function utf8ByteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

async function parseJson(
  c: Context<any>
): Promise<{ ok: true; value: unknown } | { ok: false; status: 400 | 413; error: string }> {
  if (contentLengthTooLarge(c, MAX_ADMIN_JSON_BYTES)) {
    return { ok: false, status: 413, error: "Request body too large" };
  }

  const bodyText = await c.req.text();
  if (utf8ByteLength(bodyText) > MAX_ADMIN_JSON_BYTES) {
    return { ok: false, status: 413, error: "Request body too large" };
  }
  if (!bodyText.trim()) return { ok: false, status: 400, error: "Invalid JSON body" };

  try {
    return { ok: true, value: JSON.parse(bodyText) as unknown };
  } catch {
    return { ok: false, status: 400, error: "Invalid JSON body" };
  }
}

async function parseOptionalJson(
  c: Context<any>
): Promise<{ ok: true; value: unknown } | { ok: false; status: 400 | 413; error: string }> {
  if (contentLengthTooLarge(c, MAX_ADMIN_JSON_BYTES)) {
    return { ok: false, status: 413, error: "Request body too large" };
  }

  const bodyText = await c.req.text();
  if (utf8ByteLength(bodyText) > MAX_ADMIN_JSON_BYTES) {
    return { ok: false, status: 413, error: "Request body too large" };
  }
  if (!bodyText.trim()) return { ok: true, value: {} };

  try {
    return { ok: true, value: JSON.parse(bodyText) as unknown };
  } catch {
    return { ok: false, status: 400, error: "Invalid JSON body" };
  }
}

function sanitizedInstagramError(body: unknown) {
  const upstream = body as InstagramError;
  if (!upstream?.error) return undefined;

  return {
    code: upstream.error.code,
    type: upstream.error.type,
    message: redactSensitiveText(upstream.error.message)
  };
}

function clampedLimit(raw: string | undefined, fallback = 5): string {
  const parsed = Number.parseInt(raw ?? "", 10);
  if (!Number.isFinite(parsed)) return String(fallback);
  return String(Math.min(Math.max(parsed, 1), 25));
}

function validMetaId(value: string): boolean {
  return META_ID_PATTERN.test(value);
}

function graphUrl(pathSegments: string[], params: Record<string, string> = {}): URL {
  const safePath = pathSegments.map((segment) => encodeURIComponent(segment)).join("/");
  const url = new URL(`https://graph.instagram.com/v25.0/${safePath}`);
  url.search = new URLSearchParams(params).toString();
  return url;
}

async function fetchInstagramJson(pathSegments: string[], accessToken: string, params: Record<string, string> = {}) {
  const url = graphUrl(pathSegments, params);

  const response = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  const body = (await response.json()) as unknown;
  return { response, body };
}

async function postInstagramJson(pathSegments: string[], accessToken: string, params: Record<string, string>) {
  const url = graphUrl(pathSegments, params);

  const response = await fetch(url.toString(), {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  const body = (await response.json().catch(() => ({}))) as unknown;
  return { response, body };
}

async function adminInstagramAccessToken(c: Context<any>): Promise<string> {
  return getInstagramAccessToken(c.env, new Repository(c.env.DB));
}

async function adminBootstrap(c: Context<any>, repo: Repository) {
  const dashboard = await repo.getOperationalDashboard();
  const storedToken = dashboard.token;

  return {
    dashboard: {
      counts: dashboard.counts,
      token: storedToken
        ? {
            configured: true,
            source: "stored",
            expiresAt: storedToken.expiresAt,
            lastError: storedToken.lastError
          }
        : {
            configured: Boolean(c.env.INSTAGRAM_ACCESS_TOKEN),
            source: "env",
            expiresAt: null,
            lastError: null
          },
      limits: {
        adminRequestsPerMinute: ADMIN_RATE_LIMIT.limit,
        metaSendsPerMinute: metaSendsPerMinute(c.env),
        pollLimitPerMedia: POLL_LIMIT_PER_MEDIA
      }
    },
    campaigns: await repo.listCampaigns(),
    templates: await repo.listMessageVariantTemplates()
  };
}

adminRoutes.use("*", async (c, next) => {
  setAdminSecurityHeaders(c);
  await next();
});

async function actorHash(c: Context<any>): Promise<string> {
  return hmacSha256Hex(c.env.ADMIN_TOKEN, clientKey(c));
}

async function sessionIdHash(adminToken: string, sessionId: string): Promise<string> {
  return hmacSha256Hex(adminToken, `session:${sessionId}`);
}

async function csrfTokenHash(adminToken: string, csrfToken: string): Promise<string> {
  return hmacSha256Hex(adminToken, `csrf:${csrfToken}`);
}

async function userAgentHash(adminToken: string, value: string): Promise<string> {
  return hmacSha256Hex(adminToken, `ua:${value}`);
}

async function consumeGlobalFailedAuth(repo: Repository, adminToken: string): Promise<{ allowed: boolean; resetAt: string }> {
  return repo.checkAdminRateLimit({
    keyHash: await hmacSha256Hex(adminToken, "admin-auth-failure:global"),
    limit: ADMIN_FAILED_AUTH_GLOBAL_LIMIT.limit,
    windowSeconds: ADMIN_FAILED_AUTH_GLOBAL_LIMIT.windowSeconds
  });
}

async function authenticateAdmin(c: AdminContext, repo: Repository, fallbackActorKeyHash: string): Promise<AdminAuth | null> {
  const expected = `Bearer ${c.env.ADMIN_TOKEN}`;
  if (await matchesBearerToken(c.req.header("Authorization"), expected)) {
    return { actorKeyHash: fallbackActorKeyHash, mode: "bearer" };
  }

  const sessionId = cookieValue(c.req.header("Cookie"), ADMIN_SESSION_COOKIE);
  const csrfToken = c.req.header(CSRF_HEADER);
  if (!sessionId || !csrfToken) return null;

  const [idHash, providedCsrfHash, providedUserAgentHash] = await Promise.all([
    sessionIdHash(c.env.ADMIN_TOKEN, sessionId),
    csrfTokenHash(c.env.ADMIN_TOKEN, csrfToken),
    userAgentHash(c.env.ADMIN_TOKEN, userAgent(c))
  ]);

  const session = await repo.findActiveAdminSession(idHash);
  if (!session) return null;
  if (!timingSafeEqual(providedCsrfHash, session.csrfHash)) return null;
  if (!timingSafeEqual(providedUserAgentHash, session.userAgentHash)) return null;

  await repo.touchAdminSession(idHash);
  return { actorKeyHash: session.actorKeyHash, sessionIdHash: idHash, mode: "session" };
}

async function resumeAdminSession(c: AdminContext, repo: Repository): Promise<{ ok: true; csrfToken: string; expiresAt: string } | null> {
  const sessionId = cookieValue(c.req.header("Cookie"), ADMIN_SESSION_COOKIE);
  if (!sessionId) return null;

  const idHash = await sessionIdHash(c.env.ADMIN_TOKEN, sessionId);
  const session = await repo.findActiveAdminSession(idHash);
  if (!session) return null;

  const providedUserAgentHash = await userAgentHash(c.env.ADMIN_TOKEN, userAgent(c));
  if (!timingSafeEqual(providedUserAgentHash, session.userAgentHash)) return null;

  const csrfToken = randomToken();
  await repo.rotateAdminSessionCsrf(idHash, await csrfTokenHash(c.env.ADMIN_TOKEN, csrfToken));
  return { ok: true, csrfToken, expiresAt: session.expiresAt };
}

async function verifyTurnstile(c: AdminContext, token: string | undefined): Promise<boolean> {
  if (!turnstileConfigured(c.env)) return true;
  if (!token) return false;

  const formData = new URLSearchParams({
    secret: c.env.TURNSTILE_SECRET_KEY,
    response: token
  });
  const ip = c.req.header("CF-Connecting-IP");
  if (ip) formData.set("remoteip", ip);

  const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: formData.toString()
  });
  const body = await response.json().catch(() => ({})) as { success?: boolean };
  return response.ok && body.success === true;
}

adminRoutes.post("/session", async (c) => {
  if (!adminTokenConfigured(c.env.ADMIN_TOKEN)) {
    return c.json({ error: "Admin authentication is not configured" }, 503);
  }
  if (!adminLoginConfigured(c.env)) {
    return c.json({ error: "Admin login is not configured" }, 503);
  }
  if (!adminStorageConfigured(c.env.DB)) {
    return c.json({ error: "Admin storage is not configured" }, 503);
  }

  const repo = new Repository(c.env.DB);
  const actorKeyHash = await actorHash(c);
  const rate = await repo.checkAdminRateLimit({
    keyHash: await hmacSha256Hex(c.env.ADMIN_TOKEN, `admin-login:${clientKey(c)}`),
    limit: ADMIN_LOGIN_RATE_LIMIT.limit,
    windowSeconds: ADMIN_LOGIN_RATE_LIMIT.windowSeconds
  });

  if (!rate.allowed) {
    return c.json({ error: "Too many login attempts", resetAt: rate.resetAt }, 429);
  }

  const body = await parseJson(c);
  if (!body.ok) {
    await repo.insertAdminAuditLog({ actorKeyHash, method: c.req.method, path: c.req.path, action: "login_invalid_json", status: body.status });
    return c.json({ error: body.error }, body.status);
  }

  const parsed = loginSchema.safeParse(body.value);
  const turnstileOk = parsed.success ? await verifyTurnstile(c, parsed.data.turnstileToken) : false;
  const validLogin =
    parsed.success &&
    turnstileOk &&
    (await matchesSecret(parsed.data.username.trim(), c.env.ADMIN_LOGIN_USERNAME.trim())) &&
    (await matchesSecret(parsed.data.password, c.env.ADMIN_LOGIN_PASSWORD)) &&
    (await matchesBearerToken(`Bearer ${parsed.data.adminToken}`, `Bearer ${c.env.ADMIN_TOKEN}`));

  if (!validLogin) {
    const failedRate = await consumeGlobalFailedAuth(repo, c.env.ADMIN_TOKEN);
    const status = failedRate.allowed ? 401 : 429;
    await repo.insertAdminAuditLog({ actorKeyHash, method: c.req.method, path: c.req.path, action: "login_failed", status });
    if (!failedRate.allowed) {
      return c.json({ error: "Too many failed admin attempts", resetAt: failedRate.resetAt }, 429);
    }
    return c.json({ error: "Unauthorized" }, 401);
  }

  const sessionId = randomToken();
  const csrfToken = randomToken();
  const expiresAt = new Date(Date.now() + ADMIN_SESSION_TTL_SECONDS * 1000).toISOString();
  await repo.insertAdminSession({
    idHash: await sessionIdHash(c.env.ADMIN_TOKEN, sessionId),
    csrfHash: await csrfTokenHash(c.env.ADMIN_TOKEN, csrfToken),
    actorKeyHash,
    userAgentHash: await userAgentHash(c.env.ADMIN_TOKEN, userAgent(c)),
    expiresAt
  });
  await repo.insertAdminAuditLog({ actorKeyHash, method: c.req.method, path: c.req.path, action: "login_succeeded", status: 200 });

  c.header("Set-Cookie", sessionCookieHeader(sessionId, c.req.url, ADMIN_SESSION_TTL_SECONDS));
  return c.json({ ok: true, csrfToken, expiresAt, bootstrap: await adminBootstrap(c, repo) });
});

adminRoutes.get("/session", async (c) => {
  if (!adminTokenConfigured(c.env.ADMIN_TOKEN)) {
    return c.json({ error: "Admin authentication is not configured" }, 503);
  }
  if (!adminStorageConfigured(c.env.DB)) {
    return c.json({ error: "Admin storage is not configured" }, 503);
  }

  const repo = new Repository(c.env.DB);
  const actorKeyHash = await actorHash(c);
  const rate = await repo.checkAdminRateLimit({
    keyHash: actorKeyHash,
    limit: ADMIN_RATE_LIMIT.limit,
    windowSeconds: ADMIN_RATE_LIMIT.windowSeconds
  });
  if (!rate.allowed) {
    return c.json({ error: "Rate limit exceeded", resetAt: rate.resetAt }, 429);
  }

  const resumed = await resumeAdminSession(c, repo);
  if (!resumed) {
    await repo.insertAdminAuditLog({ actorKeyHash, method: c.req.method, path: c.req.path, action: "session_resume_failed", status: 401 });
    c.header("Set-Cookie", clearSessionCookieHeader(c.req.url));
    return c.json({ error: "Unauthorized" }, 401);
  }

  await repo.insertAdminAuditLog({ actorKeyHash, method: c.req.method, path: c.req.path, action: "session_resumed", status: 200 });
  return c.json(resumed);
});

adminRoutes.use("*", async (c, next) => {
  const repo = new Repository(c.env.DB);
  const method = c.req.method;
  const path = c.req.path;
  const action = `${method} ${path}`;
  if (!adminTokenConfigured(c.env.ADMIN_TOKEN)) {
    return c.json({ error: "Admin authentication is not configured" }, 503);
  }
  if (!adminStorageConfigured(c.env.DB)) {
    return c.json({ error: "Admin storage is not configured" }, 503);
  }

  const actorKeyHash = await actorHash(c);

  const rate = await repo.checkAdminRateLimit({
    keyHash: actorKeyHash,
    limit: ADMIN_RATE_LIMIT.limit,
    windowSeconds: ADMIN_RATE_LIMIT.windowSeconds
  });

  if (!rate.allowed) {
    return c.json({ error: "Rate limit exceeded", resetAt: rate.resetAt }, 429);
  }

  const auth = await authenticateAdmin(c, repo, actorKeyHash);
  if (!auth) {
    const failedRate = await consumeGlobalFailedAuth(repo, c.env.ADMIN_TOKEN);
    const status = failedRate.allowed ? 401 : 429;
    await repo.insertAdminAuditLog({ actorKeyHash, method, path, action: "auth_failed", status });
    if (!failedRate.allowed) {
      return c.json({ error: "Too many failed admin attempts", resetAt: failedRate.resetAt }, 429);
    }
    return c.json({ error: "Unauthorized" }, 401);
  }
  c.set("adminAuth", auth);

  try {
    await next();
    await repo.insertAdminAuditLog({ actorKeyHash: auth.actorKeyHash, method, path, action, status: c.res.status });
  } catch (error) {
    await repo.insertAdminAuditLog({ actorKeyHash: auth.actorKeyHash, method, path, action, status: 500 });
    throw error;
  }
});

adminRoutes.delete("/session", async (c) => {
  const auth = c.get("adminAuth");
  if (auth.sessionIdHash) {
    await new Repository(c.env.DB).revokeAdminSession(auth.sessionIdHash);
  }
  c.header("Set-Cookie", clearSessionCookieHeader(c.req.url));
  return c.json({ ok: true });
});

adminRoutes.get("/campaigns", async (c) => {
  const repo = new Repository(c.env.DB);
  return c.json({ campaigns: await repo.listCampaigns() });
});

adminRoutes.get("/bootstrap", async (c) => {
  const repo = new Repository(c.env.DB);
  return c.json(await adminBootstrap(c, repo));
});

adminRoutes.get("/variant-templates", async (c) => {
  const parsedKind = variantKindSchema.optional().safeParse(c.req.query("kind"));
  if (!parsedKind.success) return c.json({ error: "Invalid variant kind" }, 400);

  const repo = new Repository(c.env.DB);
  return c.json({ templates: await repo.listMessageVariantTemplates(parsedKind.data) });
});

adminRoutes.post("/variant-templates", async (c) => {
  const body = await parseJson(c);
  if (!body.ok) {
    return c.json({ error: body.error }, body.status);
  }

  const parsed = variantTemplateSchema.safeParse(body.value);
  if (!parsed.success) {
    return c.json({ error: "Invalid variant template", details: parsed.error.flatten() }, 400);
  }

  const id = `variant_${parsed.data.kind}_${(await sha256Hex(parsed.data.text)).slice(0, 24)}`;
  const repo = new Repository(c.env.DB);
  const template = await repo.upsertMessageVariantTemplate({ id, kind: parsed.data.kind, text: parsed.data.text });
  return c.json({ ok: true, template }, 201);
});

adminRoutes.post("/variant-templates/bulk", async (c) => {
  const body = await parseJson(c);
  if (!body.ok) {
    return c.json({ error: body.error }, body.status);
  }

  const parsed = variantTemplateBulkSchema.safeParse(body.value);
  if (!parsed.success) {
    return c.json({ error: "Invalid variant templates", details: parsed.error.flatten() }, 400);
  }

  const seen = new Set<string>();
  const texts = parsed.data.texts.filter((text) => {
    if (seen.has(text)) return false;
    seen.add(text);
    return true;
  });
  const repo = new Repository(c.env.DB);
  const templates = await repo.upsertMessageVariantTemplates(
    parsed.data.kind,
    await Promise.all(
      texts.map(async (text) => ({
        id: `variant_${parsed.data.kind}_${(await sha256Hex(text)).slice(0, 24)}`,
        text
      }))
    )
  );

  return c.json({ ok: true, templates, count: templates.length }, 201);
});

adminRoutes.get("/audit-logs", async (c) => {
  const repo = new Repository(c.env.DB);
  return c.json({ logs: await repo.listAdminAuditLogs(Number.parseInt(c.req.query("limit") ?? "50", 10)) });
});

adminRoutes.get("/dashboard", async (c) => {
  const repo = new Repository(c.env.DB);
  return c.json((await adminBootstrap(c, repo)).dashboard);
});

adminRoutes.post("/deliveries/:campaignId/:igUserId/follow-retry", async (c) => {
  const campaignId = c.req.param("campaignId");
  const igUserId = c.req.param("igUserId");
  if (!CAMPAIGN_ID_PATTERN.test(campaignId)) {
    return c.json({ error: "Invalid campaign ID" }, 400);
  }
  if (!validMetaId(igUserId)) {
    return c.json({ error: "Invalid Instagram user ID" }, 400);
  }

  const repo = new Repository(c.env.DB);
  const campaign = await repo.findCampaignById(campaignId);
  if (!campaign) return c.json({ error: "Campaign not found", campaignId }, 404);
  if (!campaign.enabled) return c.json({ error: "Campaign is disabled", campaignId }, 409);
  if (!campaign.followGateEnabled) return c.json({ error: "Campaign follow gate is not enabled", campaignId }, 409);

  const deliveryId = `${campaignId}:${igUserId}:final`;
  const requeued = await repo.requeueWaitingFollowDelivery(deliveryId);
  if (!requeued) {
    return c.json({ error: "No waiting follow delivery found", campaignId, igUserId }, 409);
  }

  await c.env.DELIVERY_QUEUE.send({
    deliveryId,
    campaignId,
    igUserId,
    deliveryType: "final"
  });
  await repo.insertOperationalEvent({
    eventType: "manual_follow_retry",
    status: "queued",
    metadata: { campaignId, igUserId, deliveryId }
  });

  return c.json({ ok: true, deliveryId, campaignId, igUserId, deliveryType: "final" });
});

adminRoutes.get("/media", async (c) => {
  const { response, body } = await fetchInstagramJson(
    [c.env.INSTAGRAM_ACCOUNT_ID, "media"],
    await adminInstagramAccessToken(c),
    {
      fields: "id,caption,permalink,timestamp,media_product_type,media_type",
      limit: clampedLimit(c.req.query("limit"))
    }
  );

  if (!response.ok) {
    return c.json(
      { error: "Instagram media fetch failed", upstreamStatus: response.status, upstreamError: sanitizedInstagramError(body) },
      502
    );
  }

  const data = Array.isArray((body as { data?: unknown }).data) ? (body as { data: unknown[] }).data : [];
  return c.json({
    data: data.map((item) => {
      const media = item as Record<string, unknown>;
      return {
        id: media.id,
        caption: media.caption,
        permalink: media.permalink,
        timestamp: media.timestamp,
        mediaProductType: media.media_product_type,
        mediaType: media.media_type
      };
    })
  });
});

adminRoutes.get("/media/:mediaId/comments", async (c) => {
  const mediaId = c.req.param("mediaId");
  if (!validMetaId(mediaId)) {
    return c.json({ error: "Invalid media ID" }, 400);
  }

  const { response, body } = await fetchInstagramJson([mediaId, "comments"], await adminInstagramAccessToken(c), {
    fields: "id,text,username,timestamp",
    limit: clampedLimit(c.req.query("limit"), 10)
  });

  if (!response.ok) {
    return c.json(
      { error: "Instagram comments fetch failed", upstreamStatus: response.status, upstreamError: sanitizedInstagramError(body) },
      502
    );
  }

  const data = Array.isArray((body as { data?: unknown }).data) ? (body as { data: unknown[] }).data : [];
  return c.json({
    data: data.map((item) => {
      const comment = item as Record<string, unknown>;
      return {
        id: comment.id,
        text: comment.text,
        username: comment.username,
        timestamp: comment.timestamp
      };
    })
  });
});

adminRoutes.get("/subscription", async (c) => {
  const { response, body } = await fetchInstagramJson(
    [c.env.INSTAGRAM_ACCOUNT_ID, "subscribed_apps"],
    await adminInstagramAccessToken(c)
  );

  if (!response.ok) {
    return c.json(
      { error: "Instagram subscription fetch failed", upstreamStatus: response.status, upstreamError: sanitizedInstagramError(body) },
      502
    );
  }

  const data = Array.isArray((body as { data?: unknown }).data) ? (body as { data: unknown[] }).data : [];
  return c.json({
    data: data.map((item) => {
      const subscription = item as Record<string, unknown>;
      return {
        id: subscription.id,
        subscribedFields: subscription.subscribed_fields,
        targetUpdates: subscription.target_updates
      };
    })
  });
});

adminRoutes.post("/subscription", async (c) => {
  const rawBody = await parseOptionalJson(c);
  if (!rawBody.ok) {
    return c.json({ error: rawBody.error }, rawBody.status);
  }

  const parsed = subscriptionSchema.safeParse(rawBody.value);

  if (!parsed.success) {
    return c.json({ error: "Invalid subscription fields", details: parsed.error.flatten() }, 400);
  }

  const fields = [...new Set(parsed.data.fields)];
  const { response, body } = await postInstagramJson(
    [c.env.INSTAGRAM_ACCOUNT_ID, "subscribed_apps"],
    await adminInstagramAccessToken(c),
    { subscribed_fields: fields.join(",") }
  );

  if (!response.ok) {
    return c.json(
      { error: "Instagram subscription update failed", upstreamStatus: response.status, upstreamError: sanitizedInstagramError(body) },
      502
    );
  }

  return c.json({ ok: true, subscribedFields: fields });
});

adminRoutes.post("/campaigns", async (c) => {
  const body = await parseJson(c);
  if (!body.ok) {
    return c.json({ error: body.error }, body.status);
  }

  if (!isJsonObject(body.value)) {
    return c.json({ error: "Invalid campaign" }, 400);
  }

  const writeMode = campaignWriteModeSchema.default("upsert").safeParse(body.value.writeMode);
  if (!writeMode.success) {
    return c.json({ error: "Invalid campaign write mode" }, 400);
  }

  const parsed = createCampaignSchema.safeParse(body.value);

  if (!parsed.success) {
    return c.json({ error: "Invalid campaign", details: parsed.error.flatten() }, 400);
  }

  const repo = new Repository(c.env.DB);
  const existing = await repo.findCampaignById(parsed.data.id);
  if (writeMode.data === "create" && existing) {
    return c.json(
      {
        error: "Campaign already exists",
        id: parsed.data.id,
        details: { fieldErrors: { id: ["Campaign ID already exists"] } }
      },
      409
    );
  }
  if (writeMode.data === "update" && !existing) {
    return c.json(
      {
        error: "Campaign not found",
        id: parsed.data.id,
        details: { fieldErrors: { id: ["Campaign ID not found"] } }
      },
      404
    );
  }
  await repo.upsertCampaign(parsed.data);
  return c.json({ ok: true, campaign: parsed.data }, 201);
});

adminRoutes.patch("/campaigns/:id", async (c) => {
  const id = c.req.param("id");
  if (!CAMPAIGN_ID_PATTERN.test(id)) {
    return c.json({ error: "Invalid campaign ID" }, 400);
  }

  const parsedBody = await parseJson(c);
  if (!parsedBody.ok) {
    return c.json({ error: parsedBody.error }, parsedBody.status);
  }

  const body = isJsonObject(parsedBody.value) ? parsedBody.value : {};

  if (typeof body.enabled !== "boolean") {
    return c.json({ error: "enabled boolean is required" }, 400);
  }

  const repo = new Repository(c.env.DB);
  const changed = await repo.setCampaignEnabled(id, body.enabled);
  if (!changed) {
    return c.json({ error: "Campaign not found", id }, 404);
  }
  return c.json({ ok: true, id, enabled: body.enabled });
});

adminRoutes.delete("/campaigns/:id", async (c) => {
  const id = c.req.param("id");
  if (!CAMPAIGN_ID_PATTERN.test(id)) {
    return c.json({ error: "Invalid campaign ID" }, 400);
  }

  const repo = new Repository(c.env.DB);
  const deleted = await repo.deleteCampaignCascade(id);
  if (deleted.campaign === 0) {
    return c.json({ error: "Campaign not found", id, deleted }, 404);
  }
  return c.json({ ok: true, id, deleted });
});
