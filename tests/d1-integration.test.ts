import { Miniflare } from "miniflare";
import { afterEach, describe, expect, it, vi } from "vitest";
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
import migration0014 from "../migrations/0014_data_deletion_status.sql?raw";
import migration0015 from "../migrations/0015_data_deletion_confirmation_idx.sql?raw";
import { Repository, type Campaign } from "../src/db/repository";
import { app } from "../src/index";
import { processDeliveryBatch } from "../src/queue/consumer";
import { recoverStaleDeliveries } from "../src/queue/recovery";
import { createMetaSignature } from "../src/security/signature";
import type { DeliveryJob } from "../src/types";

const migrations = [
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
  migration0013,
  migration0014,
  migration0015
];

const campaign: Campaign = {
  id: "prompt-test",
  name: "Prompt Test",
  mediaId: "media-1",
  keyword: "PROMPT",
  openingText: "Want me to send the guide?",
  openingTextVariants: ["Want me to send the guide?"],
  buttonTitle: "SEND",
  buttonPayload: "prompt-test:confirm",
  dmSteps: [],
  deliveryText: "Here is the guide",
  commentReplyText: "Sent. Check your DM.",
  commentReplyTextVariants: ["Sent. Check your DM."],
  openingFailureReplyText: null,
  followGateEnabled: false,
  followGateText: null,
  followGateButtonTitle: null,
  enabled: true
};

