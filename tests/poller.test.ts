import { afterEach, describe, expect, it, vi } from "vitest";
import { Repository, type Campaign } from "../src/db/repository";
import type { MetaComment } from "../src/meta/api";
import {
  pollCampaignComments,
  pollCampaignCommentsWith,
  queueCommentRepliesAfterOpening,
  queueFinalDeliveriesAfterOpening
} from "../src/poller/comments";
import type { DeliveryJob, NormalizedEvent } from "../src/types";

const campaigns: Campaign[] = [
  {
    id: "blue-green",
    name: "Blue Green",
    mediaId: "media-1",
    keyword: "Blue Green",
    openingText: "Opening",
    openingTextVariants: ["Opening"],
    buttonTitle: "KIRIM PROMPT",
    buttonPayload: "blue-green:confirm",
    dmSteps: [],
    deliveryText: "Prompt",
    commentReplyTextVariants: [],
    followGateEnabled: true,
    enabled: true
  },
  {
    id: "disabled",
    name: "Disabled",
    mediaId: "media-2",
    keyword: "PROMPT",
    openingText: "Opening",
    openingTextVariants: ["Opening"],
    buttonTitle: "KIRIM",
    buttonPayload: "disabled:confirm",
    dmSteps: [],
    deliveryText: "Prompt",
    commentReplyTextVariants: [],
    followGateEnabled: false,
    enabled: false
  }
];

class FakeRepository {
  async listCampaigns(): Promise<Campaign[]> {
    return campaigns;
  }
}

class FakeMeta {
  calls: string[] = [];
  commentsByMedia = new Map<string, MetaComment[]>([
    [
      "media-1",
      [
        { id: "comment-2", text: "not this", username: "b" },
        { id: "comment-1", text: "Blue Green dong", userId: "user-1", username: "a" }
      ]
    ]
  ]);

  async listMediaComments(mediaId: string): Promise<MetaComment[]> {
    this.calls.push(mediaId);
    return this.commentsByMedia.get(mediaId) ?? [];
  }
}

class FakeRouter {
  events: NormalizedEvent[] = [];

  async handleEvent(event: NormalizedEvent): Promise<void> {
    this.events.push(event);
  }
}

