import { describe, expect, it } from "vitest";
import { Repository } from "../src/db/repository";

describe("Repository delivery retry guards", () => {
  it("claims queued delivery rows below the retry cap", async () => {
    const db = createClaimDb({ status: "retrying", attemptCount: 4 });
    const repo = new Repository(db as never);

    await expect(repo.claimDeliveryForSend("delivery-1")).resolves.toBe("claimed");
    expect(db.delivery.status).toBe("processing");
  });

  it("does not claim queued delivery rows at the retry cap", async () => {
    const db = createClaimDb({ status: "retrying", attemptCount: 5 });
    const repo = new Repository(db as never);

    await expect(repo.claimDeliveryForSend("delivery-1")).resolves.toBe("skip");
    expect(db.delivery.status).toBe("retrying");
  });

  it("does not claim or mutate an already sent delivery", async () => {
    const db = createClaimDb({ status: "sent", attemptCount: 1 });
    const repo = new Repository(db as never);

    await expect(repo.claimDeliveryForSend("delivery-1")).resolves.toBe("skip");
    expect(db.delivery).toEqual({ status: "sent", attemptCount: 1 });
  });

  it("recovers stale opening comment ids from webhook events when contact state is missing", async () => {
    const db = createRecoverableOpeningDb();
    const repo = new Repository(db as never);

    await expect(repo.listRecoverableDeliveries(1, new Date("2026-05-29T07:10:00.000Z"))).resolves.toEqual([
      {
        deliveryId: "campaign-1:user-1:opening",
        campaignId: "campaign-1",
        igUserId: "user-1",
        deliveryType: "opening",
        commentId: "comment-1",
        stepIndex: undefined
      }
    ]);
  });
});

function createClaimDb(delivery: { status: string; attemptCount: number }) {
  const db = {
    delivery: { ...delivery },
    prepare(sql: string) {
      return {
        bind(...params: unknown[]) {
          return {
            async run() {
              if (sql.includes("UPDATE deliveries") && sql.includes("SET status = 'processing'")) {
                expect(sql).toContain("attempt_count < ?4");
                const includeWaitingFollow = params[2] === 1;
                const maxAttempts = Number(params[3]);
                const canClaimQueued =
                  ["queued", "retrying"].includes(db.delivery.status) &&
                  db.delivery.attemptCount < maxAttempts;
                const canClaimWaiting = includeWaitingFollow && db.delivery.status === "waiting_follow";

                if (canClaimQueued || canClaimWaiting) {
                  db.delivery.status = "processing";
                  return { meta: { changes: 1 } };
                }
                return { meta: { changes: 0 } };
              }

              return { meta: { changes: 0 } };
            },
            async first() {
              if (sql.includes("SELECT status FROM deliveries WHERE id = ?1")) {
                return { status: db.delivery.status };
              }
              return null;
            }
          };
        }
      };
    }
  };

  return db;
}

function createRecoverableOpeningDb() {
  return {
    prepare(sql: string) {
      return {
        bind(..._params: unknown[]) {
          return {
            async all() {
              const hasWebhookFallback = sql.includes("webhook_events") && sql.includes("comment:%");

              return {
                results: [
                  {
                    id: "campaign-1:user-1:opening",
                    campaign_id: "campaign-1",
                    ig_user_id: "user-1",
                    delivery_type: "opening",
                    last_comment_id: hasWebhookFallback ? "comment-1" : null
                  }
                ]
              };
            }
          };
        }
      };
    }
  };
}
