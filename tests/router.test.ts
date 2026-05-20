import { describe, expect, it } from "vitest";
import type { Campaign } from "../src/db/repository";
import { FlowRouter } from "../src/flows/router";
import type { DeliveryJob, NormalizedEvent } from "../src/types";

const baseCampaign: Campaign = {
  id: "campaign-1",
  name: "Campaign 1",
  mediaId: "media-1",
  keyword: "PROMPT",
  openingText: "Mau promptnya?",
  openingTextVariants: ["Mau promptnya?"],
  buttonTitle: "KIRIM",
  buttonPayload: "campaign-1:confirm",
  dmSteps: [],
  deliveryText: "Final prompt",
  commentReplyTextVariants: [],
  openingFailureReplyText: null,
  followGateEnabled: false,
  enabled: true
};

class FakeRepository {
  insertedEvents = new Set<string>();
  contacts: Array<Record<string, unknown>> = [];
  deliveries: Array<Record<string, unknown>> = [];
  eventCampaigns: Array<Record<string, unknown>> = [];
  storedStates = new Map<string, { campaignId: string; igUserId: string; state: string; lastCommentId?: string | null }>();
  latestState: { campaignId: string; igUserId: string; state: string; lastCommentId?: string | null } | null = null;
  campaign: Campaign | null = baseCampaign;

  async insertWebhookEvent(input: { eventId: string }): Promise<boolean> {
    if (this.insertedEvents.has(input.eventId)) return false;
    this.insertedEvents.add(input.eventId);
    return true;
  }

  async setWebhookEventCampaign(eventId: string, campaignId: string): Promise<void> {
    this.eventCampaigns.push({ eventId, campaignId });
  }

  async findCampaignForComment(mediaId: string, text: string): Promise<Campaign | null> {
    if (!this.campaign?.enabled) return null;
    return mediaId === this.campaign.mediaId && text.toLowerCase().includes("prompt") ? this.campaign : null;
  }

  async listCommentedCampaignsForUserOnMedia(mediaId: string, igUserId: string): Promise<Campaign[]> {
    if (!this.campaign?.enabled || mediaId !== this.campaign.mediaId) return [];

    const state = this.storedStates.get(`${this.campaign.id}:${igUserId}`);
    return state?.state === "commented" ? [this.campaign] : [];
  }

  async findCampaignById(id: string): Promise<Campaign | null> {
    return this.campaign?.id === id ? this.campaign : null;
  }

  async upsertContactState(input: Record<string, unknown>): Promise<void> {
    this.contacts.push(input);
    this.latestState = {
      campaignId: String(input.campaignId),
      igUserId: String(input.igUserId),
      state: String(input.state),
      lastCommentId: input.commentId == null ? null : String(input.commentId)
    };
    this.storedStates.set(`${input.campaignId}:${input.igUserId}`, this.latestState);
  }

  async createDelivery(input: Record<string, unknown>): Promise<boolean> {
    const exists = this.deliveries.some((delivery) => delivery.id === input.id);
    if (exists) return false;
    this.deliveries.push(input);
    return true;
  }

  async requeueFailedOpeningDelivery(deliveryId: string): Promise<boolean> {
    const delivery = this.deliveries.find((item) => item.id === deliveryId);
    if (!delivery || delivery.deliveryType !== "opening" || delivery.status !== "failed") return false;
    delivery.status = "queued";
    delivery.errorCode = null;
    delivery.errorMessage = null;
    return true;
  }

  async requeueSentOpeningDelivery(deliveryId: string): Promise<boolean> {
    const delivery = this.deliveries.find((item) => item.id === deliveryId);
    if (!delivery || delivery.deliveryType !== "opening" || delivery.status !== "sent") return false;
    delivery.status = "queued";
    delivery.errorCode = null;
    delivery.errorMessage = null;
    return true;
  }

  async requeueWaitingFollowDelivery(deliveryId: string): Promise<boolean> {
    const delivery = this.deliveries.find((item) => item.id === deliveryId);
    if (!delivery || delivery.status !== "waiting_follow") return false;
    delivery.status = "queued";
    return true;
  }

  async requeueInteractiveDelivery(deliveryId: string): Promise<boolean> {
    const delivery = this.deliveries.find((item) => item.id === deliveryId);
    if (!delivery || !["queued", "retrying", "failed"].includes(String(delivery.status))) return false;
    delivery.status = "queued";
    delivery.errorCode = null;
    delivery.errorMessage = null;
    return true;
  }

  async findLatestContactState(): Promise<{ campaignId: string; igUserId: string; state: string } | null> {
    return this.latestState;
  }

  async findContactState(
    campaignId: string,
    igUserId: string
  ): Promise<{ campaignId: string; igUserId: string; state: string; lastCommentId?: string | null } | null> {
    return this.storedStates.get(`${campaignId}:${igUserId}`) ?? null;
  }
}

