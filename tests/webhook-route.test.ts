import { describe, expect, it } from "vitest";
import { app } from "../src/index";
import { createMetaSignature } from "../src/security/signature";

const env = {
  ADMIN_TOKEN: "test-admin-token-with-enough-entropy",
  META_VERIFY_TOKEN: "verify-token",
  META_APP_SECRET: "test-meta-app-secret-with-enough-entropy",
  INSTAGRAM_ACCESS_TOKEN: "ig-token",
  INSTAGRAM_ACCOUNT_ID: "ig-account"
} as never;

describe("Meta webhook routes", () => {
  it("returns the challenge only when the verify token matches", async () => {
    const valid = await app.request(
      "/webhooks/meta?hub.mode=subscribe&hub.verify_token=verify-token&hub.challenge=abc123",
      {},
      env
    );
    const invalid = await app.request(
      "/webhooks/meta?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=abc123",
      {},
      env
    );

    expect(valid.status).toBe(200);
    await expect(valid.text()).resolves.toBe("abc123");
    expect(invalid.status).toBe(403);
  });

  it("fails closed when required webhook secrets are missing", async () => {
    const verifyResponse = await app.request(
      "/webhooks/meta?hub.mode=subscribe&hub.challenge=abc123",
      {},
      { ...(env as Record<string, unknown>), META_VERIFY_TOKEN: undefined } as never
    );
    const postResponse = await app.request(
      "/webhooks/meta",
      {
        method: "POST",
        body: "{}"
      },
      { ...(env as Record<string, unknown>), META_APP_SECRET: undefined } as never
    );

    expect(verifyResponse.status).toBe(503);
    await expect(verifyResponse.text()).resolves.toBe("Webhook is not configured");
    expect(postResponse.status).toBe(503);
    await expect(postResponse.text()).resolves.toBe("Webhook is not configured");
  });

  it("rejects webhook posts with missing or invalid signatures before parsing JSON", async () => {
    const response = await app.request(
      "/webhooks/meta",
      {
        method: "POST",
        headers: { "X-Hub-Signature-256": "sha256=bad" },
        body: "{"
      },
      env
    );

    expect(response.status).toBe(401);
    await expect(response.text()).resolves.toBe("Unauthorized");
  });

  it("accepts webhook posts signed with the Instagram app secret fallback", async () => {
    const body = JSON.stringify({
      object: "instagram",
      entry: [
        {
          id: "other-account",
          changes: [
            {
              field: "comments",
              value: {
                id: "comment-1",
                text: "PROMPT",
                media: { id: "media-1" },
                from: { id: "user-1" }
              }
            }
          ]
        }
      ]
    });
    const signature = await createMetaSignature(body, "test-instagram-app-secret-with-enough-entropy");

    const response = await app.request(
      "/webhooks/meta",
      {
        method: "POST",
        headers: { "X-Hub-Signature-256": signature },
        body
      },
      {
        ...(env as Record<string, unknown>),
        META_APP_SECRET: "different-meta-app-secret-with-enough-entropy",
        INSTAGRAM_APP_SECRET: "test-instagram-app-secret-with-enough-entropy"
      } as never
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, processed: 0 });
  });

  it("returns a controlled error for signed malformed JSON", async () => {
    const body = "{";
    const signature = await createMetaSignature(body, "test-meta-app-secret-with-enough-entropy");

    const response = await app.request(
      "/webhooks/meta",
      {
        method: "POST",
        headers: { "X-Hub-Signature-256": signature },
        body
      },
      env
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Invalid JSON body" });
  });

  it("rejects oversized webhook bodies before signature work", async () => {
    const response = await app.request(
      "/webhooks/meta",
      {
        method: "POST",
        headers: { "X-Hub-Signature-256": "sha256=bad" },
        body: "x".repeat(300 * 1024)
      },
      env
    );

    expect(response.status).toBe(413);
    await expect(response.text()).resolves.toBe("Payload Too Large");
  });

  it("rejects oversized chunked webhook bodies that omit content-length", async () => {
    const chunk = new TextEncoder().encode("x".repeat(64 * 1024));
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        for (let index = 0; index < 5; index += 1) {
          controller.enqueue(chunk);
        }
        controller.close();
      }
    });

    const response = await app.request(
      "/webhooks/meta",
      {
        method: "POST",
        headers: { "X-Hub-Signature-256": "sha256=bad" },
        body,
        duplex: "half"
      } as RequestInit,
      env
    );

    expect(response.status).toBe(413);
    await expect(response.text()).resolves.toBe("Payload Too Large");
  });

  it("ignores signed webhook events for a different Instagram account", async () => {
    const body = JSON.stringify({
      object: "instagram",
      entry: [
        {
          id: "other-account",
          changes: [
            {
              field: "comments",
              value: {
                id: "comment-1",
                text: "PROMPT",
                media: { id: "media-1" },
                from: { id: "user-1" }
              }
            }
          ]
        }
      ]
    });
    const signature = await createMetaSignature(body, "test-meta-app-secret-with-enough-entropy");

    const response = await app.request(
      "/webhooks/meta",
      {
        method: "POST",
        headers: { "X-Hub-Signature-256": signature },
        body
      },
      env
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, processed: 0 });
  });
});
