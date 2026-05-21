import { describe, expect, it } from "vitest";
import { app } from "../src/index";
import repositorySource from "../src/db/repository.ts?raw";
import migration0001 from "../migrations/0001_initial.sql?raw";
import migration0002 from "../migrations/0002_admin_security.sql?raw";
import migration0003 from "../migrations/0003_comment_replies.sql?raw";
import migration0004 from "../migrations/0004_ops_scaling.sql?raw";
import migration0005 from "../migrations/0005_admin_sessions.sql?raw";
import migration0006 from "../migrations/0006_message_variants.sql?raw";
import migration0007 from "../migrations/0007_variant_templates.sql?raw";
import migration0008 from "../migrations/0008_variant_templates_bootstrap_idx.sql?raw";
import migration0009 from "../migrations/0009_dm_steps.sql?raw";
import migration0010 from "../migrations/0010_follow_gate_text.sql?raw";
import migration0011 from "../migrations/0011_follow_gate_button_title.sql?raw";
import migration0012 from "../migrations/0012_opening_failure_reply_text.sql?raw";
import migration0013 from "../migrations/0013_data_deletion_replay.sql?raw";

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

  it("rejects replayed signed deletion requests without deleting twice", async () => {
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
    expect(second.status).toBe(409);
    await expect(second.json()).resolves.toEqual({ error: "Data deletion request was already processed" });
    expect(db.deletes).toHaveLength(5);
    expect(db.events).toHaveLength(1);
  });

  it("keeps deleteUserData aligned with schema ig_user_id columns", () => {
    const tableSql = [
      migration0001,
      migration0002,
      migration0003,
      migration0004,
      migration0005,
      migration0006,
      migration0007,
      migration0008,
      migration0009,
      migration0010,
      migration0011,
      migration0012,
      migration0013
    ].join("\n");
    const tablesWithUserIds = [...tableSql.matchAll(/CREATE TABLE (\w+) \(([\s\S]*?)\);/g)]
      .filter((match) => /\b(?:ig_)?user_id\b/.test(match[2]))
      .map((match) => match[1])
      .sort();

    expect(tablesWithUserIds).toEqual(["contact_states", "deliveries", "webhook_events"]);
    for (const table of tablesWithUserIds) {
      expect(repositorySource).toContain(`DELETE FROM ${table} WHERE ig_user_id = ?1`);
    }
  });
});

function createDeletionDb() {
  const db = {
    deletes: [] as Array<[string, string]>,
    events: [] as unknown[][],
    replayHashes: new Set<string>(),
    prepare(sql: string) {
      return {
        bind(...params: unknown[]) {
          return {
            async run() {
              if (sql.startsWith("DELETE")) {
                db.deletes.push([sql, String(params[0])]);
              }
              if (sql.includes("INSERT OR IGNORE INTO data_deletion_requests")) {
                const hash = String(params[0]);
                if (db.replayHashes.has(hash)) return { meta: { changes: 0 } };
                db.replayHashes.add(hash);
                return { meta: { changes: 1 } };
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
