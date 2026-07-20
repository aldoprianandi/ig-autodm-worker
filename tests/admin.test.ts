import { afterEach, describe, expect, it, vi } from "vitest";
import { app } from "../src/index";

const env = {
  ADMIN_TOKEN: "test-admin-token-with-enough-entropy",
  META_VERIFY_TOKEN: "verify-token",
  META_APP_SECRET: "test-meta-app-secret-with-enough-entropy",
  INSTAGRAM_ACCESS_TOKEN: "ig-token",
  INSTAGRAM_ACCOUNT_ID: "ig-account",
  ADMIN_LOGIN_USERNAME: "admin",
  ADMIN_LOGIN_PASSWORD: "test-admin-login-password",
  DB: createAdminDb()
} as never;

describe("admin routes", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("serves public legal pages for Meta app publishing", async () => {
    const root = await app.request("/", {}, env);
    const privacy = await app.request("/privacy", {}, env);
    const terms = await app.request("/terms", {}, env);
    const deletion = await app.request("/data-deletion", {}, env);
    const deletionAlias = await app.request("/data_deletion", {}, env);

    expect(root.status).toBe(200);
    expect(root.headers.get("Cache-Control")).toBe("no-store");
    expect(root.headers.get("Content-Security-Policy")).toContain("script-src 'none'");
    expect(root.headers.get("X-Frame-Options")).toBe("DENY");
    await expect(root.text()).resolves.toContain("Ki’Savan AutoDM");

    expect(privacy.status).toBe(200);
    await expect(privacy.text()).resolves.toContain("Privacy Policy");

    expect(terms.status).toBe(200);
    await expect(terms.text()).resolves.toContain("Terms of Service");

    expect(deletion.status).toBe(200);
    await expect(deletion.text()).resolves.toContain("Data Deletion Instructions");

    expect(deletionAlias.status).toBe(200);
    await expect(deletionAlias.text()).resolves.toContain("Data Deletion Instructions");
  });

  it("serves the browser admin UI shell without embedding secret values", async () => {
    const response = await app.request("/admin-ui", {}, env);

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("Pragma")).toBe("no-cache");
    expect(response.headers.get("Content-Security-Policy")).toContain("frame-ancestors 'none'");
    expect(response.headers.get("Content-Security-Policy")).toContain("script-src 'nonce-");
    expect(response.headers.get("Content-Security-Policy")).toContain("object-src 'none'");
    expect(response.headers.get("Content-Security-Policy")).toContain("trusted-types 'none'");
    expect(response.headers.get("X-Frame-Options")).toBe("DENY");

    const html = await response.text();

    // Identité et interface française
    expect(html).toContain("Ki’Savan AutoDM");
    expect(html).toContain("data-admin-ui");
    expect(html).toContain("Se connecter au tableau de bord");
    expect(html).toContain("Identifiant");
    expect(html).toContain("Mot de passe");
    expect(html).toContain("Clé de sécurité");
    expect(html).toContain("Enregistrer le brouillon");
    expect(html).toContain("Activer la campagne");
    expect(html).toContain("Supprimer la campagne");

    // Routes et fonctions essentielles
    expect(html).toContain("/admin/session");
    expect(html).toContain("/admin/bootstrap");
    expect(html).toContain("/admin/campaigns/");
    expect(html).toContain("followGateEnabled");
    expect(html).toContain("followGateText");
    expect(html).toContain("followGateButtonTitle");
    expect(html).toContain("openingFailureReplyText");

    // Aucun secret ne doit être intégré dans le HTML
    expect(html).not.toContain("test-admin-token-with-enough-entropy");
    expect(html).not.toContain("ig-token");
    expect(html).not.toContain("test-meta-app-secret-with-enough-entropy");
    expect(html).not.toContain("sessionStorage");
    expect(html).not.toContain("challenges.cloudflare.com/turnstile");
  });

  it("serves Turnstile on the admin UI only when Turnstile keys are configured", async () => {
    const response = await app.request(
      "/admin-ui",
      {},
      { ...(env as Record<string, unknown>), TURNSTILE_SITE_KEY: "test-site-key", TURNSTILE_SECRET_KEY: "test-secret-key" } as never
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Security-Policy")).toContain("https://challenges.cloudflare.com");
    const html = await response.text();
    expect(html).toContain("https://challenges.cloudflare.com/turnstile/v0/api.js");
    expect(html).toContain('data-sitekey="test-site-key"');
    expect(html).not.toContain("test-secret-key");
  });

  it("rejects requests without the admin bearer token", async () => {
    const response = await app.request("/admin/campaigns", {}, env);

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized" });
  });

  it("fails closed when admin storage is missing", async () => {
    const response = await app.request(
      "/admin/campaigns",
      {
        headers: {
          Authorization: "Bearer test-admin-token-with-enough-entropy"
        }
      },
      { ...(env as Record<string, unknown>), DB: undefined } as never
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: "Admin storage is not configured" });
  });

  it("exchanges the admin login for an HttpOnly session plus CSRF token", async () => {
    const db = createSessionDb();
    const sessionEnv = { ...(env as Record<string, unknown>), DB: db } as never;
    const login = await app.request(
      "/admin/session",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "User-Agent": "vitest" },
        body: JSON.stringify({
          username: "admin",
          password: "test-admin-login-password",
          adminToken: "test-admin-token-with-enough-entropy"
        })
      },
      sessionEnv
    );

    expect(login.status).toBe(200);
    const setCookie = login.headers.get("Set-Cookie") || "";
    expect(setCookie).toContain("ig_admin_session=");
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("SameSite=Strict");
    expect(setCookie).not.toContain("test-admin-token-with-enough-entropy");
    const loginBody = (await login.json()) as { csrfToken: string; expiresAt: string; bootstrap: unknown };
    expect(loginBody.csrfToken).toBeTruthy();
    expect(loginBody.expiresAt).toMatch(/Z$/);
    expect(loginBody.bootstrap).toBeTruthy();

    const campaigns = await app.request(
      "/admin/campaigns",
      {
        headers: {
          Cookie: setCookie.split(";")[0],
          "X-CSRF-Token": loginBody.csrfToken,
          "User-Agent": "vitest"
        }
      },
      sessionEnv
    );

    expect(campaigns.status).toBe(200);
    await expect(campaigns.json()).resolves.toEqual({ campaigns: [] });
  });

  it("requires Turnstile verification when Turnstile is configured for browser login", async () => {
    const db = createSessionDb();
    const turnstileEnv = {
      ...(env as Record<string, unknown>),
      TURNSTILE_SITE_KEY: "test-site-key",
      TURNSTILE_SECRET_KEY: "test-secret-key",
      DB: db
    } as never;

    const missing = await app.request(
      "/admin/session",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "User-Agent": "vitest" },
        body: JSON.stringify({
          username: "admin",
          password: "test-admin-login-password",
          adminToken: "test-admin-token-with-enough-entropy"
        })
      },
      turnstileEnv
    );

    expect(missing.status).toBe(401);
    expect(db.sessions.size).toBe(0);
  });

  it("accepts browser login when Turnstile verification succeeds", async () => {
    const db = createSessionDb();
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const login = await app.request(
      "/admin/session",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "User-Agent": "vitest" },
        body: JSON.stringify({
          username: "admin",
          password: "test-admin-login-password",
          adminToken: "test-admin-token-with-enough-entropy",
          turnstileToken: "turnstile-response"
        })
      },
      {
        ...(env as Record<string, unknown>),
        TURNSTILE_SITE_KEY: "test-site-key",
        TURNSTILE_SECRET_KEY: "test-secret-key",
        DB: db
      } as never
    );

    expect(login.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      expect.objectContaining({ method: "POST" })
    );
    expect(db.sessions.size).toBe(1);
  });

  it("rejects session-cookie admin requests without the CSRF header", async () => {
    const db = createSessionDb();
    const sessionEnv = { ...(env as Record<string, unknown>), DB: db } as never;
    const login = await app.request(
      "/admin/session",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "User-Agent": "vitest" },
        body: JSON.stringify({
          username: "admin",
          password: "test-admin-login-password",
          adminToken: "test-admin-token-with-enough-entropy"
        })
      },
      sessionEnv
    );

    const campaigns = await app.request(
      "/admin/campaigns",
      {
        headers: {
          Cookie: (login.headers.get("Set-Cookie") || "").split(";")[0],
          "User-Agent": "vitest"
        }
      },
      sessionEnv
    );

    expect(campaigns.status).toBe(401);
    await expect(campaigns.json()).resolves.toEqual({ error: "Unauthorized" });
  });

  it("resumes a browser admin session after page refresh and rotates CSRF", async () => {
    const db = createSessionDb();
    const sessionEnv = { ...(env as Record<string, unknown>), DB: db } as never;
    const login = await app.request(
      "/admin/session",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "User-Agent": "vitest" },
        body: JSON.stringify({
          username: "admin",
          password: "test-admin-login-password",
          adminToken: "test-admin-token-with-enough-entropy"
        })
      },
      sessionEnv
    );
    const cookie = (login.headers.get("Set-Cookie") || "").split(";")[0];
    const loginBody = (await login.json()) as { csrfToken: string };

    const resume = await app.request(
      "/admin/session",
      {
        headers: {
          Cookie: cookie,
          "User-Agent": "vitest"
        }
      },
      sessionEnv
    );

    expect(resume.status).toBe(200);
    const resumeBody = (await resume.json()) as { csrfToken: string; expiresAt: string; bootstrap?: unknown };
    expect(resumeBody.csrfToken).toBeTruthy();
    expect(resumeBody.csrfToken).not.toBe(loginBody.csrfToken);
    expect(resumeBody.expiresAt).toMatch(/Z$/);
    expect(resumeBody.bootstrap).toBeUndefined();

    const bootstrapWithoutCsrf = await app.request(
      "/admin/bootstrap",
      {
        headers: {
          Cookie: cookie,
          "User-Agent": "vitest"
        }
      },
      sessionEnv
    );
    expect(bootstrapWithoutCsrf.status).toBe(401);

    const oldCsrf = await app.request(
      "/admin/campaigns",
      {
        headers: {
          Cookie: cookie,
          "X-CSRF-Token": loginBody.csrfToken,
          "User-Agent": "vitest"
        }
      },
      sessionEnv
    );
    expect(oldCsrf.status).toBe(401);

    const campaigns = await app.request(
      "/admin/campaigns",
      {
        headers: {
          Cookie: cookie,
          "X-CSRF-Token": resumeBody.csrfToken,
          "User-Agent": "vitest"
        }
      },
      sessionEnv
    );
    expect(campaigns.status).toBe(200);

    const bootstrapWithCsrf = await app.request(
      "/admin/bootstrap",
      {
        headers: {
          Cookie: cookie,
          "X-CSRF-Token": resumeBody.csrfToken,
          "User-Agent": "vitest"
        }
      },
      sessionEnv
    );
    expect(bootstrapWithCsrf.status).toBe(200);
    await expect(bootstrapWithCsrf.json()).resolves.toMatchObject({
      dashboard: expect.any(Object),
      campaigns: expect.any(Array),
      templates: expect.any(Array)
    });
  });

  it("rejects browser session login when username or password is wrong", async () => {
    const db = createSessionDb();
    const response = await app.request(
      "/admin/session",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "User-Agent": "vitest" },
        body: JSON.stringify({
          username: "admin",
          password: "wrong-password",
          adminToken: "test-admin-token-with-enough-entropy"
        })
      },
      { ...(env as Record<string, unknown>), DB: db } as never
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized" });
    expect(db.sessions.size).toBe(0);
  });

  it("fails closed when browser login credentials are not configured", async () => {
    const response = await app.request(
      "/admin/session",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: "admin",
          password: "test-admin-login-password",
          adminToken: "test-admin-token-with-enough-entropy"
        })
      },
      { ...(env as Record<string, unknown>), ADMIN_LOGIN_USERNAME: undefined, DB: createSessionDb() } as never
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: "Admin login is not configured" });
  });

  it("fails closed when the admin token secret is missing or unsafe", async () => {
    for (const adminToken of [undefined, "short", "replace-with-admin-token"]) {
      const response = await app.request(
        "/admin/campaigns",
        {
          headers: {
            Authorization: "Bearer undefined"
          }
        },
        { ...(env as Record<string, unknown>), ADMIN_TOKEN: adminToken } as never
      );

      expect(response.status).toBe(503);
      await expect(response.json()).resolves.toEqual({ error: "Admin authentication is not configured" });
    }
  });

  it("does not call Instagram upstream routes before admin auth succeeds", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await app.request("/admin/media", {}, env);

    expect(response.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("validates campaign creation payload before touching storage", async () => {
    const response = await app.request(
      "/admin/campaigns",
      {
        method: "POST",
        headers: {
          Authorization: "Bearer test-admin-token-with-enough-entropy",
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ id: "x" })
      },
      env
    );

    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: string };
    expect(body.error).toBe("Invalid campaign");
  });

  it("rejects oversized admin JSON before parsing", async () => {
    const response = await app.request(
      "/admin/campaigns",
      {
        method: "POST",
        headers: {
          Authorization: "Bearer test-admin-token-with-enough-entropy",
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ id: "x".repeat(70_000) })
      },
      env
    );

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toEqual({ error: "Request body too large" });
  });

  it("lists recent Instagram media without exposing the access token", async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      expect(url).toContain("graph.instagram.com/v25.0/ig-account/media");
      expect(url).not.toContain("access_token");
      expect(init?.headers).toEqual({ Authorization: "Bearer ig-token" });
      return Response.json({
        data: [{ id: "media-1", permalink: "https://instagram.com/p/example/" }],
        paging: { next: "https://graph.instagram.com/v25.0/ig-account/media?access_token=ig-token" }
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const response = await app.request(
      "/admin/media",
      {
        headers: {
          Authorization: "Bearer test-admin-token-with-enough-entropy"
        }
      },
      env
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      data: [
        {
          id: "media-1",
          caption: undefined,
          permalink: "https://instagram.com/p/example/",
          timestamp: undefined,
          mediaProductType: undefined,
          mediaType: undefined
        }
      ]
    });
  });

  it("redacts sensitive values from upstream Instagram errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json(
          {
            error: {
              code: 190,
              type: "OAuthException",
              message: "bad access_token=ig-token Bearer other-token IGAASECRET"
            }
          },
          { status: 400 }
        )
      )
    );

    const response = await app.request(
      "/admin/media",
      {
        headers: {
          Authorization: "Bearer test-admin-token-with-enough-entropy"
        }
      },
      env
    );

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({
      error: "Instagram media fetch failed",
      upstreamStatus: 400,
      upstreamError: {
        code: 190,
        type: "OAuthException",
        message: "bad access_token=[REDACTED] Bearer [REDACTED] [REDACTED]"
      }
    });
  });

  it("accepts message variants while forcing the standard one-button flow", async () => {
    const response = await app.request(
      "/admin/campaigns",
      {
        method: "POST",
        headers: {
          Authorization: "Bearer test-admin-token-with-enough-entropy",
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          id: "campaign-variants",
          name: "Campaign Variants",
          mediaId: "media-1",
          keyword: "PROMPT",
          openingText: "Opening utama",
          openingTextVariants: ["Opening alt", "Opening utama", "Opening alt"],
          buttonTitle: "KIRIM",
          buttonPayload: "campaign-variants:confirm",
          dmSteps: [
            { text: "Pilih gaya dulu", textVariants: ["Pilih gaya dulu", "Mau pilih gaya dulu?"], buttonTitle: "LANJUT" },
            { text: "Oke, promptnya gue kirim setelah ini", textVariants: ["Oke, promptnya gue kirim setelah ini"], buttonTitle: "AMBIL" }
          ],
          deliveryText: "Final prompt",
          commentReplyText: "Cek DM kamu ya",
          commentReplyTextVariants: ["Masuk DM ya", "Cek DM kamu ya"],
          openingFailureReplyText: "DM kamu belum bisa kami kirim. Komen PROMPT lagi.",
          followGateEnabled: false,
          enabled: false
        })
      },
      { ...(env as Record<string, unknown>), DB: createAdminDb() } as never
    );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      campaign: {
        id: "campaign-variants",
        openingTextVariants: ["Opening utama", "Opening alt"],
        buttonPayload: "campaign-variants:confirm",
        dmSteps: [],
        commentReplyTextVariants: ["Cek DM kamu ya", "Masuk DM ya"],
        openingFailureReplyText: "DM kamu belum bisa kami kirim. Komen PROMPT lagi."
      }
    });
  });

  it("normalizes direct-link button payloads back to the standard postback flow", async () => {
    const response = await app.request(
      "/admin/campaigns",
      {
        method: "POST",
        headers: {
          Authorization: "Bearer test-admin-token-with-enough-entropy",
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          id: "direct-link-campaign",
          name: "Direct Link Campaign",
          mediaId: "media-1",
          keyword: "PROMPT",
          openingText: "Opening utama",
          buttonTitle: "BUKA",
          buttonPayload: "https://example.com/prompt?source=copy_link",
          deliveryText: "Final prompt",
          commentReplyText: "Cek DM kamu ya",
          followGateEnabled: true,
          enabled: false
        })
      },
      { ...(env as Record<string, unknown>), DB: createAdminDb() } as never
    );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      campaign: {
        id: "direct-link-campaign",
        buttonPayload: "direct-link-campaign:confirm",
        followGateEnabled: false,
        dmSteps: []
      }
    });
  });

  it("preserves follow gate for a standard one-button TEMBOK campaign", async () => {
    const response = await app.request(
      "/admin/campaigns",
      {
        method: "POST",
        headers: {
          Authorization: "Bearer test-admin-token-with-enough-entropy",
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          id: "standard-flow-campaign",
          name: "Standard Flow Campaign",
          mediaId: "media-1",
          keyword: "PROMPT",
          openingText: "Opening utama",
          buttonTitle: "TEMBOK",
          buttonPayload: "anything-else",
          deliveryText: "Final prompt",
          commentReplyText: "Cek DM kamu ya",
          followGateEnabled: true,
          followGateText: "Follow dulu akun ini, lalu pencet TEMBOK lagi ya.",
          followGateButtonTitle: "UDAH FOLLOW",
          enabled: false
        })
      },
      { ...(env as Record<string, unknown>), DB: createAdminDb() } as never
    );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      campaign: {
        id: "standard-flow-campaign",
        buttonPayload: "standard-flow-campaign:confirm",
        buttonTitle: "TEMBOK",
        followGateEnabled: true,
        followGateText: "Follow dulu akun ini, lalu pencet TEMBOK lagi ya.",
        followGateButtonTitle: "UDAH FOLLOW",
        dmSteps: []
      }
    });
  });

  it("rejects create-mode campaign writes that would overwrite an existing campaign", async () => {
    const db = createAdminDb();
    const campaignEnv = { ...(env as Record<string, unknown>), DB: db } as never;
    const payload = {
      id: "campaign-variants",
      name: "Campaign Variants",
      mediaId: "media-1",
      keyword: "PROMPT",
      openingText: "Opening utama",
      buttonTitle: "KIRIM",
      buttonPayload: "campaign-variants:confirm",
      deliveryText: "Final prompt",
      commentReplyText: "Cek DM kamu ya",
      followGateEnabled: false,
      enabled: false,
      writeMode: "create"
    };

    const first = await app.request(
      "/admin/campaigns",
      {
        method: "POST",
        headers: {
          Authorization: "Bearer test-admin-token-with-enough-entropy",
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      },
      campaignEnv
    );
    expect(first.status).toBe(201);

    const duplicate = await app.request(
      "/admin/campaigns",
      {
        method: "POST",
        headers: {
          Authorization: "Bearer test-admin-token-with-enough-entropy",
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ ...payload, name: "Overwrite Attempt" })
      },
      campaignEnv
    );

    expect(duplicate.status).toBe(409);
    await expect(duplicate.json()).resolves.toMatchObject({
      error: "Campaign already exists",
      id: "campaign-variants"
    });
  });

  it("returns 404 when update-mode campaign writes target a missing campaign", async () => {
    const response = await app.request(
      "/admin/campaigns",
      {
        method: "POST",
        headers: {
          Authorization: "Bearer test-admin-token-with-enough-entropy",
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          id: "missing-campaign",
          name: "Missing Campaign",
          mediaId: "media-1",
          keyword: "PROMPT",
          openingText: "Opening utama",
          buttonTitle: "KIRIM",
          buttonPayload: "missing-campaign:confirm",
          deliveryText: "Final prompt",
          commentReplyText: "Cek DM kamu ya",
          followGateEnabled: false,
          enabled: false,
          writeMode: "update"
        })
      },
      { ...(env as Record<string, unknown>), DB: createAdminDb() } as never
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({ error: "Campaign not found" });
  });

  it("stores reusable message variant templates", async () => {
    const db = createAdminDb();
    const templateEnv = { ...(env as Record<string, unknown>), DB: db } as never;
    const create = await app.request(
      "/admin/variant-templates",
      {
        method: "POST",
        headers: {
          Authorization: "Bearer test-admin-token-with-enough-entropy",
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ kind: "comment_reply", text: "Masuk DM ya" })
      },
      templateEnv
    );

    expect(create.status).toBe(201);
    await expect(create.json()).resolves.toMatchObject({
      ok: true,
      template: {
        kind: "comment_reply",
        text: "Masuk DM ya",
        enabled: true
      }
    });

    const list = await app.request(
      "/admin/variant-templates?kind=comment_reply",
      {
        headers: {
          Authorization: "Bearer test-admin-token-with-enough-entropy"
        }
      },
      templateEnv
    );

    expect(list.status).toBe(200);
    await expect(list.json()).resolves.toMatchObject({
      templates: [
        {
          kind: "comment_reply",
          text: "Masuk DM ya",
          enabled: true
        }
      ]
    });
  });

  it("rejects public reply templates over the campaign reply limit", async () => {
    const response = await app.request(
      "/admin/variant-templates",
      {
        method: "POST",
        headers: {
          Authorization: "Bearer test-admin-token-with-enough-entropy",
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ kind: "comment_reply", text: "x".repeat(301) })
      },
      { ...(env as Record<string, unknown>), DB: createAdminDb() } as never
    );

    expect(response.status).toBe(400);
    const body = (await response.json()) as { details?: { fieldErrors?: Record<string, string[]> } };
    expect(body.details?.fieldErrors?.text?.[0]).toContain("300");
  });

  it("stores reusable message variant templates in bulk", async () => {
    const db = createAdminDb();
    const bulk = await app.request(
      "/admin/variant-templates/bulk",
      {
        method: "POST",
        headers: {
          Authorization: "Bearer test-admin-token-with-enough-entropy",
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ kind: "opening", texts: ["Opening A", "Opening B", "Opening A"] })
      },
      { ...(env as Record<string, unknown>), DB: db } as never
    );

    expect(bulk.status).toBe(201);
    await expect(bulk.json()).resolves.toMatchObject({ ok: true, count: 2 });
  });

  it("lists media comments without exposing paging URLs", async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      expect(url).toContain("graph.instagram.com/v25.0/media-1/comments");
      expect(url).toContain("fields=id%2Ctext%2Cusername%2Ctimestamp");
      expect(url).not.toContain("access_token");
      expect(init?.headers).toEqual({ Authorization: "Bearer ig-token" });
      return Response.json({
        data: [{ id: "comment-1", text: "PROMPT", username: "user-1", timestamp: "2026-05-07T07:42:01+0000" }],
        paging: { next: "https://graph.instagram.com/v25.0/media-1/comments?access_token=ig-token" }
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const response = await app.request(
      "/admin/media/media-1/comments",
      {
        headers: {
          Authorization: "Bearer test-admin-token-with-enough-entropy"
        }
      },
      env
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      data: [
        {
          id: "comment-1",
          text: "PROMPT",
          username: "user-1",
          timestamp: "2026-05-07T07:42:01+0000"
        }
      ]
    });
  });

  it("rejects unsafe Meta path identifiers before upstream calls", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await app.request(
      "/admin/media/media%2Fbad/comments",
      {
        headers: {
          Authorization: "Bearer test-admin-token-with-enough-entropy"
        }
      },
      env
    );

    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toEqual({ error: "Invalid media ID" });
  });

  it("checks Instagram webhook subscription without exposing access tokens", async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      expect(url).toContain("graph.instagram.com/v25.0/ig-account/subscribed_apps");
      expect(url).not.toContain("access_token");
      expect(init?.headers).toEqual({ Authorization: "Bearer ig-token" });
      return Response.json({
        data: [{ id: "app-1", subscribed_fields: ["comments", "messages"], target_updates: { enabled: true } }],
        paging: { next: "https://graph.instagram.com/v25.0/ig-account/subscribed_apps?access_token=ig-token" }
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const response = await app.request(
      "/admin/subscription",
      {
        headers: {
          Authorization: "Bearer test-admin-token-with-enough-entropy"
        }
      },
      env
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      data: [
        {
          id: "app-1",
          subscribedFields: ["comments", "messages"],
          targetUpdates: { enabled: true }
        }
      ]
    });
  });

  it("serves an operational dashboard without exposing token values", async () => {
    const response = await app.request(
      "/admin/dashboard",
      {
        headers: {
          Authorization: "Bearer test-admin-token-with-enough-entropy"
        }
      },
      { ...(env as Record<string, unknown>), DB: createDashboardDb() } as never
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      counts: {
        campaigns: 2,
        enabledCampaigns: 1,
        contactStates: 3,
        webhookEvents: 10,
        deliveries: 7,
        failedDeliveries: 1,
        retryingDeliveries: 0
      },
      token: {
        configured: true,
        source: "env",
        expiresAt: null,
        lastError: null
      },
      limits: {
        adminRequestsPerMinute: 60,
        metaSendsPerMinute: 30,
        pollLimitPerMedia: 25
      }
    });
  });

  it("queues a manual follow-gate retry for a waiting final delivery", async () => {
    const db = createFollowRetryDb("waiting_follow");
    const queue = createQueueStub();
    const response = await app.request(
      "/admin/deliveries/campaign-1/user-1/follow-retry",
      {
        method: "POST",
        headers: {
          Authorization: "Bearer test-admin-token-with-enough-entropy"
        }
      },
      { ...(env as Record<string, unknown>), DB: db, DELIVERY_QUEUE: queue } as never
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      deliveryId: "campaign-1:user-1:final",
      campaignId: "campaign-1",
      igUserId: "user-1",
      deliveryType: "final"
    });
    expect(queue.jobs).toEqual([
      {
        deliveryId: "campaign-1:user-1:final",
        campaignId: "campaign-1",
        igUserId: "user-1",
        deliveryType: "final"
      }
    ]);
    expect(db.deliveryStatus).toBe("queued");
    expect(db.operationalEvents).toEqual([{ eventType: "manual_follow_retry", status: "queued" }]);
  });

  it("does not queue a manual follow-gate retry when no waiting final exists", async () => {
    const db = createFollowRetryDb("sent");
    const queue = createQueueStub();
    const response = await app.request(
      "/admin/deliveries/campaign-1/user-1/follow-retry",
      {
        method: "POST",
        headers: {
          Authorization: "Bearer test-admin-token-with-enough-entropy"
        }
      },
      { ...(env as Record<string, unknown>), DB: db, DELIVERY_QUEUE: queue } as never
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      error: "No waiting follow delivery found",
      campaignId: "campaign-1",
      igUserId: "user-1"
    });
    expect(queue.jobs).toEqual([]);
    expect(db.deliveryStatus).toBe("sent");
  });

  it("subscribes the Instagram account to required webhook fields", async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      expect(init?.method).toBe("POST");
      expect(init?.headers).toEqual({ Authorization: "Bearer ig-token" });
      expect(url).toContain("graph.instagram.com/v25.0/ig-account/subscribed_apps");
      expect(url).toContain("subscribed_fields=comments%2Cmessages%2Cmessaging_postbacks");
      expect(url).not.toContain("access_token");
      return Response.json({ success: true });
    });
    vi.stubGlobal("fetch", fetchMock);

    const response = await app.request(
      "/admin/subscription",
      {
        method: "POST",
        headers: {
          Authorization: "Bearer test-admin-token-with-enough-entropy",
          "Content-Type": "application/json"
        },
        body: JSON.stringify({})
      },
      env
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      subscribedFields: ["comments", "messages", "messaging_postbacks"]
    });
  });

  it("uses default subscription fields when body is empty", async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      expect(init?.method).toBe("POST");
      expect(url).toContain("subscribed_fields=comments%2Cmessages%2Cmessaging_postbacks");
      return Response.json({ success: true });
    });
    vi.stubGlobal("fetch", fetchMock);

    const response = await app.request(
      "/admin/subscription",
      {
        method: "POST",
        headers: {
          Authorization: "Bearer test-admin-token-with-enough-entropy"
        }
      },
      env
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      subscribedFields: ["comments", "messages", "messaging_postbacks"]
    });
  });

  it("rejects malformed admin JSON without throwing", async () => {
    const response = await app.request(
      "/admin/subscription",
      {
        method: "POST",
        headers: {
          Authorization: "Bearer test-admin-token-with-enough-entropy",
          "Content-Type": "application/json"
        },
        body: "{"
      },
      env
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Invalid JSON body" });
  });

  it("sets no-store security headers on admin API responses", async () => {
    const response = await app.request("/admin/campaigns", {}, env);

    expect(response.status).toBe(401);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("Pragma")).toBe("no-cache");
    expect(response.headers.get("Referrer-Policy")).toBe("no-referrer");
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(response.headers.get("X-Frame-Options")).toBe("DENY");
    expect(response.headers.get("Permissions-Policy")).toContain("camera=()");
  });

  it("rate limits repeated failed admin auth attempts before token checking", async () => {
    const db = createRateLimitDb();
    const rateLimitEnv = { ...(env as Record<string, unknown>), DB: db } as never;
    let response = new Response(null, { status: 500 });

    for (let i = 0; i < 31; i += 1) {
      response = await app.request(
        "/admin/campaigns",
        {
          headers: {
            Authorization: "Bearer wrong-token"
          }
        },
        rateLimitEnv
      );
    }

    expect(response.status).toBe(429);
    const body = (await response.json()) as { error: string; resetAt: string };
    expect(body.error).toBe("Too many failed admin attempts");
    expect(body.resetAt).toMatch(/Z$/);
    expect(db.auditInserts).toHaveLength(31);
    expect(db.auditInserts.map((entry) => entry.action)).not.toContain("rate_limited");
  });

  it("deletes a campaign and related state through the admin API", async () => {
    const db = createCampaignDeleteDb();

    const response = await app.request(
      "/admin/campaigns/campaign-1",
      {
        method: "DELETE",
        headers: {
          Authorization: "Bearer test-admin-token-with-enough-entropy"
        }
      },
      { ...(env as Record<string, unknown>), DB: db } as never
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      id: "campaign-1",
      deleted: {
        campaign: 1,
        contactStates: 3,
        deliveries: 2,
        webhookEvents: 4
      }
    });
    expect(db.deletes).toEqual([
      ["DELETE FROM deliveries WHERE campaign_id = ?1", "campaign-1"],
      ["DELETE FROM contact_states WHERE campaign_id = ?1", "campaign-1"],
      ["DELETE FROM webhook_events WHERE campaign_id = ?1", "campaign-1"],
      ["DELETE FROM campaigns WHERE id = ?1", "campaign-1"]
    ]);
  });

  it("returns 404 when enabling or deleting a missing campaign", async () => {
    const db = createCampaignDeleteDb(0);
    const missingEnv = { ...(env as Record<string, unknown>), DB: db } as never;

    const patch = await app.request(
      "/admin/campaigns/missing-campaign",
      {
        method: "PATCH",
        headers: {
          Authorization: "Bearer test-admin-token-with-enough-entropy",
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ enabled: false })
      },
      { ...(env as Record<string, unknown>), DB: createAdminDb() } as never
    );
    expect(patch.status).toBe(404);

    const deletion = await app.request(
      "/admin/campaigns/missing-campaign",
      {
        method: "DELETE",
        headers: {
          Authorization: "Bearer test-admin-token-with-enough-entropy"
        }
      },
      missingEnv
    );
    expect(deletion.status).toBe(404);
    await expect(deletion.json()).resolves.toMatchObject({
      error: "Campaign not found",
      deleted: { campaign: 0 }
    });
  });
});