describe("D1 integration", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("applies every migration and supports repository campaign reads", async () => {
    const db = await createMigratedD1();
    try {
      const repo = new Repository(db.d1);

      await repo.upsertCampaign(campaign);

      await expect(repo.findCampaignById("prompt-test")).resolves.toMatchObject({
        id: "prompt-test",
        mediaId: "media-1",
        keyword: "PROMPT",
        commentReplyText: "Sent. Check your DM."
      });

      const now = new Date().toISOString();
      await db.d1
        .prepare(
          `INSERT INTO campaigns
            (id, name, media_id, keyword, opening_text, button_title, button_payload, delivery_text, created_at, updated_at)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?9)`
        )
        .bind(
          "draft-by-default",
          "Draft By Default",
          "media-2",
          "GUIDE",
          "Want the guide?",
          "SEND",
          "draft-by-default:confirm",
          "Here is the guide",
          now
        )
        .run();
      await expect(db.get("SELECT enabled FROM campaigns WHERE id = 'draft-by-default'")).resolves.toMatchObject({
        enabled: 0
      });
    } finally {
      db.close();
    }
  });

  it("routes a signed matching comment webhook into D1 state and an opening queue job", async () => {
    const db = await createMigratedD1();
    try {
      const repo = new Repository(db.d1);
      const queue = new RecordingQueue();
      await repo.upsertCampaign(campaign);

      const body = JSON.stringify({
        object: "instagram",
        entry: [
          {
            id: "ig-account",
            changes: [
              {
                field: "comments",
                value: {
                  id: "comment-1",
                  text: "PROMPT please",
                  media: { id: "media-1" },
                  from: { id: "user-1", username: "example_creator" }
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
        {
          ADMIN_TOKEN: "test-admin-token-with-enough-entropy",
          META_VERIFY_TOKEN: "verify-token",
          META_APP_SECRET: "test-meta-app-secret-with-enough-entropy",
          INSTAGRAM_ACCESS_TOKEN: "ig-token",
          INSTAGRAM_ACCOUNT_ID: "ig-account",
          AUTOMATION_ENABLED: "true",
          DB: db.d1,
          DELIVERY_QUEUE: queue
        } as never
      );

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({ ok: true, processed: 1 });
      expect(queue.sent).toEqual([
        {
          deliveryId: "prompt-test:user-1:opening",
          campaignId: "prompt-test",
          igUserId: "user-1",
          deliveryType: "opening",
          commentId: "comment-1"
        }
      ]);
      await expect(db.get("SELECT campaign_id, ig_user_id, state, last_comment_id FROM contact_states")).resolves.toMatchObject({
        campaign_id: "prompt-test",
        ig_user_id: "user-1",
        state: "commented",
        last_comment_id: "comment-1"
      });
      await expect(db.get("SELECT event_id, campaign_id, ig_user_id FROM webhook_events")).resolves.toMatchObject({
        event_id: "comment:comment-1",
        campaign_id: "prompt-test",
        ig_user_id: "user-1"
      });
      await expect(db.get("SELECT id, delivery_type, status FROM deliveries")).resolves.toMatchObject({
        id: "prompt-test:user-1:opening",
        delivery_type: "opening",
        status: "queued"
      });
    } finally {
      db.close();
    }
  });

  it("processes a queued delivery batch through real D1 and a mocked Meta send", async () => {
    const db = await createMigratedD1();
    try {
      const repo = new Repository(db.d1);
      await repo.upsertCampaign(campaign);
      await repo.createDelivery({
        id: "prompt-test:user-1:final",
        campaignId: "prompt-test",
        igUserId: "user-1",
        deliveryType: "final",
        status: "queued"
      });
      const fetchMock = vi.fn(async () => Response.json({ message_id: "meta-message-1" }));
      vi.stubGlobal("fetch", fetchMock);
      const message = recordingMessage({
        deliveryId: "prompt-test:user-1:final",
        campaignId: "prompt-test",
        igUserId: "user-1",
        deliveryType: "final"
      });

      await processDeliveryBatch(batchWith(message), {
        ...baseEnv(),
        AUTOMATION_ENABLED: "true",
        DB: db.d1,
        DELIVERY_QUEUE: new RecordingQueue()
      } as never);

      expect(message.ack).toHaveBeenCalledOnce();
      expect(message.retry).not.toHaveBeenCalled();
      expect(fetchMock).toHaveBeenCalledWith(
        "https://graph.instagram.com/v25.0/ig-account/messages",
        expect.objectContaining({
          method: "POST",
          headers: {
            Authorization: "Bearer ig-token",
            "Content-Type": "application/json"
          }
        })
      );
      await expect(db.get("SELECT status, meta_message_id FROM deliveries WHERE id = 'prompt-test:user-1:final'")).resolves.toMatchObject({
        status: "sent",
        meta_message_id: "meta-message-1"
      });
    } finally {
      await db.close();
    }
  });

  it("fails pending deliveries but preserves sent evidence when the kill switch is active", async () => {
    const db = await createMigratedD1();
    try {
      const repo = new Repository(db.d1);
      await repo.upsertCampaign(campaign);
      await repo.createDelivery({
        id: "prompt-test:user-queued:final",
        campaignId: "prompt-test",
        igUserId: "user-queued",
        deliveryType: "final",
        status: "queued"
      });
      await repo.createDelivery({
        id: "prompt-test:user-sent:final",
        campaignId: "prompt-test",
        igUserId: "user-sent",
        deliveryType: "final",
        status: "sent"
      });
      const queuedMessage = recordingMessage({
        deliveryId: "prompt-test:user-queued:final",
        campaignId: "prompt-test",
        igUserId: "user-queued",
        deliveryType: "final"
      });
      const sentDuplicate = recordingMessage({
        deliveryId: "prompt-test:user-sent:final",
        campaignId: "prompt-test",
        igUserId: "user-sent",
        deliveryType: "final"
      });

      await processDeliveryBatch(
        { messages: [queuedMessage, sentDuplicate] } as unknown as MessageBatch<DeliveryJob>,
        {
          ...baseEnv(),
          AUTOMATION_ENABLED: "false",
          DB: db.d1,
          DELIVERY_QUEUE: new RecordingQueue()
        } as never
      );

      expect(queuedMessage.ack).toHaveBeenCalledOnce();
      expect(sentDuplicate.ack).toHaveBeenCalledOnce();
      await expect(
        db.get("SELECT status, error_code FROM deliveries WHERE id = 'prompt-test:user-queued:final'")
      ).resolves.toMatchObject({ status: "failed", error_code: "automation_disabled" });
      await expect(
        db.get("SELECT status, error_code FROM deliveries WHERE id = 'prompt-test:user-sent:final'")
      ).resolves.toMatchObject({ status: "sent", error_code: null });
    } finally {
      await db.close();
    }
  });

  it("retries a queued delivery batch when Meta returns a transient send failure", async () => {
    const db = await createMigratedD1();
    try {
      const repo = new Repository(db.d1);
      await repo.upsertCampaign(campaign);
      await repo.createDelivery({
        id: "prompt-test:user-1:final",
        campaignId: "prompt-test",
        igUserId: "user-1",
        deliveryType: "final",
        status: "queued"
      });
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => Response.json({ error: { code: 2, message: "Temporary Meta outage" } }, { status: 500 }))
      );
      const message = recordingMessage({
        deliveryId: "prompt-test:user-1:final",
        campaignId: "prompt-test",
        igUserId: "user-1",
        deliveryType: "final"
      });

      await processDeliveryBatch(batchWith(message), {
        ...baseEnv(),
        AUTOMATION_ENABLED: "true",
        DB: db.d1,
        DELIVERY_QUEUE: new RecordingQueue()
      } as never);

      expect(message.ack).not.toHaveBeenCalled();
      expect(message.retry).toHaveBeenCalledWith({ delaySeconds: 60 });
      await expect(db.get("SELECT status, error_code, error_message FROM deliveries WHERE id = 'prompt-test:user-1:final'")).resolves.toMatchObject({
        status: "retrying",
        error_code: "2",
        error_message: "Temporary Meta outage"
      });
    } finally {
      await db.close();
    }
  });

  it("marks stale processing deliveries unknown instead of automatically requeueing them", async () => {
    const db = await createMigratedD1();
    try {
      const repo = new Repository(db.d1);
      await repo.upsertCampaign(campaign);
      await repo.createDelivery({
        id: "prompt-test:user-1:final",
        campaignId: "prompt-test",
        igUserId: "user-1",
        deliveryType: "final",
        status: "queued"
      });
      await db.d1
        .prepare("UPDATE deliveries SET status = 'processing', updated_at = ?1 WHERE id = ?2")
        .bind(new Date(Date.now() - 10 * 60 * 1000).toISOString(), "prompt-test:user-1:final")
        .run();

      const queue = new RecordingQueue();
      await expect(recoverStaleDeliveries(repo, queue as never)).resolves.toBe(0);

      expect(queue.sent).toEqual([]);
      await expect(db.get("SELECT status, error_code, error_message FROM deliveries WHERE id = 'prompt-test:user-1:final'")).resolves.toMatchObject({
        status: "failed",
        error_code: "send_status_unknown",
        error_message: "Delivery was still processing after stale cutoff; manual reconciliation required"
      });
      await expect(repo.getOperationalDashboard()).resolves.toMatchObject({
        counts: {
          deliveries: 1,
          failedDeliveries: 1,
          retryingDeliveries: 0,
          sendStatusUnknownDeliveries: 1
        }
      });
    } finally {
      await db.close();
    }
  });

  it("marks stale processing deliveries unknown even after a campaign is disabled", async () => {
    const db = await createMigratedD1();
    try {
      const repo = new Repository(db.d1);
      await repo.upsertCampaign(campaign);
      await repo.setCampaignEnabled("prompt-test", false);
      await repo.createDelivery({
        id: "prompt-test:user-1:final",
        campaignId: "prompt-test",
        igUserId: "user-1",
        deliveryType: "final",
        status: "queued"
      });
      await db.d1
        .prepare("UPDATE deliveries SET status = 'processing', updated_at = ?1 WHERE id = ?2")
        .bind(new Date(Date.now() - 10 * 60 * 1000).toISOString(), "prompt-test:user-1:final")
        .run();

      const queue = new RecordingQueue();
      await expect(recoverStaleDeliveries(repo, queue as never)).resolves.toBe(0);

      expect(queue.sent).toEqual([]);
      await expect(db.get("SELECT status, error_code FROM deliveries WHERE id = 'prompt-test:user-1:final'")).resolves.toMatchObject({
        status: "failed",
        error_code: "send_status_unknown"
      });
    } finally {
      await db.close();
    }
  });

  it("does not reclaim a stale processing delivery directly from a queue retry", async () => {
    const db = await createMigratedD1();
    try {
      const repo = new Repository(db.d1);
      await repo.upsertCampaign(campaign);
      await repo.createDelivery({
        id: "prompt-test:user-1:final",
        campaignId: "prompt-test",
        igUserId: "user-1",
        deliveryType: "final",
        status: "queued"
      });
      await db.d1
        .prepare("UPDATE deliveries SET status = 'processing', updated_at = ?1 WHERE id = ?2")
        .bind(new Date(Date.now() - 10 * 60 * 1000).toISOString(), "prompt-test:user-1:final")
        .run();
      const fetchMock = vi.fn(async () => Response.json({ recipient_id: "user-1", message_id: "meta-message-1" }));
      vi.stubGlobal("fetch", fetchMock);
      const message = recordingMessage({
        deliveryId: "prompt-test:user-1:final",
        campaignId: "prompt-test",
        igUserId: "user-1",
        deliveryType: "final"
      });

      await processDeliveryBatch(batchWith(message), {
        ...baseEnv(),
        AUTOMATION_ENABLED: "true",
        DB: db.d1,
        DELIVERY_QUEUE: new RecordingQueue()
      } as never);

      expect(message.ack).toHaveBeenCalledOnce();
      expect(message.retry).not.toHaveBeenCalled();
      expect(fetchMock).not.toHaveBeenCalled();
      await expect(db.get("SELECT status, meta_message_id FROM deliveries WHERE id = 'prompt-test:user-1:final'")).resolves.toMatchObject({
        status: "processing",
        meta_message_id: null
      });
    } finally {
      await db.close();
    }
  });

  it("checks data deletion confirmation status through real D1 deletion requests", async () => {
    const db = await createMigratedD1();
    try {
      const repo = new Repository(db.d1);
      const confirmationCode = "11111111-1111-4111-8111-111111111111";
      await repo.claimDataDeletionRequest("request-hash-1");
      await repo.completeDataDeletionRequest("request-hash-1", confirmationCode);

      const found = await app.request(
        `/data-deletion/status/${confirmationCode}`,
        {},
        { ...baseEnv(), DB: db.d1, DELIVERY_QUEUE: new RecordingQueue() } as never
      );
      expect(found.status).toBe(200);
      await expect(found.text()).resolves.toContain("was received and processed");

      const missing = await app.request(
        "/data-deletion/status/22222222-2222-4222-8222-222222222222",
        {},
        { ...baseEnv(), DB: db.d1, DELIVERY_QUEUE: new RecordingQueue() } as never
      );
      expect(missing.status).toBe(404);
    } finally {
      await db.close();
    }
  });
});

class RecordingQueue {
  readonly sent: DeliveryJob[] = [];

  async send(job: DeliveryJob): Promise<void> {
    this.sent.push(job);
  }
}

async function createMigratedD1(): Promise<{
  d1: D1Database;
  get(sql: string): Promise<Record<string, unknown> | null>;
  close(): Promise<void>;
}> {
  const miniflare = new Miniflare({
    modules: true,
    script: "export default { fetch() { return new Response('ok'); } }",
    d1Databases: ["DB"]
  });
  const d1 = await miniflare.getD1Database("DB");

  for (const migration of migrations) {
    for (const statement of migrationStatements(migration)) {
      await d1.prepare(statement).run();
    }
  }

  return {
    d1,
    get(sql: string) {
      return d1.prepare(sql).first<Record<string, unknown>>();
    },
    async close() {
      await miniflare.dispose();
    }
  };
}

function migrationStatements(migration: string): string[] {
  return migration
    .split(";")
    .map((statement) => statement.trim())
    .filter(Boolean);
}

function baseEnv(): Record<string, unknown> {
  return {
    ADMIN_TOKEN: "test-admin-token-with-enough-entropy",
    META_VERIFY_TOKEN: "verify-token",
    META_APP_SECRET: "test-meta-app-secret-with-enough-entropy",
    INSTAGRAM_ACCESS_TOKEN: "ig-token",
    INSTAGRAM_ACCOUNT_ID: "ig-account"
  };
}

function recordingMessage(body: DeliveryJob) {
  return {
    body,
    ack: vi.fn(),
    retry: vi.fn()
  };
}

function batchWith(message: ReturnType<typeof recordingMessage>): MessageBatch<DeliveryJob> {
  return { messages: [message] } as unknown as MessageBatch<DeliveryJob>;
}
