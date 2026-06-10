import { describe, expect, it, vi } from "vitest";
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
    const signedRequest = await createSignedRequest(
      { algorithm: "HMAC-SHA256", user_id: "user-1", issued_at: currentIssuedAt() },
      appSecret
    );

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
      ["DELETE FROM webhook_events WHERE ig_user_id = ?1", "user-1"],
      ["DELETE FROM operational_events WHERE json_valid(metadata_json) AND json_extract(metadata_json, '$.igUserId') = ?1", "user-1"],
      ["DELETE FROM admin_audit_logs WHERE path LIKE ?1 ESCAPE '\\'", "%/user-1/%"]
    ]);
    expect(db.events).toHaveLength(1);
    expect(JSON.stringify(db.events[0])).not.toContain("user-1");

    const status = await app.request(`/data-deletion/status/${body.confirmation_code}`, {}, { ...(env as Record<string, unknown>), DB: db } as never);
    expect(status.status).toBe(200);
    await expect(status.text()).resolves.toContain("was received and processed");
  });

  it("returns 404 for unknown data deletion confirmation codes", async () => {
    const db = createDeletionDb();

    const response = await app.request(
      "/data-deletion/status/00000000-0000-4000-8000-000000000000",
      {},
      { ...(env as Record<string, unknown>), DB: db } as never
    );

    expect(response.status).toBe(404);
    await expect(response.text()).resolves.toContain("was not found");
  });

  it("rejects malformed deletion confirmation codes before querying D1", async () => {
    const db = {
      prepare() {
        throw new Error("D1 should not be queried for malformed confirmation codes");
      }
    };

    const response = await app.request(
      "/data-deletion/status/not-a-confirmation-code",
      {},
      { ...(env as Record<string, unknown>), DB: db } as never
    );

    expect(response.status).toBe(404);
    await expect(response.text()).resolves.toContain("was not found");
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

  it("rejects stale signed deletion requests without deleting data", async () => {
    const db = createDeletionDb();
    const signedRequest = await createSignedRequest(
      { algorithm: "HMAC-SHA256", user_id: "user-1", issued_at: currentIssuedAt() - 10 * 60 },
      appSecret
    );

    const response = await app.request(
      "/data-deletion",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ signed_request: signedRequest }).toString()
      },
      { ...(env as Record<string, unknown>), DB: db } as never
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Invalid signed request" });
    expect(db.deletes).toEqual([]);
    expect(db.events).toEqual([]);
  });

  it("rejects signed deletion requests without issued_at", async () => {
    const db = createDeletionDb();
    const signedRequest = await createSignedRequest(
      { algorithm: "HMAC-SHA256", user_id: "user-1" },
      appSecret
    );

    const response = await app.request(
      "/data-deletion",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ signed_request: signedRequest }).toString()
      },
      { ...(env as Record<string, unknown>), DB: db } as never
    );

    expect(response.status).toBe(400);
    expect(db.deletes).toEqual([]);
  });

  it("rejects signed deletion requests too far in the future", async () => {
    const db = createDeletionDb();
    const signedRequest = await createSignedRequest(
      { algorithm: "HMAC-SHA256", user_id: "user-1", issued_at: currentIssuedAt() + 60 },
      appSecret
    );

    const response = await app.request(
      "/data-deletion",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ signed_request: signedRequest }).toString()
      },
      { ...(env as Record<string, unknown>), DB: db } as never
    );

    expect(response.status).toBe(400);
    expect(db.deletes).toEqual([]);
  });

  it("returns the same confirmation for replayed completed deletion requests without deleting twice", async () => {
    const db = createDeletionDb();
    const signedRequest = await createSignedRequest(
      { algorithm: "HMAC-SHA256", user_id: "user-1", issued_at: currentIssuedAt() },
      appSecret
    );

    const first = await app.request(
      "/data-deletion",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ signed_request: signedRequest }).toString()
      },
      { ...(env as Record<string, unknown>), DB: db } as never
    );
    const second = await app.request(
      "/data-deletion",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ signed_request: signedRequest }).toString()
      },
      { ...(env as Record<string, unknown>), DB: db } as never
    );

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    const firstBody = await first.json();
    await expect(second.json()).resolves.toEqual(firstBody);
    expect(db.deletes).toHaveLength(5);
    expect(db.events).toHaveLength(1);
  });

  it("returns 409 for duplicate in-flight deletion requests", async () => {
    const db = createDeletionDb();
    const signedRequest = await createSignedRequest(
      { algorithm: "HMAC-SHA256", user_id: "user-1", issued_at: currentIssuedAt() },
      appSecret
    );
    db.replayRequests.set(await sha256Hex(signedRequest), {
      status: "processing",
      confirmationCode: null,
      updatedAt: new Date().toISOString()
    });

    const response = await app.request(
      "/data-deletion",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ signed_request: signedRequest }).toString()
      },
      { ...(env as Record<string, unknown>), DB: db } as never
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({ error: "Data deletion request is already processing" });
    expect(db.deletes).toEqual([]);
    expect(db.events).toEqual([]);
  });

  it("releases an in-flight deletion claim when deletion fails so Meta can retry", async () => {
    const db = createDeletionDb();
    db.failNextDelete = true;
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const signedRequest = await createSignedRequest(
      { algorithm: "HMAC-SHA256", user_id: "user-1", issued_at: currentIssuedAt() },
      appSecret
    );

    let first: Response;
    try {
      first = await app.request(
        "/data-deletion",
        {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ signed_request: signedRequest }).toString()
        },
        { ...(env as Record<string, unknown>), DB: db } as never
      );
    } finally {
      consoleError.mockRestore();
    }

    const second = await app.request(
      "/data-deletion",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ signed_request: signedRequest }).toString()
      },
      { ...(env as Record<string, unknown>), DB: db } as never
    );

    expect(first.status).toBe(500);
    expect(second.status).toBe(200);
    expect(db.events).toHaveLength(1);
  });
});

