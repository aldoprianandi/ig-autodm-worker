import { describe, expect, it } from "vitest";
import { app } from "../src/index";

const appSecret = "test-meta-app-secret-with-enough-entropy";
const env = {
  ADMIN_TOKEN: "test-admin-token-with-enough-entropy",
  META_VERIFY_TOKEN: "verify-token",
  META_APP_SECRET: appSecret,
  INSTAGRAM_ACCESS_TOKEN: "ig-token",
  INSTAGRAM_ACCOUNT_ID: "ig-account"
} as never;

describe("Meta data deletion callback", () => {
  it("verifies signed requests and deletes user-scoped rows", async () => {
    const db = createDeletionDb();
    const signedRequest = await createSignedRequest({ algorithm: "HMAC-SHA256", user_id: "user-1" }, appSecret);

    const response = await app.request(
      "/data-deletion",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ signed_request: signedRequest }).toString()
      },
      { ...(env as Record<string, unknown>), DB: db } as never
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as { url: string; confirmation_code: string };
    expect(body.url).toContain("/data-deletion/status/");
    expect(body.confirmation_code).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    );
    expect(db.deletes).toEqual([
      ["DELETE FROM deliveries WHERE ig_user_id = ?1", "user-1"],
      ["DELETE FROM contact_states WHERE ig_user_id = ?1", "user-1"],
      ["DELETE FROM webhook_events WHERE ig_user_id = ?1", "user-1"]
    ]);
    expect(db.events).toHaveLength(1);
  });

  it("rejects invalid signed requests without deleting data", async () => {
    const db = createDeletionDb();

    const response = await app.request(
      "/data-deletion",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ signed_request: "bad.request" }).toString()
      },
      { ...(env as Record<string, unknown>), DB: db } as never
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Invalid signed request" });
    expect(db.deletes).toEqual([]);
    expect(db.events).toEqual([]);
  });
});

function createDeletionDb() {
  const db = {
    deletes: [] as Array<[string, string]>,
    events: [] as unknown[][],
    prepare(sql: string) {
      return {
        bind(...params: unknown[]) {
          return {
            async run() {
              if (sql.startsWith("DELETE")) {
                db.deletes.push([sql, String(params[0])]);
              }
              if (sql.includes("INSERT INTO operational_events")) {
                db.events.push(params);
              }
              return { meta: { changes: 1 } };
            }
          };
        }
      };
    }
  };
  return db;
}

async function createSignedRequest(payload: Record<string, unknown>, secret: string): Promise<string> {
  const encodedPayload = base64UrlEncode(new TextEncoder().encode(JSON.stringify(payload)));
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(encodedPayload));
  return `${base64UrlEncode(new Uint8Array(signature))}.${encodedPayload}`;
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