function createAdminDb() {
  const counts = new Map<string, number>();
  const sessions = new Map<string, Record<string, unknown>>();
  const templates = new Map<string, Record<string, unknown>>();
  const campaigns = new Map<string, Record<string, unknown>>();
  const auditInserts: Array<{ action: string; status: number }> = [];

  return {
    auditInserts,
    sessions,
    async batch(statements: Array<{ run: () => Promise<unknown> }>) {
      return Promise.all(statements.map((statement) => statement.run()));
    },
    prepare(sql: string) {
      const statement = (params: unknown[] = []) => ({
        async first() {
          if (sql.includes("SELECT count FROM admin_rate_limits")) {
            return { count: counts.get(`${params[0]}:${params[1]}`) ?? 0 };
          }
          if (sql.includes("SELECT encrypted_token")) {
            return null;
          }
          if (sql.includes("FROM admin_sessions")) {
            const row = sessions.get(String(params[0]));
            if (!row) return null;
            if (row.revoked_at != null) return null;
            if (String(row.expires_at) <= String(params[1])) return null;
            return row;
          }
          if (sql.includes("SELECT * FROM campaigns WHERE id")) {
            return campaigns.get(String(params[0])) ?? null;
          }
          if (sql.includes("FROM message_variant_templates")) {
            return templates.get(`${params[0]}:${params[1]}`) ?? null;
          }
          return null;
        },
        async run() {
          if (sql.includes("INSERT OR IGNORE INTO admin_rate_limits")) {
            const key = `${params[0]}:${params[1]}`;
            if (counts.has(key)) return { meta: { changes: 0 } };
            counts.set(key, 1);
            return { meta: { changes: 1 } };
          }
          if (sql.includes("UPDATE admin_rate_limits")) {
            const key = `${params[0]}:${params[1]}`;
            const limit = Number(params[3]);
            const count = counts.get(key) ?? 0;
            if (count >= limit) return { meta: { changes: 0 } };
            counts.set(key, count + 1);
            return { meta: { changes: 1 } };
          }
          if (sql.includes("INSERT INTO admin_audit_logs")) {
            auditInserts.push({ action: String(params[4]), status: Number(params[5]) });
            return { meta: { changes: 1 } };
          }
          if (sql.includes("INSERT INTO admin_sessions")) {
            sessions.set(String(params[0]), {
              id_hash: params[0],
              csrf_hash: params[1],
              actor_key_hash: params[2],
              user_agent_hash: params[3],
              expires_at: params[4],
              revoked_at: null,
              created_at: params[5],
              last_seen_at: params[5]
            });
            return { meta: { changes: 1 } };
          }
          if (sql.includes("UPDATE admin_sessions SET last_seen_at")) {
            const row = sessions.get(String(params[0]));
            if (row) row.last_seen_at = params[1];
            return { meta: { changes: row ? 1 : 0 } };
          }
          if (sql.includes("UPDATE admin_sessions SET csrf_hash")) {
            const row = sessions.get(String(params[0]));
            if (row) {
              row.csrf_hash = params[1];
              row.last_seen_at = params[2];
            }
            return { meta: { changes: row ? 1 : 0 } };
          }
          if (sql.includes("UPDATE admin_sessions SET revoked_at")) {
            const row = sessions.get(String(params[0]));
            if (row) {
              row.revoked_at = params[1];
              row.last_seen_at = params[1];
            }
            return { meta: { changes: row ? 1 : 0 } };
          }
          if (sql.includes("INSERT INTO campaigns")) {
            campaigns.set(String(params[0]), {
              id: params[0],
              name: params[1],
              media_id: params[2],
              keyword: params[3],
              opening_text: params[4],
              opening_text_variants: params[5],
              button_title: params[6],
              button_payload: params[7],
              dm_steps: params[8],
              delivery_text: params[9],
              comment_reply_text: params[10],
              comment_reply_text_variants: params[11],
              opening_failure_reply_text: params[12],
              follow_gate_enabled: params[13],
              follow_gate_text: params[14],
              follow_gate_button_title: params[15],
              enabled: params[16],
              created_at: params[17],
              updated_at: params[17]
            });
            return { meta: { changes: 1 } };
          }
          if (sql.includes("UPDATE campaigns SET enabled")) {
            const row = campaigns.get(String(params[0]));
            if (row) {
              row.enabled = params[1];
              row.updated_at = params[2];
            }
            return { meta: { changes: row ? 1 : 0 } };
          }
          if (sql.includes("INSERT INTO message_variant_templates")) {
            const key = `${params[1]}:${params[2]}`;
            const existing = templates.get(key);
            templates.set(key, {
              id: existing?.id ?? params[0],
              kind: params[1],
              text: params[2],
              enabled: params[3],
              created_at: existing?.created_at ?? params[4],
              updated_at: params[4]
            });
            return { meta: { changes: 1 } };
          }
          return { meta: { changes: 1 } };
        },
        async all() {
          if (sql.includes("FROM campaigns")) {
            return { results: [...campaigns.values()] };
          }
          if (sql.includes("FROM admin_audit_logs")) {
            return { results: [] };
          }
          if (sql.includes("FROM message_variant_templates")) {
            const kindFilter = typeof params[0] === "string" && ["opening", "comment_reply"].includes(params[0]);
            const textFilter = sql.includes("text IN") ? new Set(params.slice(1).map(String)) : null;
            const rows = [...templates.values()].filter((row) => {
              if (Number(row.enabled) !== 1) return false;
              if (kindFilter && row.kind !== params[0]) return false;
              if (textFilter && !textFilter.has(String(row.text))) return false;
              return true;
            });
            return { results: rows };
          }
          return { results: [] };
        }
      });

      return {
        bind(...params: unknown[]) {
          return statement(params);
        },
        ...statement()
      };
    }
  };
}