describe("comment poller", () => {
  it("bounds each run and rotates through every media independent of repository order", async () => {
    const enabled = Array.from({ length: 73 }, (_, i) => ({
      ...campaigns[0], id: `campaign-${i}`, mediaId: `media-${i}`
    }));
    const seen = new Set<string>();
    for (let minute = 0; minute < 8; minute++) {
      const meta = new FakeMeta();
      const result = await pollCampaignCommentsWith({
        async listEnabledCampaigns() { return minute % 2 ? [...enabled].reverse() : enabled; }
      }, meta, new FakeRouter(), minute * 60_000);
      expect(meta.calls.length).toBeLessThanOrEqual(10);
      expect(result.campaignsChecked).toBe(meta.calls.length);
      for (const id of meta.calls) {
        expect(seen.has(id)).toBe(false);
        seen.add(id);
      }
    }
    expect(seen.size).toBe(73);
  });

  it("continues polling healthy media after an inaccessible post", async () => {
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
    const meta = new FakeMeta();
    const original = meta.listMediaComments.bind(meta);
    meta.listMediaComments = async (id) => {
      if (id === "deleted-media") throw new Error("private upstream detail");
      return original(id);
    };
    const router = new FakeRouter();
    const result = await pollCampaignCommentsWith({
      async listEnabledCampaigns() {
        return [{ ...campaigns[0], id: "deleted", mediaId: "deleted-media" }, campaigns[0]];
      }
    }, meta, router);
    expect(result.campaignsChecked).toBe(2);
    expect(router.events).toHaveLength(1);
    expect(warning).toHaveBeenCalledWith("comment_poll_media_failed");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("submits matching comments from enabled campaigns only", async () => {
    const meta = new FakeMeta();
    const router = new FakeRouter();

    const result = await pollCampaignCommentsWith(new FakeRepository(), meta, router);

    expect(result).toEqual({
      campaignsChecked: 1,
      commentsSeen: 2,
      eventsSubmitted: 1,
      commentRepliesQueued: 0,
      finalDeliveriesQueued: 0
    });
    expect(meta.calls).toEqual(["media-1"]);
    expect(router.events).toEqual([
      {
        type: "comment.created",
        eventId: "comment:comment-1",
        commentId: "comment-1",
        mediaId: "media-1",
        igUserId: "user-1",
        username: "a",
        text: "Blue Green dong"
      }
    ]);
  });

  it("submits missing-DM retry comments even when the campaign keyword is absent", async () => {
    const meta = new FakeMeta();
    meta.commentsByMedia.set("media-1", [
      { id: "comment-retry", text: "belum ada min", userId: "user-1", username: "a" }
    ]);
    const router = new FakeRouter();

    const result = await pollCampaignCommentsWith(new FakeRepository(), meta, router);

    expect(result).toEqual({
      campaignsChecked: 1,
      commentsSeen: 1,
      eventsSubmitted: 1,
      commentRepliesQueued: 0,
      finalDeliveriesQueued: 0
    });
    expect(router.events).toEqual([
      {
        type: "comment.created",
        eventId: "comment:comment-retry",
        commentId: "comment-retry",
        mediaId: "media-1",
        igUserId: "user-1",
        username: "a",
        text: "belum ada min"
      }
    ]);
  });

  it("does not submit arbitrary non-keyword comments to the router", async () => {
    const meta = new FakeMeta();
    meta.commentsByMedia.set("media-1", [
      { id: "comment-random", text: "makasih min", userId: "user-1", username: "a" }
    ]);
    const router = new FakeRouter();

    const result = await pollCampaignCommentsWith(new FakeRepository(), meta, router);

    expect(result.eventsSubmitted).toBe(0);
    expect(router.events).toEqual([]);
  });

  it("submits a missing-DM retry comment only once when multiple campaigns share the same media", async () => {
    const repo = {
      async listEnabledCampaigns(): Promise<Campaign[]> {
        return [
          campaigns[0],
          {
            ...campaigns[0],
            id: "blue-green-alt",
            keyword: "BUS",
            buttonPayload: "blue-green-alt:confirm"
          }
        ];
      }
    };
    const meta = new FakeMeta();
    meta.commentsByMedia.set("media-1", [
      { id: "comment-retry", text: "no DM yet", userId: "user-1", username: "a" }
    ]);
    const router = new FakeRouter();

    const result = await pollCampaignCommentsWith(repo, meta, router);

    expect(result.eventsSubmitted).toBe(1);
    expect(router.events).toHaveLength(1);
    expect(router.events[0]).toMatchObject({
      type: "comment.created",
      eventId: "comment:comment-retry",
      commentId: "comment-retry",
      text: "no DM yet"
    });
  });

  it("skips matching comments outside the private reply window", async () => {
    const meta = new FakeMeta();
    meta.commentsByMedia.set("media-1", [
      {
        id: "old-comment",
        text: "Blue Green",
        userId: "user-old",
        timestamp: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString()
      }
    ]);
    const router = new FakeRouter();

    const result = await pollCampaignCommentsWith(new FakeRepository(), meta, router);

    expect(result).toEqual({
      campaignsChecked: 1,
      commentsSeen: 1,
      eventsSubmitted: 0,
      commentRepliesQueued: 0,
      finalDeliveriesQueued: 0
    });
    expect(router.events).toEqual([]);
  });

  it("skips matching comments without a real Instagram user id", async () => {
    const meta = new FakeMeta();
    meta.commentsByMedia.set("media-1", [
      { id: "comment-1", text: "Blue Green", username: "fallback-only" }
    ]);
    const router = new FakeRouter();

    const result = await pollCampaignCommentsWith(new FakeRepository(), meta, router);

    expect(result).toEqual({
      campaignsChecked: 1,
      commentsSeen: 1,
      eventsSubmitted: 0,
      commentRepliesQueued: 0,
      finalDeliveriesQueued: 0
    });
    expect(router.events).toEqual([]);
  });

  it("skips missing-DM retry comments without a real Instagram user id", async () => {
    const meta = new FakeMeta();
    meta.commentsByMedia.set("media-1", [
      { id: "comment-retry", text: "belum ada min", username: "fallback-only" }
    ]);
    const router = new FakeRouter();

    const result = await pollCampaignCommentsWith(new FakeRepository(), meta, router);

    expect(result).toEqual({
      campaignsChecked: 1,
      commentsSeen: 1,
      eventsSubmitted: 0,
      commentRepliesQueued: 0,
      finalDeliveriesQueued: 0
    });
    expect(router.events).toEqual([]);
  });

  it("fetches comments once per media when multiple campaigns target the same post", async () => {
    const repo = {
      async listEnabledCampaigns(): Promise<Campaign[]> {
        return [
          campaigns[0],
          {
            ...campaigns[0],
            id: "blue-green-alt",
            keyword: "Alt",
            buttonPayload: "blue-green-alt:confirm"
          }
        ];
      },
      async listCampaigns(): Promise<Campaign[]> {
        throw new Error("poller should use enabled campaign query");
      }
    };
    const meta = new FakeMeta();
    meta.commentsByMedia.set("media-1", [
      { id: "comment-1", text: "Blue Green", userId: "user-1" },
      { id: "comment-2", text: "Alt", userId: "user-2" }
    ]);
    const router = new FakeRouter();

    const result = await pollCampaignCommentsWith(repo, meta, router);

    expect(meta.calls).toEqual(["media-1"]);
    expect(result.eventsSubmitted).toBe(2);
    expect(
      router.events.map((event) => (event as Extract<NormalizedEvent, { type: "comment.created" }>).commentId)
    ).toEqual(["comment-1", "comment-2"]);
  });

  it("queues final deliveries for users whose opening message was sent", async () => {
    const created: unknown[] = [];
    const jobs: DeliveryJob[] = [];
    const repo = {
      async listOpeningSentWithoutFinal() {
        return [{ campaignId: "blue-green", igUserId: "user-1" }];
      },
      async listLastStepSentWithoutFinal() {
        return [];
      },
      async createDelivery(input: unknown) {
        created.push(input);
        return true;
      }
    };
    const queue = {
      async send(job: DeliveryJob) {
        jobs.push(job);
      }
    };

    const result = await queueFinalDeliveriesAfterOpening(repo, queue as never);

    expect(result).toBe(1);
    expect(created).toEqual([
      {
        id: "blue-green:user-1:final",
        campaignId: "blue-green",
        igUserId: "user-1",
        deliveryType: "final",
        status: "queued"
      }
    ]);
    expect(jobs).toEqual([
      {
        deliveryId: "blue-green:user-1:final",
        campaignId: "blue-green",
        igUserId: "user-1",
        deliveryType: "final"
      }
    ]);
  });

  it("does not queue final delivery jobs when the delivery row already exists", async () => {
    const jobs: DeliveryJob[] = [];
    const repo = {
      async listOpeningSentWithoutFinal() {
        return [{ campaignId: "blue-green", igUserId: "user-1" }];
      },
      async listLastStepSentWithoutFinal() {
        return [];
      },
      async createDelivery() {
        return false;
      }
    };
    const queue = {
      async send(job: DeliveryJob) {
        jobs.push(job);
      }
    };

    const result = await queueFinalDeliveriesAfterOpening(repo, queue as never);

    expect(result).toBe(0);
    expect(jobs).toEqual([]);
  });

  it("does not queue automatic final fallback after opening when the feature flag is unset", async () => {
    const listOpeningSentWithoutFinal = vi
      .spyOn(Repository.prototype, "listOpeningSentWithoutFinal")
      .mockResolvedValue([{ campaignId: "blue-green", igUserId: "user-1" }]);
    vi.spyOn(Repository.prototype, "listEnabledCampaigns").mockResolvedValue([]);
    vi.spyOn(Repository.prototype, "listOpeningSentWithoutCommentReply").mockResolvedValue([]);
    const listLastStepSentWithoutFinal = vi
      .spyOn(Repository.prototype, "listLastStepSentWithoutFinal")
      .mockResolvedValue([{ campaignId: "tembok", igUserId: "user-1" }]);
    const jobs: DeliveryJob[] = [];

    const result = await pollCampaignComments({
      AUTOMATION_ENABLED: "true",
      INSTAGRAM_ACCESS_TOKEN: "ig-token",
      INSTAGRAM_ACCOUNT_ID: "ig-account",
      DB: {} as D1Database,
      DELIVERY_QUEUE: {
        async send(job: DeliveryJob) {
          jobs.push(job);
        }
      } as unknown as Queue<DeliveryJob>
    } as never);

    expect(result.finalDeliveriesQueued).toBe(0);
    expect(listOpeningSentWithoutFinal).not.toHaveBeenCalled();
    expect(listLastStepSentWithoutFinal).not.toHaveBeenCalled();
    expect(jobs).toEqual([]);
  });

  it("queues public comment replies for users whose opening message was sent", async () => {
    const created: unknown[] = [];
    const jobs: DeliveryJob[] = [];
    const repo = {
      async listOpeningSentWithoutCommentReply() {
        return [{ campaignId: "blue-green", igUserId: "user-1", commentId: "comment-1" }];
      },
      async createDelivery(input: unknown) {
        created.push(input);
        return true;
      }
    };
    const queue = {
      async send(job: DeliveryJob) {
        jobs.push(job);
      }
    };

    const result = await queueCommentRepliesAfterOpening(repo, queue as never);

    expect(result).toBe(1);
    expect(created).toEqual([
      {
        id: "blue-green:user-1:comment_reply",
        campaignId: "blue-green",
        igUserId: "user-1",
        deliveryType: "comment_reply",
        status: "queued"
      }
    ]);
    expect(jobs).toEqual([
      {
        deliveryId: "blue-green:user-1:comment_reply",
        campaignId: "blue-green",
        igUserId: "user-1",
        deliveryType: "comment_reply",
        commentId: "comment-1"
      }
    ]);
  });

  it("does not queue public comment reply jobs when the delivery row already exists", async () => {
    const jobs: DeliveryJob[] = [];
    const repo = {
      async listOpeningSentWithoutCommentReply() {
        return [{ campaignId: "blue-green", igUserId: "user-1", commentId: "comment-1" }];
      },
      async createDelivery() {
        return false;
      }
    };
    const queue = {
      async send(job: DeliveryJob) {
        jobs.push(job);
      }
    };

    const result = await queueCommentRepliesAfterOpening(repo, queue as never);

    expect(result).toBe(0);
    expect(jobs).toEqual([]);
  });
});
