import { describe, expect, it } from "vitest";
import { recoverStaleDeliveries } from "../src/queue/recovery";
import type { DeliveryJob } from "../src/types";

describe("delivery recovery", () => {
  it("re-enqueues stale queued or retrying delivery rows", async () => {
    const jobs: DeliveryJob[] = [];
    const repo = {
      async markStaleProcessingDeliveriesUnknown() {
        return 0;
      },
      async markExhaustedRecoverableDeliveries() {
        return 0;
      },
      async listRecoverableDeliveries() {
        return [
          {
            deliveryId: "campaign-1:user-1:opening",
            campaignId: "campaign-1",
            igUserId: "user-1",
            deliveryType: "opening" as const,
            commentId: "comment-1"
          },
          {
            deliveryId: "campaign-1:user-1:opening_failure_reply",
            campaignId: "campaign-1",
            igUserId: "user-1",
            deliveryType: "opening_failure_reply" as const,
            commentId: "comment-1"
          },
          {
            deliveryId: "campaign-1:user-1:comment_reply",
            campaignId: "campaign-1",
            igUserId: "user-1",
            deliveryType: "comment_reply" as const,
            commentId: "comment-1"
          },
          {
            deliveryId: "campaign-1:user-1:button_step:1",
            campaignId: "campaign-1",
            igUserId: "user-1",
            deliveryType: "button_step" as const,
            stepIndex: 0
          },
          {
            deliveryId: "campaign-1:user-1:final",
            campaignId: "campaign-1",
            igUserId: "user-1",
            deliveryType: "final" as const
          }
        ];
      }
    };
    const queue = {
      async send(job: DeliveryJob) {
        jobs.push(job);
      }
    };

    const recovered = await recoverStaleDeliveries(repo, queue as never);

    expect(recovered).toBe(5);
    expect(jobs).toEqual([
      {
        deliveryId: "campaign-1:user-1:opening",
        campaignId: "campaign-1",
        igUserId: "user-1",
        deliveryType: "opening",
        commentId: "comment-1",
        stepIndex: undefined
      },
      {
        deliveryId: "campaign-1:user-1:opening_failure_reply",
        campaignId: "campaign-1",
        igUserId: "user-1",
        deliveryType: "opening_failure_reply",
        commentId: "comment-1",
        stepIndex: undefined
      },
      {
        deliveryId: "campaign-1:user-1:comment_reply",
        campaignId: "campaign-1",
        igUserId: "user-1",
        deliveryType: "comment_reply",
        commentId: "comment-1",
        stepIndex: undefined
      },
      {
        deliveryId: "campaign-1:user-1:button_step:1",
        campaignId: "campaign-1",
        igUserId: "user-1",
        deliveryType: "button_step",
        commentId: undefined,
        stepIndex: 0
      },
      {
        deliveryId: "campaign-1:user-1:final",
        campaignId: "campaign-1",
        igUserId: "user-1",
        deliveryType: "final",
        commentId: undefined,
        stepIndex: undefined
      }
    ]);
  });

  it("marks exhausted and stale processing rows before re-enqueueing recoverable rows", async () => {
    const calls: string[] = [];
    const jobs: DeliveryJob[] = [];
    const repo = {
      async markStaleProcessingDeliveriesUnknown() {
        calls.push("mark-processing-unknown");
        return 1;
      },
      async markExhaustedRecoverableDeliveries() {
        calls.push("mark-exhausted");
        return 2;
      },
      async listRecoverableDeliveries() {
        calls.push("list-recoverable");
        return [
          {
            deliveryId: "campaign-1:user-1:final",
            campaignId: "campaign-1",
            igUserId: "user-1",
            deliveryType: "final" as const
          }
        ];
      }
    };
    const queue = {
      async send(job: DeliveryJob) {
        jobs.push(job);
      }
    };

    const recovered = await recoverStaleDeliveries(repo, queue as never);

    expect(recovered).toBe(1);
    expect(calls).toEqual(["mark-processing-unknown", "mark-exhausted", "list-recoverable"]);
    expect(jobs).toEqual([
      {
        deliveryId: "campaign-1:user-1:final",
        campaignId: "campaign-1",
        igUserId: "user-1",
        deliveryType: "final",
        commentId: undefined,
        stepIndex: undefined
      }
    ]);
  });
});