function createSessionDb() {
  return createAdminDb();
}

function createRateLimitDb() {
  const counts = new Map<string, number>();
  const auditInserts: Array<{ action: string; status: number }> = [];

  return {
    auditInserts,
    prepare(sql: string) {
      return {
        bind(...params: unknown[]) {
          return {
            async first() {
              if (sql.includes("SELECT count FROM admin_rate_limits")) {
                return { count: counts.get(`${params[0]}:${params[1]}`) ?? 0 };
              }
              return null;
            },
            async run() {
              if (sql.includes("INSERT OR IGNORE INTO admin_rate_limits")) {
                const key = `${params[0]}:${params[1]}`;
                if (counts.has(key)) return { meta: { changes: 0 } };
                counts.set(key, 1);
                return { meta: { changes: 1 } };
              }
              if (sql.includes("UPDATE admin_rate_limits")) {
                const key = `${params[0]}:${params[1]}`;
                const limit = Number(params[3]);
                const count = counts.get(key) ?? 0;
                if (count >= limit) return { meta: { changes: 0 } };
                counts.set(key, count + 1);
                return { meta: { changes: 1 } };
              }
              if (sql.includes("INSERT INTO admin_audit_logs")) {
                auditInserts.push({ action: String(params[4]), status: Number(params[5]) });
                return { meta: { changes: 1 } };
              }
              return { meta: { changes: 1 } };
            },
            async all() {
              return { results: [] };
            }
          };
        }
      };
    }
  };
}