function createDeletionDb() {
  const db = {
    deletes: [] as Array<[string, string]>,
    events: [] as unknown[][],
    replayRequests: new Map<string, { status: string; confirmationCode: string | null; updatedAt: string }>(),
    failNextDelete: false,
    prepare(sql: string) {
      return {
        bind(...params: unknown[]) {
          return {
            async first() {
              if (sql.includes("SELECT status, confirmation_code FROM data_deletion_requests")) {
                const request = db.replayRequests.get(String(params[0]));
                return request
                  ? { status: request.status, confirmation_code: request.confirmationCode }
                  : null;
              }
              if (sql.includes("FROM data_deletion_requests") && sql.includes("confirmation_code")) {
                const code = String(params[0]);
                return [...db.replayRequests.values()].some((request) => request.confirmationCode === code && request.status === "completed")
                  ? { ok: 1 }
                  : null;
              }
              return null;
            },
            async run() {
              if (sql.startsWith("DELETE")) {
                if (sql.includes("data_deletion_requests")) {
                  const request = db.replayRequests.get(String(params[0]));
                  if (request?.status === "processing") db.replayRequests.delete(String(params[0]));
                } else {
                  if (db.failNextDelete) {
                    db.failNextDelete = false;
                    throw new Error("delete failed");
                  }
                  db.deletes.push([sql, String(params[0])]);
                }
              }
              if (sql.includes("INSERT OR IGNORE INTO data_deletion_requests")) {
                const hash = String(params[0]);
                if (db.replayRequests.has(hash)) return { meta: { changes: 0 } };
                db.replayRequests.set(hash, { status: "processing", confirmationCode: null, updatedAt: String(params[1]) });
                return { meta: { changes: 1 } };
              }
              if (sql.includes("UPDATE data_deletion_requests") && sql.includes("status = 'processing'")) {
                const hash = String(params[0]);
                const request = db.replayRequests.get(hash);
                if (request && request.status !== "completed" && request.updatedAt < String(params[2])) {
                  request.updatedAt = String(params[1]);
                  return { meta: { changes: 1 } };
                }
                return { meta: { changes: 0 } };
              }
              if (sql.includes("UPDATE data_deletion_requests") && sql.includes("status = 'completed'")) {
                const hash = String(params[0]);
                const request = db.replayRequests.get(hash);
                if (request) {
                  request.status = "completed";
                  request.confirmationCode = String(params[1]);
                  request.updatedAt = String(params[2]);
                }
                return { meta: { changes: request ? 1 : 0 } };
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

function currentIssuedAt(): number {
  return Math.floor(Date.now() / 1000);
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
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