class FakeQueue {
  jobs: DeliveryJob[] = [];

  async send(job: DeliveryJob): Promise<void> {
    this.jobs.push(job);
  }
}

describe("FlowRouter", () => {
  it("queues one opening delivery for a matching comment", async () => {
    const repo = new FakeRepository();
    const queue = new FakeQueue();
    const router = new FlowRouter(repo as never, queue as never);
    const event: NormalizedEvent = {
      type: "comment.created",
      eventId: "comment:comment-1",
      commentId: "comment-1",
      mediaId: "media-1",
      igUserId: "user-1",
      username: "testuser",
      text: "PROMPT"
    };

    await router.handleEvent(event, "{}");

    expect(repo.contacts).toMatchObject([
      { campaignId: "campaign-1", igUserId: "user-1", state: "commented" }
    ]);
    expect(repo.deliveries).toMatchObject([
      {
        id: "campaign-1:user-1:opening",
        campaignId: "campaign-1",
        igUserId: "user-1",
        deliveryType: "opening",
        status: "queued"
      }
    ]);
    expect(queue.jobs).toEqual([
      {
        deliveryId: "campaign-1:user-1:opening",
        campaignId: "campaign-1",
        igUserId: "user-1",
        deliveryType: "opening",
        commentId: "comment-1"
      }
    ]);
  });

  it("drops duplicate comment webhook events", async () => {
    const repo = new FakeRepository();
    const queue = new FakeQueue();
    const router = new FlowRouter(repo as never, queue as never);
    const event: NormalizedEvent = {
      type: "comment.created",
      eventId: "comment:comment-1",
      commentId: "comment-1",
      mediaId: "media-1",
      igUserId: "user-1",
      text: "PROMPT"
    };

    await router.handleEvent(event, "{}");
    await router.handleEvent(event, "{}");

    expect(queue.jobs).toHaveLength(1);
  });

  it("records but ignores matching comments from the business account itself", async () => {
    const repo = new FakeRepository();
    const queue = new FakeQueue();
    const router = new FlowRouter(repo as never, queue as never, true, "business-account-id");

    await router.handleEvent(
      {
        type: "comment.created",
        eventId: "comment:self-reply",
        commentId: "self-reply",
        mediaId: "media-1",
        igUserId: "business-account-id",
        username: "example_creator",
        text: "Check your DM. The bus has arrived."
      },
      "{}"
    );

    expect(repo.insertedEvents.has("comment:self-reply")).toBe(true);
    expect(repo.eventCampaigns).toEqual([]);
    expect(repo.contacts).toEqual([]);
    expect(repo.deliveries).toEqual([]);
    expect(queue.jobs).toEqual([]);
  });

  it("requeues a failed opening delivery when the user comments the trigger again", async () => {
    const repo = new FakeRepository();
    repo.deliveries.push({
      id: "campaign-1:user-1:opening",
      campaignId: "campaign-1",
      igUserId: "user-1",
      deliveryType: "opening",
      status: "failed",
      errorCode: "10",
      errorMessage: "This person isn't receiving messages from you right now."
    });
    const queue = new FakeQueue();
    const router = new FlowRouter(repo as never, queue as never);

    await router.handleEvent(
      {
        type: "comment.created",
        eventId: "comment:comment-2",
        commentId: "comment-2",
        mediaId: "media-1",
        igUserId: "user-1",
        username: "testuser",
        text: "PROMPT"
      },
      "{}"
    );

    expect(repo.deliveries).toHaveLength(1);
    expect(repo.deliveries[0]).toMatchObject({
      id: "campaign-1:user-1:opening",
      status: "queued",
      errorCode: null,
      errorMessage: null
    });
    expect(queue.jobs).toEqual([
      {
        deliveryId: "campaign-1:user-1:opening",
        campaignId: "campaign-1",
        igUserId: "user-1",
        deliveryType: "opening",
        commentId: "comment-2"
      }
    ]);
  });

  it("requeues an invalid-private-reply opening with the new trigger comment id", async () => {
    const repo = new FakeRepository();
    repo.storedStates.set("campaign-1:user-1", {
      campaignId: "campaign-1",
      igUserId: "user-1",
      state: "commented",
      lastCommentId: "comment-1"
    });
    repo.deliveries.push({
      id: "campaign-1:user-1:opening",
      campaignId: "campaign-1",
      igUserId: "user-1",
      deliveryType: "opening",
      status: "failed",
      errorCode: "100",
      errorMessage: "The comment is invalid for a private reply"
    });
    const queue = new FakeQueue();
    const router = new FlowRouter(repo as never, queue as never);

    await router.handleEvent(
      {
        type: "comment.created",
        eventId: "comment:comment-2",
        commentId: "comment-2",
        mediaId: "media-1",
        igUserId: "user-1",
        username: "testuser",
        text: "PROMPT"
      },
      "{}"
    );

    expect(repo.deliveries).toHaveLength(1);
    expect(repo.deliveries[0]).toMatchObject({
      id: "campaign-1:user-1:opening",
      status: "queued",
      errorCode: null,
      errorMessage: null
    });
    expect(repo.contacts).toMatchObject([
      {
        campaignId: "campaign-1",
        igUserId: "user-1",
        state: "commented",
        commentId: "comment-2"
      }
    ]);
    expect(queue.jobs).toEqual([
      {
        deliveryId: "campaign-1:user-1:opening",
        campaignId: "campaign-1",
        igUserId: "user-1",
        deliveryType: "opening",
        commentId: "comment-2"
      }
    ]);
  });

  it("requeues a sent opening delivery when a still-commented user comments the trigger again", async () => {
    const repo = new FakeRepository();
    repo.storedStates.set("campaign-1:user-1", {
      campaignId: "campaign-1",
      igUserId: "user-1",
      state: "commented",
      lastCommentId: "comment-1"
    });
    repo.deliveries.push({
      id: "campaign-1:user-1:opening",
      campaignId: "campaign-1",
      igUserId: "user-1",
      deliveryType: "opening",
      status: "sent"
    });
    const queue = new FakeQueue();
    const router = new FlowRouter(repo as never, queue as never);

    await router.handleEvent(
      {
        type: "comment.created",
        eventId: "comment:comment-2",
        commentId: "comment-2",
        mediaId: "media-1",
        igUserId: "user-1",
        username: "testuser",
        text: "PROMPT"
      },
      "{}"
    );

    expect(repo.deliveries).toHaveLength(1);
    expect(repo.deliveries[0]).toMatchObject({
      id: "campaign-1:user-1:opening",
      status: "queued",
      errorCode: null,
      errorMessage: null
    });
    expect(repo.contacts).toMatchObject([
      {
        campaignId: "campaign-1",
        igUserId: "user-1",
        state: "commented",
        commentId: "comment-2"
      }
    ]);
    expect(queue.jobs).toEqual([
      {
        deliveryId: "campaign-1:user-1:opening",
        campaignId: "campaign-1",
        igUserId: "user-1",
        deliveryType: "opening",
        commentId: "comment-2"
      }
    ]);
  });

  it("requeues a sent opening delivery when a still-commented user says the DM did not arrive", async () => {
    const repo = new FakeRepository();
    repo.storedStates.set("campaign-1:user-1", {
      campaignId: "campaign-1",
      igUserId: "user-1",
      state: "commented",
      lastCommentId: "comment-1"
    });
    repo.deliveries.push({
      id: "campaign-1:user-1:opening",
      campaignId: "campaign-1",
      igUserId: "user-1",
      deliveryType: "opening",
      status: "sent"
    });
    const queue = new FakeQueue();
    const router = new FlowRouter(repo as never, queue as never);

    await router.handleEvent(
      {
        type: "comment.created",
        eventId: "comment:comment-2",
        commentId: "comment-2",
        mediaId: "media-1",
        igUserId: "user-1",
        username: "testuser",
        text: "@example_creator belum ada ah min"
      },
      "{}"
    );

    expect(repo.eventCampaigns).toEqual([{ eventId: "comment:comment-2", campaignId: "campaign-1" }]);
    expect(repo.deliveries[0]).toMatchObject({
      id: "campaign-1:user-1:opening",
      status: "queued",
      errorCode: null,
      errorMessage: null
    });
    expect(repo.contacts).toMatchObject([
      {
        campaignId: "campaign-1",
        igUserId: "user-1",
        state: "commented",
        commentId: "comment-2"
      }
    ]);
    expect(queue.jobs).toEqual([
      {
        deliveryId: "campaign-1:user-1:opening",
        campaignId: "campaign-1",
        igUserId: "user-1",
        deliveryType: "opening",
        commentId: "comment-2"
      }
    ]);
  });

  it("requeues a failed opening delivery when a still-commented user says the DM did not arrive", async () => {
    const repo = new FakeRepository();
    repo.storedStates.set("campaign-1:user-1", {
      campaignId: "campaign-1",
      igUserId: "user-1",
      state: "commented",
      lastCommentId: "comment-1"
    });
    repo.deliveries.push({
      id: "campaign-1:user-1:opening",
      campaignId: "campaign-1",
      igUserId: "user-1",
      deliveryType: "opening",
      status: "failed",
      errorCode: "10",
      errorMessage: "This account can't receive your message"
    });
    const queue = new FakeQueue();
    const router = new FlowRouter(repo as never, queue as never);

    await router.handleEvent(
      {
        type: "comment.created",
        eventId: "comment:comment-2",
        commentId: "comment-2",
        mediaId: "media-1",
        igUserId: "user-1",
        username: "testuser",
        text: "belum masuk min"
      },
      "{}"
    );

    expect(repo.deliveries).toHaveLength(1);
    expect(repo.deliveries[0]).toMatchObject({
      id: "campaign-1:user-1:opening",
      status: "queued",
      errorCode: null,
      errorMessage: null
    });
    expect(repo.contacts).toMatchObject([
      {
        campaignId: "campaign-1",
        igUserId: "user-1",
        state: "commented",
        commentId: "comment-2"
      }
    ]);
    expect(queue.jobs).toEqual([
      {
        deliveryId: "campaign-1:user-1:opening",
        campaignId: "campaign-1",
        igUserId: "user-1",
        deliveryType: "opening",
        commentId: "comment-2"
      }
    ]);
  });

  it("recovers English missing-DM wording without requiring the campaign keyword again", async () => {
    const repo = new FakeRepository();
    repo.storedStates.set("campaign-1:user-1", {
      campaignId: "campaign-1",
      igUserId: "user-1",
      state: "commented",
      lastCommentId: "comment-1"
    });
    repo.deliveries.push({
      id: "campaign-1:user-1:opening",
      campaignId: "campaign-1",
      igUserId: "user-1",
      deliveryType: "opening",
      status: "sent"
    });
    const queue = new FakeQueue();
    const router = new FlowRouter(repo as never, queue as never);

    await router.handleEvent(
      {
        type: "comment.created",
        eventId: "comment:comment-2",
        commentId: "comment-2",
        mediaId: "media-1",
        igUserId: "user-1",
        username: "testuser",
        text: "I did not get the DM"
      },
      "{}"
    );

    expect(repo.eventCampaigns).toEqual([{ eventId: "comment:comment-2", campaignId: "campaign-1" }]);
    expect(repo.deliveries[0]).toMatchObject({ status: "queued" });
    expect(queue.jobs).toEqual([
      {
        deliveryId: "campaign-1:user-1:opening",
        campaignId: "campaign-1",
        igUserId: "user-1",
        deliveryType: "opening",
        commentId: "comment-2"
      }
    ]);
  });

  it("does not recover a missing-DM comment on another media id", async () => {
    const repo = new FakeRepository();
    repo.storedStates.set("campaign-1:user-1", {
      campaignId: "campaign-1",
      igUserId: "user-1",
      state: "commented",
      lastCommentId: "comment-1"
    });
    repo.deliveries.push({
      id: "campaign-1:user-1:opening",
      campaignId: "campaign-1",
      igUserId: "user-1",
      deliveryType: "opening",
      status: "sent"
    });
    const queue = new FakeQueue();
    const router = new FlowRouter(repo as never, queue as never);

    await router.handleEvent(
      {
        type: "comment.created",
        eventId: "comment:other-media",
        commentId: "comment-2",
        mediaId: "media-2",
        igUserId: "user-1",
        username: "testuser",
        text: "belum ada min"
      },
      "{}"
    );

    expect(repo.eventCampaigns).toEqual([]);
    expect(repo.deliveries[0]).toMatchObject({ status: "sent" });
    expect(repo.contacts).toEqual([]);
    expect(queue.jobs).toEqual([]);
  });

  it("does not recover a missing-DM comment after the user is already waiting on follow gate", async () => {
    const repo = new FakeRepository();
    repo.storedStates.set("campaign-1:user-1", {
      campaignId: "campaign-1",
      igUserId: "user-1",
      state: "follow_requested",
      lastCommentId: "comment-1"
    });
    repo.deliveries.push({
      id: "campaign-1:user-1:opening",
      campaignId: "campaign-1",
      igUserId: "user-1",
      deliveryType: "opening",
      status: "sent"
    });
    repo.deliveries.push({
      id: "campaign-1:user-1:final",
      campaignId: "campaign-1",
      igUserId: "user-1",
      deliveryType: "final",
      status: "waiting_follow"
    });
    const queue = new FakeQueue();
    const router = new FlowRouter(repo as never, queue as never);

    await router.handleEvent(
      {
        type: "comment.created",
        eventId: "comment:follow-waiting",
        commentId: "comment-2",
        mediaId: "media-1",
        igUserId: "user-1",
        username: "testuser",
        text: "DM belum masuk"
      },
      "{}"
    );

    expect(repo.eventCampaigns).toEqual([]);
    expect(repo.deliveries).toMatchObject([{ status: "sent" }, { status: "waiting_follow" }]);
    expect(repo.contacts).toEqual([]);
    expect(queue.jobs).toEqual([]);
  });

  it("does not requeue a sent opening for a second event carrying the same comment id", async () => {
    const repo = new FakeRepository();
    repo.storedStates.set("campaign-1:user-1", {
      campaignId: "campaign-1",
      igUserId: "user-1",
      state: "commented",
      lastCommentId: "comment-1"
    });
    repo.deliveries.push({
      id: "campaign-1:user-1:opening",
      campaignId: "campaign-1",
      igUserId: "user-1",
      deliveryType: "opening",
      status: "sent"
    });
    const queue = new FakeQueue();
    const router = new FlowRouter(repo as never, queue as never);

    await router.handleEvent(
      {
        type: "comment.created",
        eventId: "comment:comment-1:second-event",
        commentId: "comment-1",
        mediaId: "media-1",
        igUserId: "user-1",
        username: "testuser",
        text: "belum ada min"
      },
      "{}"
    );

    expect(repo.eventCampaigns).toEqual([{ eventId: "comment:comment-1:second-event", campaignId: "campaign-1" }]);
    expect(repo.deliveries[0]).toMatchObject({ status: "sent" });
    expect(repo.contacts).toEqual([]);
    expect(queue.jobs).toEqual([]);
  });

  it("does not recover missing-DM comments for disabled campaigns", async () => {
    const repo = new FakeRepository();
    repo.campaign = { ...baseCampaign, enabled: false };
    repo.storedStates.set("campaign-1:user-1", {
      campaignId: "campaign-1",
      igUserId: "user-1",
      state: "commented",
      lastCommentId: "comment-1"
    });
    repo.deliveries.push({
      id: "campaign-1:user-1:opening",
      campaignId: "campaign-1",
      igUserId: "user-1",
      deliveryType: "opening",
      status: "sent"
    });
    const queue = new FakeQueue();
    const router = new FlowRouter(repo as never, queue as never);

    await router.handleEvent(
      {
        type: "comment.created",
        eventId: "comment:disabled-campaign",
        commentId: "comment-2",
        mediaId: "media-1",
        igUserId: "user-1",
        username: "testuser",
        text: "belum ada min"
      },
      "{}"
    );

    expect(repo.eventCampaigns).toEqual([]);
    expect(repo.deliveries[0]).toMatchObject({ status: "sent" });
    expect(repo.contacts).toEqual([]);
    expect(queue.jobs).toEqual([]);
  });

  it("does not recover arbitrary non-keyword comments from still-commented users", async () => {
    const repo = new FakeRepository();
    repo.storedStates.set("campaign-1:user-1", {
      campaignId: "campaign-1",
      igUserId: "user-1",
      state: "commented",
      lastCommentId: "comment-1"
    });
    repo.deliveries.push({
      id: "campaign-1:user-1:opening",
      campaignId: "campaign-1",
      igUserId: "user-1",
      deliveryType: "opening",
      status: "sent"
    });
    const queue = new FakeQueue();
    const router = new FlowRouter(repo as never, queue as never);

    await router.handleEvent(
      {
        type: "comment.created",
        eventId: "comment:comment-2",
        commentId: "comment-2",
        mediaId: "media-1",
        igUserId: "user-1",
        username: "testuser",
        text: "makasih min"
      },
      "{}"
    );

    expect(repo.eventCampaigns).toEqual([]);
    expect(repo.deliveries[0]).toMatchObject({ status: "sent" });
    expect(repo.contacts).toEqual([]);
    expect(queue.jobs).toEqual([]);
  });

  it("does not requeue a sent opening delivery after the user has advanced past the comment state", async () => {
    const repo = new FakeRepository();
    repo.storedStates.set("campaign-1:user-1", {
      campaignId: "campaign-1",
      igUserId: "user-1",
      state: "delivered",
      lastCommentId: "comment-1"
    });
    repo.deliveries.push({
      id: "campaign-1:user-1:opening",
      campaignId: "campaign-1",
      igUserId: "user-1",
      deliveryType: "opening",
      status: "sent"
    });
    const queue = new FakeQueue();
    const router = new FlowRouter(repo as never, queue as never);

    await router.handleEvent(
      {
        type: "comment.created",
        eventId: "comment:comment-2",
        commentId: "comment-2",
        mediaId: "media-1",
        igUserId: "user-1",
        username: "testuser",
        text: "PROMPT"
      },
      "{}"
    );

    expect(repo.deliveries[0]).toMatchObject({ status: "sent" });
    expect(repo.contacts).toEqual([]);
    expect(queue.jobs).toEqual([]);
  });

  it("records webhooks but does not queue deliveries when automation is globally disabled", async () => {
    const repo = new FakeRepository();
    const queue = new FakeQueue();
    const router = new FlowRouter(repo as never, queue as never, false);

    await router.handleEvent(
      {
        type: "comment.created",
        eventId: "comment:comment-disabled",
        commentId: "comment-disabled",
        mediaId: "media-1",
        igUserId: "user-1",
        text: "PROMPT"
      },
      "{}"
    );

    expect(repo.insertedEvents.has("comment:comment-disabled")).toBe(true);
    expect(repo.contacts).toEqual([]);
    expect(repo.deliveries).toEqual([]);
    expect(queue.jobs).toEqual([]);
  });

  it("queues final delivery for a button postback", async () => {
    const repo = new FakeRepository();
    repo.latestState = { campaignId: "campaign-1", igUserId: "user-1", state: "commented" };
    const queue = new FakeQueue();
    const router = new FlowRouter(repo as never, queue as never);

    await router.handleEvent(
      {
        type: "message.postback",
        eventId: "postback:user-1:1:campaign-1:confirm",
        igUserId: "user-1",
        payload: "campaign-1:confirm"
      },
      "{}"
    );

    expect(repo.contacts).toMatchObject([
      { campaignId: "campaign-1", igUserId: "user-1", state: "confirmed" }
    ]);
    expect(queue.jobs).toEqual([
      {
        deliveryId: "campaign-1:user-1:final",
        campaignId: "campaign-1",
        igUserId: "user-1",
        deliveryType: "final"
      }
    ]);
  });

  it("requeues an existing failed final delivery when the user taps the button again", async () => {
    const repo = new FakeRepository();
    repo.latestState = { campaignId: "campaign-1", igUserId: "user-1", state: "commented" };
    repo.deliveries.push({
      id: "campaign-1:user-1:final",
      campaignId: "campaign-1",
      igUserId: "user-1",
      deliveryType: "final",
      status: "failed",
      errorCode: "10",
      errorMessage: "Outside allowed window"
    });
    const queue = new FakeQueue();
    const router = new FlowRouter(repo as never, queue as never);

    await router.handleEvent(
      {
        type: "message.postback",
        eventId: "postback:user-1:retry:campaign-1:confirm",
        igUserId: "user-1",
        payload: "campaign-1:confirm"
      },
      "{}"
    );

    expect(repo.deliveries).toHaveLength(1);
    expect(repo.deliveries[0]).toMatchObject({
      id: "campaign-1:user-1:final",
      status: "queued",
      errorCode: null,
      errorMessage: null
    });
    expect(queue.jobs).toEqual([
      {
        deliveryId: "campaign-1:user-1:final",
        campaignId: "campaign-1",
        igUserId: "user-1",
        deliveryType: "final"
      }
    ]);
  });

  it("queues intermediate DM steps before the final delivery", async () => {
    const repo = new FakeRepository();
    repo.campaign = {
      ...baseCampaign,
      dmSteps: [
        { text: "Step kedua", textVariants: ["Step kedua"], buttonTitle: "LANJUT" },
        { text: "Step ketiga", textVariants: ["Step ketiga"], buttonTitle: "AMBIL" }
      ]
    };
    repo.latestState = { campaignId: "campaign-1", igUserId: "user-1", state: "commented" };
    const queue = new FakeQueue();
    const router = new FlowRouter(repo as never, queue as never);

    await router.handleEvent(
      {
        type: "message.postback",
        eventId: "postback:user-1:step-1",
        igUserId: "user-1",
        payload: "campaign-1:step:1"
      },
      "{}"
    );

    expect(queue.jobs).toEqual([
      {
        deliveryId: "campaign-1:user-1:button_step:1",
        campaignId: "campaign-1",
        igUserId: "user-1",
        deliveryType: "button_step",
        stepIndex: 0
      }
    ]);

    repo.latestState = { campaignId: "campaign-1", igUserId: "user-1", state: "button_step:1" };
    await router.handleEvent(
      {
        type: "message.text",
        eventId: "message:user-1:lanjut",
        igUserId: "user-1",
        text: "LANJUT"
      },
      "{}"
    );

    expect(queue.jobs[1]).toEqual({
      deliveryId: "campaign-1:user-1:button_step:2",
      campaignId: "campaign-1",
      igUserId: "user-1",
      deliveryType: "button_step",
      stepIndex: 1
    });

    repo.latestState = { campaignId: "campaign-1", igUserId: "user-1", state: "button_step:2" };
    await router.handleEvent(
      {
        type: "message.text",
        eventId: "message:user-1:ambil",
        igUserId: "user-1",
        text: "AMBIL"
      },
      "{}"
    );

    expect(queue.jobs[2]).toEqual({
      deliveryId: "campaign-1:user-1:final",
      campaignId: "campaign-1",
      igUserId: "user-1",
      deliveryType: "final"
    });
  });

  it("ignores stale or forged postback payloads", async () => {
    const repo = new FakeRepository();
    const queue = new FakeQueue();
    const router = new FlowRouter(repo as never, queue as never);

    await router.handleEvent(
      {
        type: "message.postback",
        eventId: "postback:user-1:1:campaign-1:wrong",
        igUserId: "user-1",
        payload: "campaign-1:wrong"
      },
      "{}"
    );

    expect(repo.contacts).toEqual([]);
    expect(queue.jobs).toEqual([]);
  });

  it("recovers a one-button final postback when the prior contact state is missing", async () => {
    const repo = new FakeRepository();
    const queue = new FakeQueue();
    const router = new FlowRouter(repo as never, queue as never);

    await router.handleEvent(
      {
        type: "message.postback",
        eventId: "postback:user-1:1:campaign-1:confirm",
        igUserId: "user-1",
        payload: "campaign-1:confirm"
      },
      "{}"
    );

    expect(repo.eventCampaigns).toEqual([
      { eventId: "postback:user-1:1:campaign-1:confirm", campaignId: "campaign-1" }
    ]);
    expect(repo.contacts).toMatchObject([
      { campaignId: "campaign-1", igUserId: "user-1", state: "confirmed" }
    ]);
    expect(queue.jobs).toEqual([
      {
        deliveryId: "campaign-1:user-1:final",
        campaignId: "campaign-1",
        igUserId: "user-1",
        deliveryType: "final"
      }
    ]);
  });

  it("ignores intermediate step postbacks without a prior contact state", async () => {
    const repo = new FakeRepository();
    repo.campaign = {
      ...baseCampaign,
      dmSteps: [{ text: "Step kedua", textVariants: ["Step kedua"], buttonTitle: "LANJUT" }]
    };
    const queue = new FakeQueue();
    const router = new FlowRouter(repo as never, queue as never);

    await router.handleEvent(
      {
        type: "message.postback",
        eventId: "postback:user-1:1:campaign-1:step:1",
        igUserId: "user-1",
        payload: "campaign-1:step:1"
      },
      "{}"
    );

    expect(repo.contacts).toEqual([]);
    expect(queue.jobs).toEqual([]);
  });

  it("ignores postbacks when the latest contact state belongs to another campaign", async () => {
    const repo = new FakeRepository();
    repo.latestState = { campaignId: "other-campaign", igUserId: "user-1", state: "commented" };
    const queue = new FakeQueue();
    const router = new FlowRouter(repo as never, queue as never);

    await router.handleEvent(
      {
        type: "message.postback",
        eventId: "postback:user-1:1:campaign-1:confirm",
        igUserId: "user-1",
        payload: "campaign-1:confirm"
      },
      "{}"
    );

    expect(repo.contacts).toEqual([]);
    expect(queue.jobs).toEqual([]);
  });

  it("ignores postbacks for disabled campaigns", async () => {
    const repo = new FakeRepository();
    repo.campaign = { ...baseCampaign, enabled: false };
    const queue = new FakeQueue();
    const router = new FlowRouter(repo as never, queue as never);

    await router.handleEvent(
      {
        type: "message.postback",
        eventId: "postback:user-1:1:campaign-1:confirm",
        igUserId: "user-1",
        payload: "campaign-1:confirm"
      },
      "{}"
    );

    expect(repo.contacts).toEqual([]);
    expect(queue.jobs).toEqual([]);
  });

  it("requeues final delivery when user replies READY after follow request", async () => {
    const repo = new FakeRepository();
    repo.latestState = { campaignId: "campaign-1", igUserId: "user-1", state: "follow_requested" };
    const queue = new FakeQueue();
    const router = new FlowRouter(repo as never, queue as never);

    await router.handleEvent(
      {
        type: "message.text",
        eventId: "message:user-1:2:READY",
        igUserId: "user-1",
        text: "READY"
      },
      "{}"
    );

    expect(queue.jobs).toEqual([
      {
        deliveryId: "campaign-1:user-1:final",
        campaignId: "campaign-1",
        igUserId: "user-1",
        deliveryType: "final"
      }
    ]);
    expect(repo.deliveries).toMatchObject([
      {
        id: "campaign-1:user-1:final",
        campaignId: "campaign-1",
        igUserId: "user-1",
        deliveryType: "final",
        status: "queued"
      }
    ]);
  });

  it("requeues final delivery when user taps the button again after follow request", async () => {
    const repo = new FakeRepository();
    repo.latestState = { campaignId: "campaign-1", igUserId: "user-1", state: "follow_requested" };
    repo.deliveries.push({
      id: "campaign-1:user-1:final",
      campaignId: "campaign-1",
      igUserId: "user-1",
      deliveryType: "final",
      status: "waiting_follow"
    });
    const queue = new FakeQueue();
    const router = new FlowRouter(repo as never, queue as never);

    await router.handleEvent(
      {
        type: "message.postback",
        eventId: "postback:user-1:follow-again",
        igUserId: "user-1",
        payload: "campaign-1:confirm"
      },
      "{}"
    );

    expect(repo.deliveries).toHaveLength(1);
    expect(repo.deliveries[0]).toMatchObject({ status: "queued" });
    expect(queue.jobs).toEqual([
      {
        deliveryId: "campaign-1:user-1:final",
        campaignId: "campaign-1",
        igUserId: "user-1",
        deliveryType: "final"
      }
    ]);
  });

  it("requeues final delivery when user types the button title again after follow request", async () => {
    const repo = new FakeRepository();
    repo.latestState = { campaignId: "campaign-1", igUserId: "user-1", state: "follow_requested" };
    repo.deliveries.push({
      id: "campaign-1:user-1:final",
      campaignId: "campaign-1",
      igUserId: "user-1",
      deliveryType: "final",
      status: "waiting_follow"
    });
    const queue = new FakeQueue();
    const router = new FlowRouter(repo as never, queue as never);

    await router.handleEvent(
      {
        type: "message.text",
        eventId: "message:user-1:follow-again",
        igUserId: "user-1",
        text: "KIRIM"
      },
      "{}"
    );

    expect(repo.deliveries).toHaveLength(1);
    expect(repo.deliveries[0]).toMatchObject({ status: "queued" });
    expect(queue.jobs).toEqual([
      {
        deliveryId: "campaign-1:user-1:final",
        campaignId: "campaign-1",
        igUserId: "user-1",
        deliveryType: "final"
      }
    ]);
  });

  it("requeues final delivery when user types the custom follow gate button title", async () => {
    const repo = new FakeRepository();
    repo.campaign = { ...baseCampaign, followGateEnabled: true, followGateButtonTitle: "UDAH FOLLOW" };
    repo.latestState = { campaignId: "campaign-1", igUserId: "user-1", state: "follow_requested" };
    repo.deliveries.push({
      id: "campaign-1:user-1:final",
      campaignId: "campaign-1",
      igUserId: "user-1",
      deliveryType: "final",
      status: "waiting_follow"
    });
    const queue = new FakeQueue();
    const router = new FlowRouter(repo as never, queue as never);

    await router.handleEvent(
      {
        type: "message.text",
        eventId: "message:user-1:custom-follow-button",
        igUserId: "user-1",
        text: "udah follow"
      },
      "{}"
    );

    expect(repo.deliveries).toHaveLength(1);
    expect(repo.deliveries[0]).toMatchObject({ status: "queued" });
    expect(queue.jobs).toEqual([
      {
        deliveryId: "campaign-1:user-1:final",
        campaignId: "campaign-1",
        igUserId: "user-1",
        deliveryType: "final"
      }
    ]);
  });

  it("requeues final delivery when user types a common follow retry shorthand", async () => {
    const repo = new FakeRepository();
    repo.campaign = { ...baseCampaign, followGateEnabled: true, followGateButtonTitle: "I FOLLOWED" };
    repo.latestState = { campaignId: "campaign-1", igUserId: "user-1", state: "follow_requested" };
    repo.deliveries.push({
      id: "campaign-1:user-1:final",
      campaignId: "campaign-1",
      igUserId: "user-1",
      deliveryType: "final",
      status: "waiting_follow"
    });
    const queue = new FakeQueue();
    const router = new FlowRouter(repo as never, queue as never);

    await router.handleEvent(
      {
        type: "message.text",
        eventId: "message:user-1:followed",
        igUserId: "user-1",
        text: "FOLLOWED"
      },
      "{}"
    );

    expect(repo.deliveries).toHaveLength(1);
    expect(repo.deliveries[0]).toMatchObject({ status: "queued" });
    expect(queue.jobs).toEqual([
      {
        deliveryId: "campaign-1:user-1:final",
        campaignId: "campaign-1",
        igUserId: "user-1",
        deliveryType: "final"
      }
    ]);
  });

  it("does not enqueue duplicate final deliveries for repeated READY replies", async () => {
    const repo = new FakeRepository();
    repo.latestState = { campaignId: "campaign-1", igUserId: "user-1", state: "follow_requested" };
    repo.deliveries.push({
      id: "campaign-1:user-1:final",
      campaignId: "campaign-1",
      igUserId: "user-1",
      deliveryType: "final",
      status: "waiting_follow"
    });
    const queue = new FakeQueue();
    const router = new FlowRouter(repo as never, queue as never);

    await router.handleEvent(
      {
        type: "message.text",
        eventId: "message:user-1:2",
        igUserId: "user-1",
        text: "READY"
      },
      "{}"
    );
    await router.handleEvent(
      {
        type: "message.text",
        eventId: "message:user-1:3",
        igUserId: "user-1",
        text: "ready"
      },
      "{}"
    );

    expect(queue.jobs).toHaveLength(1);
    expect(repo.deliveries).toHaveLength(1);
    expect(repo.deliveries[0]).toMatchObject({ status: "queued" });
  });

  it("ignores READY unless the user is in follow request state", async () => {
    const repo = new FakeRepository();
    repo.latestState = { campaignId: "campaign-1", igUserId: "user-1", state: "commented" };
    const queue = new FakeQueue();
    const router = new FlowRouter(repo as never, queue as never);

    await router.handleEvent(
      {
        type: "message.text",
        eventId: "message:user-1:2:READY",
        igUserId: "user-1",
        text: "READY"
      },
      "{}"
    );

    expect(queue.jobs).toEqual([]);
  });
});