function createCampaignDeleteDb(campaignChanges = 1) {
  const db = {
    deletes: [] as Array<[string, string]>,
    prepare(sql: string) {
      return {
        bind(...params: unknown[]) {
          return {
            async first() {
              if (sql.includes("SELECT count FROM admin_rate_limits")) {
                return { count: 1 };
              }
              return null;
            },
            async run() {
              if (sql.includes("INSERT OR IGNORE INTO admin_rate_limits")) {
                return { meta: { changes: 1 } };
              }
              if (sql.includes("INSERT INTO admin_audit_logs")) {
                return { meta: { changes: 1 } };
              }
              if (sql.startsWith("DELETE")) {
                db.deletes.push([sql, String(params[0])]);
                if (sql.includes("deliveries")) return { meta: { changes: 2 } };
                if (sql.includes("contact_states")) return { meta: { changes: 3 } };
                if (sql.includes("webhook_events")) return { meta: { changes: 4 } };
                if (sql.includes("campaigns")) return { meta: { changes: campaignChanges } };
              }
              return { meta: { changes: 1 } };
            },
            async all() {
              return { results: [] };
            }
          };
        }
      };
    }
  };
  return db;
}

function createDashboardDb() {
  return {
    prepare(sql: string) {
      return {
        bind() {
          return this;
        },
        async first() {
          if (sql.includes("COUNT(*) AS campaigns")) {
            return {
              campaigns: 2,
              enabled_campaigns: 1,
              contact_states: 3,
              webhook_events: 10,
              deliveries: 7,
              failed_deliveries: 1,
              retrying_deliveries: 0
            };
          }
          if (sql.includes("SELECT encrypted_token")) {
            return null;
          }
          if (sql.includes("SELECT count FROM admin_rate_limits")) {
            return { count: 0 };
          }
          return null;
        },
        async run() {
          return { meta: { changes: 1 } };
        },
        async all() {
          return { results: [] };
        }
      };
    }
  };
}

function createQueueStub() {
  return {
    jobs: [] as unknown[],
    async send(job: unknown) {
      this.jobs.push(job);
    }
  };
}

function createFollowRetryDb(initialDeliveryStatus: string) {
  const counts = new Map<string, number>();
  const db = {
    deliveryStatus: initialDeliveryStatus,
    operationalEvents: [] as Array<{ eventType: string; status: string }>,
    prepare(sql: string) {
      return {
        bind(...params: unknown[]) {
          return {
            async first() {
              if (sql.includes("SELECT count FROM admin_rate_limits")) {
                return { count: counts.get(`${params[0]}:${params[1]}`) ?? 0 };
              }
              if (sql.includes("SELECT * FROM campaigns WHERE id")) {
                if (params[0] !== "campaign-1") return null;
                return {
                  id: "campaign-1",
                  name: "Campaign 1",
                  media_id: "media-1",
                  keyword: "PROMPT",
                  opening_text: "Opening",
                  opening_text_variants: "[]",
                  button_title: "SEND",
                  button_payload: "campaign-1:confirm",
                  dm_steps: "[]",
                  delivery_text: "Final",
                  comment_reply_text: "Check DM",
                  comment_reply_text_variants: "[]",
                  opening_failure_reply_text: null,
                  follow_gate_enabled: 1,
                  follow_gate_text: null,
                  follow_gate_button_title: "I FOLLOWED",
                  enabled: 1
                };
              }
              return null;
            },
            async run() {
              if (sql.includes("INSERT OR IGNORE INTO admin_rate_limits")) {
                const key = `${params[0]}:${params[1]}`;
                if (counts.has(key)) return { meta: { changes: 0 } };
                counts.set(key, 1);
                return { meta: { changes: 1 } };
              }
              if (sql.includes("UPDATE admin_rate_limits")) {
                const key = `${params[0]}:${params[1]}`;
                const limit = Number(params[3]);
                const count = counts.get(key) ?? 0;
                if (count >= limit) return { meta: { changes: 0 } };
                counts.set(key, count + 1);
                return { meta: { changes: 1 } };
              }
              if (sql.includes("INSERT INTO admin_audit_logs")) {
                return { meta: { changes: 1 } };
              }
              if (sql.includes("UPDATE deliveries") && sql.includes("status = 'waiting_follow'")) {
                const expectedDeliveryId = "campaign-1:user-1:final";
                if (params[0] === expectedDeliveryId && db.deliveryStatus === "waiting_follow") {
                  db.deliveryStatus = "queued";
                  return { meta: { changes: 1 } };
                }
                return { meta: { changes: 0 } };
              }
              if (sql.includes("INSERT INTO operational_events")) {
                db.operationalEvents.push({ eventType: String(params[1]), status: String(params[2]) });
                return { meta: { changes: 1 } };
              }
              return { meta: { changes: 1 } };
            },
            async all() {
              return { results: [] };
            }
          };
        }
      };
    }
  };
  return db;
}
