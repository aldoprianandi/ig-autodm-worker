import { describe, expect, it } from "vitest";
import type { Campaign } from "../src/db/repository";
import { processDeliveryJob } from "../src/queue/consumer";
import type { DeliveryJob } from "../src/types";

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

const finalJob: DeliveryJob = {
  deliveryId: "campaign-1:user-1:final",
  campaignId: "campaign-1",
  igUserId: "user-1",
  deliveryType: "final"
};

class FakeDeliveryRepository {
  campaign: Campaign | null = baseCampaign;
  sent: Array<Record<string, unknown>> = [];
  waiting: Array<Record<string, unknown>> = [];
  retrying: Array<Record<string, unknown>> = [];
  retryOptions: Array<Record<string, unknown> | undefined> = [];
  failed: Array<Record<string, unknown>> = [];
  states: Array<Record<string, unknown>> = [];
  createdDeliveries: Array<Record<string, unknown>> = [];
  createDeliveryResults: boolean[] = [];
  rateLimitAllowed = true;
  retryingAllowed = true;
  claimAllowed = true;
  claims: string[] = [];

  async findCampaignById(): Promise<Campaign | null> {
    return this.campaign;
  }

  async markDeliverySent(deliveryId: string, messageId: string): Promise<void> {
    this.sent.push({ deliveryId, messageId });
  }

  async markDeliveryWaitingFollow(deliveryId: string, messageId: string): Promise<void> {
    this.waiting.push({ deliveryId, messageId });
  }

  async markDeliveryRetrying(
    deliveryId: string,
    code: string,
    message: string,
    options?: { countAttempt?: boolean }
  ): Promise<boolean> {
    this.retrying.push({ deliveryId, code, message });
    this.retryOptions.push(options);
    return this.retryingAllowed;
  }

  async markDeliveryFailed(deliveryId: string, code: string, message: string): Promise<void> {
    this.failed.push({ deliveryId, code, message });
  }

  async claimDeliveryForSend(deliveryId: string): Promise<"claimed" | "busy" | "skip"> {
    this.claims.push(deliveryId);
    return this.claimAllowed ? "claimed" : "skip";
  }

  async upsertContactState(input: Record<string, unknown>): Promise<void> {
    this.states.push(input);
  }

  async tryConsumeOutboundRateLimit(): Promise<boolean> {
    return this.rateLimitAllowed;
  }

  async createDelivery(input: Record<string, unknown>): Promise<boolean> {
    this.createdDeliveries.push(input);
    return this.createDeliveryResults.shift() ?? true;
  }
}

class FakeMetaClient {
  follows: boolean | null = true;
  textResult:
    | { ok: true; messageId: string }
    | { ok: false; retryable: boolean; code: string; message: string } = {
    ok: true,
    messageId: "message-1"
  };
  openingResult:
    | { ok: true; messageId: string }
    | { ok: false; retryable: boolean; code: string; message: string } = {
    ok: true,
    messageId: "opening-1"
  };
  buttonResult:
    | { ok: true; messageId: string }
    | { ok: false; retryable: boolean; code: string; message: string } = {
    ok: true,
    messageId: "button-step-1"
  };
  sentTexts: Array<{ igUserId: string; text: string }> = [];
  repliedComments: Array<{ commentId: string; text: string }> = [];
  openedComments: Array<{ commentId: string; text?: string }> = [];
  buttonMessages: Array<{ igUserId: string; text: string; buttonTitle: string; buttonPayload: string }> = [];
  profileReads: string[] = [];

  async sendOpening(commentId: string, _campaign: Campaign, text?: string): Promise<typeof this.openingResult> {
    this.openedComments.push({ commentId, text });
    return this.openingResult;
  }

  async sendButtonMessage(
    igUserId: string,
    text: string,
    buttonTitle: string,
    buttonPayload: string
  ): Promise<typeof this.buttonResult> {
    this.buttonMessages.push({ igUserId, text, buttonTitle, buttonPayload });
    return this.buttonResult;
  }

  async sendText(igUserId: string, text: string): Promise<typeof this.textResult> {
    this.sentTexts.push({ igUserId, text });
    return this.textResult;
  }

  async replyToComment(commentId: string, text: string): Promise<typeof this.textResult> {
    this.repliedComments.push({ commentId, text });
    return this.textResult;
  }

  async getUserProfile(igUserId: string): Promise<{ isUserFollowBusiness: boolean | null }> {
    this.profileReads.push(igUserId);
    return { isUserFollowBusiness: this.follows };
  }
}

class FakeQueue {
  sent: DeliveryJob[] = [];

  async send(job: DeliveryJob): Promise<void> {
    this.sent.push(job);
  }
}

describe("processDeliveryJob", () => {
  it("does not resend when a transport failure leaves Meta acceptance unknown", async () => {
    const repo = new FakeDeliveryRepository();
    const meta = new FakeMetaClient();
    meta.sendText = async () => { throw new Error("connection closed"); };
    expect(await processDeliveryJob(repo as never, meta as never, finalJob)).toBe("ack");
    expect(repo.failed).toMatchObject([{ code: "send_status_unknown" }]);
    expect(repo.retrying).toEqual([]);
  });

  it("can retry a failed profile read because no message was sent", async () => {
    const repo = new FakeDeliveryRepository();
    repo.campaign = { ...baseCampaign, followGateEnabled: true };
    const meta = new FakeMetaClient();
    meta.getUserProfile = async () => { throw new Error("connection closed"); };
    expect(await processDeliveryJob(repo as never, meta as never, finalJob)).toBe("retry");
    expect(repo.retrying).toMatchObject([{ code: "delivery_exception" }]);
    expect(repo.failed).toEqual([]);
  });

  it("does not advance past a delivered intermediate step without interaction", async () => {
    const repo = new FakeDeliveryRepository();
    repo.campaign = { ...baseCampaign, dmSteps: [{ text: "Step", textVariants: [], buttonTitle: "NEXT" }] };
    const queue = new FakeQueue();
    const job: DeliveryJob = { ...finalJob, deliveryType: "button_step", stepIndex: 0 };
    await processDeliveryJob(repo as never, new FakeMetaClient() as never, job, true, 30, queue as never);
    expect(repo.sent).toHaveLength(1);
    expect(queue.sent).toEqual([]);
    expect(repo.createdDeliveries).toEqual([]);
  });

  it("counts unknown follow checks toward the retry cap", async () => {
    const repo = new FakeDeliveryRepository();
    repo.campaign = { ...baseCampaign, followGateEnabled: true };
    const meta = new FakeMetaClient();
    meta.getUserProfile = async () => ({ isUserFollowBusiness: null });
    expect(await processDeliveryJob(repo as never, meta as never, finalJob)).toBe("retry");
    expect(repo.retryOptions).toEqual([undefined]);
    repo.retryingAllowed = false;
    expect(await processDeliveryJob(repo as never, meta as never, finalJob)).toBe("ack");
    expect(meta.sentTexts).toEqual([]);
  });

  it("terminates an unsendable public reply instead of leaving it recoverable forever", async () => {
    const repo = new FakeDeliveryRepository();
    const meta = new FakeMetaClient();
    await processDeliveryJob(repo as never, meta as never, {
      ...finalJob, deliveryType: "comment_reply", commentId: "comment-1"
    });
    expect(repo.failed).toMatchObject([{ code: "malformed_campaign" }]);
  });

  it("preserves a previously claimed or completed delivery when automation is disabled", async () => {
    const repo = new FakeDeliveryRepository();
    repo.claimAllowed = false;
    expect(await processDeliveryJob(repo as never, new FakeMetaClient() as never, finalJob, false)).toBe("ack");
    expect(repo.failed).toEqual([]);
  });

  it("acks without sending when automation is globally disabled", async () => {
    const repo = new FakeDeliveryRepository();
    const meta = new FakeMetaClient();

    const disposition = await processDeliveryJob(repo as never, meta as never, finalJob, false);

    expect(disposition).toBe("ack");
    expect(meta.sentTexts).toEqual([]);
    expect(repo.failed).toEqual([
      {
        deliveryId: "campaign-1:user-1:final",
        code: "automation_disabled",
        message: "Automation is disabled by AUTOMATION_ENABLED"
      }
    ]);
    expect(repo.sent).toEqual([]);
    expect(repo.claims).toEqual(["campaign-1:user-1:final"]);
  });

  it("preserves a sent delivery when automation is globally disabled", async () => {
    const repo = new FakeDeliveryRepository();
    repo.claimAllowed = false;
    const meta = new FakeMetaClient();

    const disposition = await processDeliveryJob(repo as never, meta as never, finalJob, false);

    expect(disposition).toBe("ack");
    expect(repo.claims).toEqual(["campaign-1:user-1:final"]);
    expect(repo.failed).toEqual([]);
    expect(meta.sentTexts).toEqual([]);
  });

  it("acks without sending when the campaign is disabled", async () => {
    const repo = new FakeDeliveryRepository();
    repo.campaign = { ...baseCampaign, enabled: false };
    const meta = new FakeMetaClient();

    const disposition = await processDeliveryJob(repo as never, meta as never, finalJob);

    expect(disposition).toBe("ack");
    expect(meta.sentTexts).toEqual([]);
    expect(repo.sent).toEqual([]);
    expect(repo.claims).toEqual(["campaign-1:user-1:final"]);
    expect(repo.failed).toEqual([
      {
        deliveryId: "campaign-1:user-1:final",
        code: "campaign_disabled",
        message: "Campaign is disabled"
      }
    ]);
  });

  it("marks delivery failed without sending when the campaign is missing", async () => {
    const repo = new FakeDeliveryRepository();
    repo.campaign = null;
    const meta = new FakeMetaClient();

    const disposition = await processDeliveryJob(repo as never, meta as never, finalJob);

    expect(disposition).toBe("ack");
    expect(meta.sentTexts).toEqual([]);
    expect(repo.sent).toEqual([]);
    expect(repo.claims).toEqual(["campaign-1:user-1:final"]);
    expect(repo.failed).toEqual([
      {
        deliveryId: "campaign-1:user-1:final",
        code: "campaign_missing",
        message: "Campaign no longer exists"
      }
    ]);
  });

  it.each([
    ["disabled", { ...baseCampaign, enabled: false }],
    ["missing", null]
  ])("preserves a sent delivery when its campaign is %s", async (_scenario, campaignState) => {
    const repo = new FakeDeliveryRepository();
    repo.campaign = campaignState;
    repo.claimAllowed = false;
    const meta = new FakeMetaClient();

    const disposition = await processDeliveryJob(repo as never, meta as never, finalJob);

    expect(disposition).toBe("ack");
    expect(repo.claims).toEqual(["campaign-1:user-1:final"]);
    expect(repo.failed).toEqual([]);
    expect(meta.sentTexts).toEqual([]);
  });

  it("sends final delivery and marks user delivered when follow gate passes", async () => {
    const repo = new FakeDeliveryRepository();
    repo.campaign = { ...baseCampaign, followGateEnabled: true };
    const meta = new FakeMetaClient();
    meta.follows = true;

    const disposition = await processDeliveryJob(repo as never, meta as never, finalJob);

    expect(disposition).toBe("ack");
    expect(repo.claims).toEqual(["campaign-1:user-1:final"]);
    expect(meta.sentTexts).toEqual([{ igUserId: "user-1", text: "Final prompt" }]);
    expect(repo.sent).toEqual([{ deliveryId: "campaign-1:user-1:final", messageId: "message-1" }]);
    expect(repo.states).toEqual([
      { campaignId: "campaign-1", igUserId: "user-1", state: "delivered" }
    ]);
    expect(repo.waiting).toEqual([]);
  });

  it("sends follow request and does not mark final delivered when user is not following", async () => {
    const repo = new FakeDeliveryRepository();
    repo.campaign = { ...baseCampaign, followGateEnabled: true };
    const meta = new FakeMetaClient();
    meta.follows = false;

    const disposition = await processDeliveryJob(repo as never, meta as never, finalJob);

    expect(disposition).toBe("ack");
    expect(repo.claims).toEqual(["campaign-1:user-1:final"]);
    expect(meta.sentTexts).toEqual([]);
    expect(meta.buttonMessages).toEqual([
      {
        igUserId: "user-1",
        text: "Follow dulu akun ini, lalu tap KIRIM lagi. Kalau tombolnya gak muncul, balas READY.",
        buttonTitle: "KIRIM",
        buttonPayload: "campaign-1:confirm"
      }
    ]);
    expect(repo.waiting).toEqual([
      { deliveryId: "campaign-1:user-1:final", messageId: "button-step-1" }
    ]);
    expect(repo.states).toEqual([
      { campaignId: "campaign-1", igUserId: "user-1", state: "follow_requested" }
    ]);
    expect(repo.sent).toEqual([]);
  });

  it("sends the follow request again on a manual retry while the user is still not following", async () => {
    const repo = new FakeDeliveryRepository();
    repo.campaign = { ...baseCampaign, followGateEnabled: true };
    const meta = new FakeMetaClient();
    meta.follows = false;

    const disposition = await processDeliveryJob(repo as never, meta as never, finalJob);

    expect(disposition).toBe("ack");
    expect(repo.claims).toEqual(["campaign-1:user-1:final"]);
    expect(meta.sentTexts).toEqual([]);
    expect(meta.buttonMessages).toEqual([
      {
        igUserId: "user-1",
        text: "Follow dulu akun ini, lalu tap KIRIM lagi. Kalau tombolnya gak muncul, balas READY.",
        buttonTitle: "KIRIM",
        buttonPayload: "campaign-1:confirm"
      }
    ]);
    expect(repo.waiting).toEqual([
      { deliveryId: "campaign-1:user-1:final", messageId: "button-step-1" }
    ]);
    expect(repo.states).toEqual([
      { campaignId: "campaign-1", igUserId: "user-1", state: "follow_requested" }
    ]);
    expect(repo.sent).toEqual([]);
  });

  it("uses custom follow gate text when configured", async () => {
    const repo = new FakeDeliveryRepository();
    repo.campaign = {
      ...baseCampaign,
      followGateEnabled: true,
      followGateText: "Follow dulu akun ini, lalu pencet KIRIM lagi ya."
    };
    const meta = new FakeMetaClient();
    meta.follows = false;

    const disposition = await processDeliveryJob(repo as never, meta as never, finalJob);

    expect(disposition).toBe("ack");
    expect(meta.buttonMessages).toEqual([
      {
        igUserId: "user-1",
        text: "Follow dulu akun ini, lalu pencet KIRIM lagi ya.",
        buttonTitle: "KIRIM",
        buttonPayload: "campaign-1:confirm"
      }
    ]);
  });

  it("uses custom follow gate button title when configured", async () => {
    const repo = new FakeDeliveryRepository();
    repo.campaign = {
      ...baseCampaign,
      followGateEnabled: true,
      followGateText: "Follow dulu, lalu tap tombol ini.",
      followGateButtonTitle: "UDAH FOLLOW"
    };
    const meta = new FakeMetaClient();
    meta.follows = false;

    const disposition = await processDeliveryJob(repo as never, meta as never, finalJob);

    expect(disposition).toBe("ack");
    expect(meta.buttonMessages).toEqual([
      {
        igUserId: "user-1",
        text: "Follow dulu, lalu tap tombol ini.",
        buttonTitle: "UDAH FOLLOW",
        buttonPayload: "campaign-1:confirm"
      }
    ]);
  });

  it("sends final delivery when a manual retry passes the follow gate", async () => {
    const repo = new FakeDeliveryRepository();
    repo.campaign = { ...baseCampaign, followGateEnabled: true };
    const meta = new FakeMetaClient();
    meta.follows = true;

    const disposition = await processDeliveryJob(repo as never, meta as never, finalJob);

    expect(disposition).toBe("ack");
    expect(meta.sentTexts).toEqual([{ igUserId: "user-1", text: "Final prompt" }]);
    expect(repo.sent).toEqual([{ deliveryId: "campaign-1:user-1:final", messageId: "message-1" }]);
  });

  it("retries without sending when follow status cannot be checked", async () => {
    const repo = new FakeDeliveryRepository();
    repo.campaign = { ...baseCampaign, followGateEnabled: true };
    const meta = new FakeMetaClient();
    meta.follows = null;

    const disposition = await processDeliveryJob(repo as never, meta as never, finalJob);

    expect(disposition).toBe("retry");
    expect(repo.claims).toEqual(["campaign-1:user-1:final"]);
    expect(meta.sentTexts).toEqual([]);
    expect(repo.retrying).toEqual([
      {
        deliveryId: "campaign-1:user-1:final",
        code: "follow_status_unknown",
        message: "Could not verify follow status before final delivery"
      }
    ]);
    expect(repo.waiting).toEqual([]);
    expect(repo.sent).toEqual([]);
  });

  it("retries locally before reading Meta profile when the follow status read limit is full", async () => {
    const repo = new FakeDeliveryRepository();
    repo.campaign = { ...baseCampaign, followGateEnabled: true };
    repo.rateLimitAllowed = false;
    const meta = new FakeMetaClient();

    const disposition = await processDeliveryJob(repo as never, meta as never, finalJob);

    expect(disposition).toBe("retry");
    expect(repo.claims).toEqual(["campaign-1:user-1:final"]);
    expect(meta.profileReads).toEqual([]);
    expect(meta.sentTexts).toEqual([]);
    expect(meta.buttonMessages).toEqual([]);
    expect(repo.retrying).toEqual([
      {
        deliveryId: "campaign-1:user-1:final",
        code: "local_read_rate_limited",
        message: "Local Meta read rate limit reached"
      }
    ]);
    expect(repo.waiting).toEqual([]);
    expect(repo.states).toEqual([]);
  });

  it("does not mark a final delivery waiting when the follow instruction send permanently fails", async () => {
    const repo = new FakeDeliveryRepository();
    repo.campaign = { ...baseCampaign, followGateEnabled: true };
    const meta = new FakeMetaClient();
    meta.follows = false;
    meta.buttonResult = {
      ok: false,
      retryable: false,
      code: "10",
      message: "This account can't receive your message"
    };

    const disposition = await processDeliveryJob(repo as never, meta as never, finalJob);

    expect(disposition).toBe("ack");
    expect(meta.sentTexts).toEqual([]);
    expect(meta.buttonMessages).toEqual([
      {
        igUserId: "user-1",
        text: "Follow dulu akun ini, lalu tap KIRIM lagi. Kalau tombolnya gak muncul, balas READY.",
        buttonTitle: "KIRIM",
        buttonPayload: "campaign-1:confirm"
      }
    ]);
    expect(repo.failed).toEqual([
      {
        deliveryId: "campaign-1:user-1:final",
        code: "10",
        message: "This account can't receive your message"
      }
    ]);
    expect(repo.waiting).toEqual([]);
    expect(repo.states).toEqual([]);
  });

  it("retries without changing state when the follow instruction send is transiently rate limited", async () => {
    const repo = new FakeDeliveryRepository();
    repo.campaign = { ...baseCampaign, followGateEnabled: true };
    const meta = new FakeMetaClient();
    meta.follows = false;
    meta.buttonResult = {
      ok: false,
      retryable: true,
      code: "429",
      message: "Meta send rate limited"
    };

    const disposition = await processDeliveryJob(repo as never, meta as never, finalJob);

    expect(disposition).toBe("retry");
    expect(meta.sentTexts).toEqual([]);
    expect(repo.retrying).toEqual([
      {
        deliveryId: "campaign-1:user-1:final",
        code: "429",
        message: "Meta send rate limited"
      }
    ]);
    expect(repo.waiting).toEqual([]);
    expect(repo.states).toEqual([]);
  });

  it("retries transient Meta API failures", async () => {
    const repo = new FakeDeliveryRepository();
    const meta = new FakeMetaClient();
    meta.textResult = { ok: false, retryable: true, code: "429", message: "rate limited" };

    const disposition = await processDeliveryJob(repo as never, meta as never, finalJob);

    expect(disposition).toBe("retry");
    expect(repo.claims).toEqual(["campaign-1:user-1:final"]);
    expect(repo.retrying).toEqual([
      {
        deliveryId: "campaign-1:user-1:final",
        code: "429",
        message: "rate limited"
      }
    ]);
  });

  it("acks retryable Meta API failures when delivery retry attempts are exhausted", async () => {
    const repo = new FakeDeliveryRepository();
    repo.retryingAllowed = false;
    const meta = new FakeMetaClient();
    meta.textResult = { ok: false, retryable: true, code: "429", message: "rate limited" };

    const disposition = await processDeliveryJob(repo as never, meta as never, finalJob);

    expect(disposition).toBe("ack");
    expect(repo.claims).toEqual(["campaign-1:user-1:final"]);
    expect(repo.retrying).toEqual([
      {
        deliveryId: "campaign-1:user-1:final",
        code: "429",
        message: "rate limited"
      }
    ]);
  });

  it("retries locally without calling Meta when the outbound rate limit is full", async () => {
    const repo = new FakeDeliveryRepository();
    repo.rateLimitAllowed = false;
    const meta = new FakeMetaClient();

    const disposition = await processDeliveryJob(repo as never, meta as never, finalJob);

    expect(disposition).toBe("retry");
    expect(repo.claims).toEqual(["campaign-1:user-1:final"]);
    expect(meta.sentTexts).toEqual([]);
    expect(repo.retrying).toEqual([
      {
        deliveryId: "campaign-1:user-1:final",
        code: "local_rate_limited",
        message: "Local outbound Meta send rate limit reached"
      }
    ]);
    expect(repo.retryOptions).toEqual([{ countAttempt: false }]);
  });

  it("acks permanent Meta API failures after marking failed", async () => {
    const repo = new FakeDeliveryRepository();
    const meta = new FakeMetaClient();
    meta.textResult = { ok: false, retryable: false, code: "400", message: "bad request" };

    const disposition = await processDeliveryJob(repo as never, meta as never, finalJob);

    expect(disposition).toBe("ack");
    expect(repo.claims).toEqual(["campaign-1:user-1:final"]);
    expect(repo.failed).toEqual([
      {
        deliveryId: "campaign-1:user-1:final",
        code: "400",
        message: "bad request"
      }
    ]);
  });

  it("sends public comment replies and marks the reply delivery sent", async () => {
    const repo = new FakeDeliveryRepository();
    repo.campaign = { ...baseCampaign, commentReplyText: "Cek DM kamu ya" };
    const meta = new FakeMetaClient();
    const job: DeliveryJob = {
      deliveryId: "campaign-1:user-1:comment_reply",
      campaignId: "campaign-1",
      igUserId: "user-1",
      deliveryType: "comment_reply",
      commentId: "comment-1"
    };

    const disposition = await processDeliveryJob(repo as never, meta as never, job);

    expect(disposition).toBe("ack");
    expect(repo.claims).toEqual(["campaign-1:user-1:comment_reply"]);
    expect(meta.repliedComments).toEqual([{ commentId: "comment-1", text: "Cek DM kamu ya" }]);
    expect(meta.sentTexts).toEqual([]);
    expect(repo.sent).toEqual([
      { deliveryId: "campaign-1:user-1:comment_reply", messageId: "message-1" }
    ]);
    expect(repo.states).toEqual([]);
  });

  it("selects public reply variants deterministically per comment", async () => {
    const variants = ["Cek DM kamu ya", "Udah gue kirim ke DM", "Masuk DM ya"];
    const job: DeliveryJob = {
      deliveryId: "campaign-1:user-1:comment_reply",
      campaignId: "campaign-1",
      igUserId: "user-1",
      deliveryType: "comment_reply",
      commentId: "comment-1"
    };
    const firstRepo = new FakeDeliveryRepository();
    firstRepo.campaign = { ...baseCampaign, commentReplyText: "Cek DM kamu ya", commentReplyTextVariants: variants };
    const firstMeta = new FakeMetaClient();

    await processDeliveryJob(firstRepo as never, firstMeta as never, job);

    const secondRepo = new FakeDeliveryRepository();
    secondRepo.campaign = { ...baseCampaign, commentReplyText: "Cek DM kamu ya", commentReplyTextVariants: variants };
    const secondMeta = new FakeMetaClient();

    await processDeliveryJob(secondRepo as never, secondMeta as never, job);

    expect(variants).toContain(firstMeta.repliedComments[0]?.text);
    expect(secondMeta.repliedComments[0]?.text).toBe(firstMeta.repliedComments[0]?.text);
  });

  it("selects opening DM variants deterministically per comment", async () => {
    const variants = ["Mau promptnya?", "Promptnya udah siap", "Tap tombol ini dulu"];
    const job: DeliveryJob = {
      deliveryId: "campaign-1:user-1:opening",
      campaignId: "campaign-1",
      igUserId: "user-1",
      deliveryType: "opening",
      commentId: "comment-1"
    };
    const firstRepo = new FakeDeliveryRepository();
    firstRepo.campaign = { ...baseCampaign, openingTextVariants: variants };
    const firstMeta = new FakeMetaClient();

    await processDeliveryJob(firstRepo as never, firstMeta as never, job);

    const secondRepo = new FakeDeliveryRepository();
    secondRepo.campaign = { ...baseCampaign, openingTextVariants: variants };
    const secondMeta = new FakeMetaClient();

    await processDeliveryJob(secondRepo as never, secondMeta as never, job);

    expect(variants).toContain(firstMeta.openedComments[0]?.text);
    expect(secondMeta.openedComments[0]?.text).toBe(firstMeta.openedComments[0]?.text);
  });

  it("queues public comment reply but waits for the TEMBOK button before final delivery", async () => {
    const repo = new FakeDeliveryRepository();
    repo.campaign = { ...baseCampaign, buttonTitle: "TEMBOK", commentReplyText: "Cek DM kamu ya" };
    const meta = new FakeMetaClient();
    const queue = new FakeQueue();
    const job: DeliveryJob = {
      deliveryId: "campaign-1:user-1:opening",
      campaignId: "campaign-1",
      igUserId: "user-1",
      deliveryType: "opening",
      commentId: "comment-1"
    };

    const disposition = await processDeliveryJob(repo as never, meta as never, job, true, 30, queue as never);

    expect(disposition).toBe("ack");
    expect(repo.sent).toEqual([{ deliveryId: "campaign-1:user-1:opening", messageId: "opening-1" }]);
    expect(repo.states).toEqual([{ campaignId: "campaign-1", igUserId: "user-1", state: "commented" }]);
    expect(repo.createdDeliveries).toEqual([
      {
        id: "campaign-1:user-1:comment_reply",
        campaignId: "campaign-1",
        igUserId: "user-1",
        deliveryType: "comment_reply",
        status: "queued"
      }
    ]);
    expect(queue.sent).toEqual([
      {
        deliveryId: "campaign-1:user-1:comment_reply",
        campaignId: "campaign-1",
        igUserId: "user-1",
        deliveryType: "comment_reply",
        commentId: "comment-1"
      }
    ]);
  });

  it("does not queue any final delivery after a follow-gated one-button opening", async () => {
    const repo = new FakeDeliveryRepository();
    repo.campaign = {
      ...baseCampaign,
      buttonTitle: "TEMBOK",
      buttonPayload: "campaign-1:confirm",
      commentReplyText: "Cek DM kamu ya",
      followGateEnabled: true
    };
    const meta = new FakeMetaClient();
    const queue = new FakeQueue();
    const job: DeliveryJob = {
      deliveryId: "campaign-1:user-1:opening",
      campaignId: "campaign-1",
      igUserId: "user-1",
      deliveryType: "opening",
      commentId: "comment-1"
    };

    const disposition = await processDeliveryJob(repo as never, meta as never, job, true, 30, queue as never);

    expect(disposition).toBe("ack");
    expect(repo.createdDeliveries).toEqual([
      {
        id: "campaign-1:user-1:comment_reply",
        campaignId: "campaign-1",
        igUserId: "user-1",
        deliveryType: "comment_reply",
        status: "queued"
      }
    ]);
    expect(queue.sent).toEqual([
      {
        deliveryId: "campaign-1:user-1:comment_reply",
        campaignId: "campaign-1",
        igUserId: "user-1",
        deliveryType: "comment_reply",
        commentId: "comment-1"
      }
    ]);
    expect(repo.sent).toEqual([{ deliveryId: "campaign-1:user-1:opening", messageId: "opening-1" }]);
    expect(meta.sentTexts).toEqual([]);
    expect(meta.buttonMessages).toEqual([]);
    expect(repo.waiting).toEqual([]);
  });

  it("does not queue public replies or final deliveries after an opening without follow-up config", async () => {
    const repo = new FakeDeliveryRepository();
    const meta = new FakeMetaClient();
    const queue = new FakeQueue();
    const job: DeliveryJob = {
      deliveryId: "campaign-1:user-1:opening",
      campaignId: "campaign-1",
      igUserId: "user-1",
      deliveryType: "opening",
      commentId: "comment-1"
    };

    const disposition = await processDeliveryJob(repo as never, meta as never, job, true, 30, queue as never);

    expect(disposition).toBe("ack");
    expect(repo.createdDeliveries).toEqual([]);
    expect(queue.sent).toEqual([]);
    expect(meta.sentTexts).toEqual([]);
    expect(meta.buttonMessages).toEqual([]);
    expect(repo.sent).toEqual([{ deliveryId: "campaign-1:user-1:opening", messageId: "opening-1" }]);
    expect(repo.states).toEqual([{ campaignId: "campaign-1", igUserId: "user-1", state: "commented" }]);
  });

  it("waits for user interaction before queueing the first configured DM step", async () => {
    const repo = new FakeDeliveryRepository();
    repo.campaign = {
      ...baseCampaign,
      dmSteps: [{ text: "Choose a style first.", textVariants: ["Choose a style first."], buttonTitle: "NEXT" }]
    };
    const meta = new FakeMetaClient();
    const queue = new FakeQueue();
    const job: DeliveryJob = {
      deliveryId: "campaign-1:user-1:opening",
      campaignId: "campaign-1",
      igUserId: "user-1",
      deliveryType: "opening",
      commentId: "comment-1"
    };

    const disposition = await processDeliveryJob(repo as never, meta as never, job, true, 30, queue as never);

    expect(disposition).toBe("ack");
    expect(repo.createdDeliveries).toEqual([]);
    expect(queue.sent).toEqual([]);
    expect(repo.states).toEqual([{ campaignId: "campaign-1", igUserId: "user-1", state: "commented" }]);
  });

  it("does not requeue a public comment reply that was already sent", async () => {
    const repo = new FakeDeliveryRepository();
    repo.campaign = { ...baseCampaign, buttonTitle: "TEMBOK", commentReplyText: "Cek DM kamu ya" };
    repo.createDeliveryResults = [false];
    const meta = new FakeMetaClient();
    const queue = new FakeQueue();
    const job: DeliveryJob = {
      deliveryId: "campaign-1:user-1:opening",
      campaignId: "campaign-1",
      igUserId: "user-1",
      deliveryType: "opening",
      commentId: "comment-2"
    };

    const disposition = await processDeliveryJob(repo as never, meta as never, job, true, 30, queue as never);

    expect(disposition).toBe("ack");
    expect(repo.sent).toEqual([{ deliveryId: "campaign-1:user-1:opening", messageId: "opening-1" }]);
    expect(queue.sent).toEqual([]);
  });

  it("queues the configured public rescue reply when opening DM cannot be delivered to the user", async () => {
    const repo = new FakeDeliveryRepository();
    repo.campaign = {
      ...baseCampaign,
      openingFailureReplyText: "DM kamu belum bisa kami kirim. Buka izin DM, lalu komen PROMPT lagi."
    };
    const meta = new FakeMetaClient();
    meta.openingResult = {
      ok: false,
      retryable: false,
      code: "10",
      message: "This Person Cannot Receive Messages: This person isn't receiving messages from you right now."
    };
    const queue = new FakeQueue();
    const job: DeliveryJob = {
      deliveryId: "campaign-1:user-1:opening",
      campaignId: "campaign-1",
      igUserId: "user-1",
      deliveryType: "opening",
      commentId: "comment-1"
    };

    const disposition = await processDeliveryJob(repo as never, meta as never, job, true, 30, queue as never);

    expect(disposition).toBe("ack");
    expect(repo.failed).toEqual([
      {
        deliveryId: "campaign-1:user-1:opening",
        code: "10",
        message: "This Person Cannot Receive Messages: This person isn't receiving messages from you right now."
      }
    ]);
    expect(repo.createdDeliveries).toEqual([
      {
        id: "campaign-1:user-1:opening_failure_reply",
        campaignId: "campaign-1",
        igUserId: "user-1",
        deliveryType: "opening_failure_reply",
        status: "queued"
      }
    ]);
    expect(queue.sent).toEqual([
      {
        deliveryId: "campaign-1:user-1:opening_failure_reply",
        campaignId: "campaign-1",
        igUserId: "user-1",
        deliveryType: "opening_failure_reply",
        commentId: "comment-1"
      }
    ]);
  });

  it("does not queue a rescue reply when opening delivery fails but no rescue text is configured", async () => {
    const repo = new FakeDeliveryRepository();
    const meta = new FakeMetaClient();
    meta.openingResult = {
      ok: false,
      retryable: false,
      code: "551",
      message: "This account can't receive your message"
    };
    const queue = new FakeQueue();
    const job: DeliveryJob = {
      deliveryId: "campaign-1:user-1:opening",
      campaignId: "campaign-1",
      igUserId: "user-1",
      deliveryType: "opening",
      commentId: "comment-1"
    };

    const disposition = await processDeliveryJob(repo as never, meta as never, job, true, 30, queue as never);

    expect(disposition).toBe("ack");
    expect(repo.failed).toEqual([
      {
        deliveryId: "campaign-1:user-1:opening",
        code: "551",
        message: "This account can't receive your message"
      }
    ]);
    expect(repo.createdDeliveries).toEqual([]);
    expect(queue.sent).toEqual([]);
  });

  it("does not queue a rescue reply for transient opening delivery errors", async () => {
    const repo = new FakeDeliveryRepository();
    repo.campaign = {
      ...baseCampaign,
      openingFailureReplyText: "DM kamu belum bisa kami kirim. Buka izin DM, lalu komen PROMPT lagi."
    };
    const meta = new FakeMetaClient();
    meta.openingResult = {
      ok: false,
      retryable: true,
      code: "429",
      message: "Meta rate limited"
    };
    const queue = new FakeQueue();
    const job: DeliveryJob = {
      deliveryId: "campaign-1:user-1:opening",
      campaignId: "campaign-1",
      igUserId: "user-1",
      deliveryType: "opening",
      commentId: "comment-1"
    };

    const disposition = await processDeliveryJob(repo as never, meta as never, job, true, 30, queue as never);

    expect(disposition).toBe("retry");
    expect(repo.retrying).toEqual([
      {
        deliveryId: "campaign-1:user-1:opening",
        code: "429",
        message: "Meta rate limited"
      }
    ]);
    expect(repo.createdDeliveries).toEqual([]);
    expect(queue.sent).toEqual([]);
  });

  it("queues the configured public rescue reply when Meta says the comment is invalid for private reply", async () => {
    const repo = new FakeDeliveryRepository();
    repo.campaign = {
      ...baseCampaign,
      openingFailureReplyText: "DM belum bisa dikirim. Komen PROMPT lagi sebagai komentar baru."
    };
    const meta = new FakeMetaClient();
    meta.openingResult = {
      ok: false,
      retryable: false,
      code: "100",
      message: "The comment is invalid for a private reply"
    };
    const queue = new FakeQueue();
    const job: DeliveryJob = {
      deliveryId: "campaign-1:user-1:opening",
      campaignId: "campaign-1",
      igUserId: "user-1",
      deliveryType: "opening",
      commentId: "comment-1"
    };

    const disposition = await processDeliveryJob(repo as never, meta as never, job, true, 30, queue as never);

    expect(disposition).toBe("ack");
    expect(repo.failed).toEqual([
      {
        deliveryId: "campaign-1:user-1:opening",
        code: "100",
        message: "The comment is invalid for a private reply"
      }
    ]);
    expect(repo.createdDeliveries).toEqual([
      {
        id: "campaign-1:user-1:opening_failure_reply",
        campaignId: "campaign-1",
        igUserId: "user-1",
        deliveryType: "opening_failure_reply",
        status: "queued"
      }
    ]);
    expect(queue.sent).toEqual([
      {
        deliveryId: "campaign-1:user-1:opening_failure_reply",
        campaignId: "campaign-1",
        igUserId: "user-1",
        deliveryType: "opening_failure_reply",
        commentId: "comment-1"
      }
    ]);
  });

  it("queues the configured public rescue reply when Meta says the private-reply comment id may be invalid", async () => {
    const repo = new FakeDeliveryRepository();
    repo.campaign = {
      ...baseCampaign,
      openingFailureReplyText: "Could not DM you yet. Open message requests, then comment BUS again."
    };
    const meta = new FakeMetaClient();
    meta.openingResult = {
      ok: false,
      retryable: false,
      code: "200",
      message:
        "Please check if access token has enough IG permissions granular scopes for IG private reply. Or verify if the comment id is valid"
    };
    const queue = new FakeQueue();
    const job: DeliveryJob = {
      deliveryId: "campaign-1:user-1:opening",
      campaignId: "campaign-1",
      igUserId: "user-1",
      deliveryType: "opening",
      commentId: "comment-1"
    };

    const disposition = await processDeliveryJob(repo as never, meta as never, job, true, 30, queue as never);

    expect(disposition).toBe("ack");
    expect(repo.failed).toEqual([
      {
        deliveryId: "campaign-1:user-1:opening",
        code: "200",
        message:
          "Please check if access token has enough IG permissions granular scopes for IG private reply. Or verify if the comment id is valid"
      }
    ]);
    expect(repo.createdDeliveries).toEqual([
      {
        id: "campaign-1:user-1:opening_failure_reply",
        campaignId: "campaign-1",
        igUserId: "user-1",
        deliveryType: "opening_failure_reply",
        status: "queued"
      }
    ]);
    expect(queue.sent).toEqual([
      {
        deliveryId: "campaign-1:user-1:opening_failure_reply",
        campaignId: "campaign-1",
        igUserId: "user-1",
        deliveryType: "opening_failure_reply",
        commentId: "comment-1"
      }
    ]);
  });

  it("does not queue a rescue reply for permanent opening errors unrelated to recipient availability", async () => {
    const repo = new FakeDeliveryRepository();
    repo.campaign = {
      ...baseCampaign,
      openingFailureReplyText: "DM kamu belum bisa kami kirim. Buka izin DM, lalu komen PROMPT lagi."
    };
    const meta = new FakeMetaClient();
    meta.openingResult = {
      ok: false,
      retryable: false,
      code: "100",
      message: "Unsupported post request"
    };
    const queue = new FakeQueue();
    const job: DeliveryJob = {
      deliveryId: "campaign-1:user-1:opening",
      campaignId: "campaign-1",
      igUserId: "user-1",
      deliveryType: "opening",
      commentId: "comment-1"
    };

    const disposition = await processDeliveryJob(repo as never, meta as never, job, true, 30, queue as never);

    expect(disposition).toBe("ack");
    expect(repo.failed).toEqual([
      {
        deliveryId: "campaign-1:user-1:opening",
        code: "100",
        message: "Unsupported post request"
      }
    ]);
    expect(repo.createdDeliveries).toEqual([]);
    expect(queue.sent).toEqual([]);
  });

  it("does not duplicate the public rescue reply when that delivery row already exists", async () => {
    const repo = new FakeDeliveryRepository();
    repo.campaign = {
      ...baseCampaign,
      openingFailureReplyText: "DM kamu belum bisa kami kirim. Buka izin DM, lalu komen PROMPT lagi."
    };
    repo.createDeliveryResults = [false];
    const meta = new FakeMetaClient();
    meta.openingResult = {
      ok: false,
      retryable: false,
      code: "551",
      message: "This account can't receive your message because they don't allow new message requests from everyone."
    };
    const queue = new FakeQueue();
    const job: DeliveryJob = {
      deliveryId: "campaign-1:user-1:opening",
      campaignId: "campaign-1",
      igUserId: "user-1",
      deliveryType: "opening",
      commentId: "comment-1"
    };

    const disposition = await processDeliveryJob(repo as never, meta as never, job, true, 30, queue as never);

    expect(disposition).toBe("ack");
    expect(repo.createdDeliveries).toEqual([
      {
        id: "campaign-1:user-1:opening_failure_reply",
        campaignId: "campaign-1",
        igUserId: "user-1",
        deliveryType: "opening_failure_reply",
        status: "queued"
      }
    ]);
    expect(queue.sent).toEqual([]);
  });

  it("sends opening failure rescue replies publicly without sending any DM", async () => {
    const repo = new FakeDeliveryRepository();
    repo.campaign = {
      ...baseCampaign,
      openingFailureReplyText: "DM belum bisa dikirim. Komen PROMPT lagi sebagai komentar baru."
    };
    const meta = new FakeMetaClient();
    const job: DeliveryJob = {
      deliveryId: "campaign-1:user-1:opening_failure_reply",
      campaignId: "campaign-1",
      igUserId: "user-1",
      deliveryType: "opening_failure_reply",
      commentId: "comment-1"
    };

    const disposition = await processDeliveryJob(repo as never, meta as never, job);

    expect(disposition).toBe("ack");
    expect(repo.claims).toEqual(["campaign-1:user-1:opening_failure_reply"]);
    expect(meta.repliedComments).toEqual([
      { commentId: "comment-1", text: "DM belum bisa dikirim. Komen PROMPT lagi sebagai komentar baru." }
    ]);
    expect(meta.sentTexts).toEqual([]);
    expect(meta.buttonMessages).toEqual([]);
    expect(repo.sent).toEqual([
      { deliveryId: "campaign-1:user-1:opening_failure_reply", messageId: "message-1" }
    ]);
    expect(repo.states).toEqual([]);
  });

  it("retries opening failure rescue replies locally without calling Meta when send rate limit is full", async () => {
    const repo = new FakeDeliveryRepository();
    repo.campaign = {
      ...baseCampaign,
      openingFailureReplyText: "DM belum bisa dikirim. Komen PROMPT lagi sebagai komentar baru."
    };
    repo.rateLimitAllowed = false;
    const meta = new FakeMetaClient();
    const job: DeliveryJob = {
      deliveryId: "campaign-1:user-1:opening_failure_reply",
      campaignId: "campaign-1",
      igUserId: "user-1",
      deliveryType: "opening_failure_reply",
      commentId: "comment-1"
    };

    const disposition = await processDeliveryJob(repo as never, meta as never, job);

    expect(disposition).toBe("retry");
    expect(repo.claims).toEqual(["campaign-1:user-1:opening_failure_reply"]);
    expect(meta.repliedComments).toEqual([]);
    expect(repo.retrying).toEqual([
      {
        deliveryId: "campaign-1:user-1:opening_failure_reply",
        code: "local_rate_limited",
        message: "Local outbound Meta send rate limit reached"
      }
    ]);
    expect(repo.sent).toEqual([]);
  });

  it("marks failed public comment replies without sending any DM fallback", async () => {
    const repo = new FakeDeliveryRepository();
    repo.campaign = { ...baseCampaign, commentReplyText: "Cek DM kamu ya" };
    const meta = new FakeMetaClient();
    meta.textResult = {
      ok: false,
      retryable: false,
      code: "10",
      message: "Cannot reply to comment"
    };
    const job: DeliveryJob = {
      deliveryId: "campaign-1:user-1:comment_reply",
      campaignId: "campaign-1",
      igUserId: "user-1",
      deliveryType: "comment_reply",
      commentId: "comment-1"
    };

    const disposition = await processDeliveryJob(repo as never, meta as never, job);

    expect(disposition).toBe("ack");
    expect(repo.failed).toEqual([
      {
        deliveryId: "campaign-1:user-1:comment_reply",
        code: "10",
        message: "Cannot reply to comment"
      }
    ]);
    expect(meta.sentTexts).toEqual([]);
    expect(meta.buttonMessages).toEqual([]);
    expect(repo.sent).toEqual([]);
    expect(repo.states).toEqual([]);
  });

  it("sends configured intermediate DM button steps", async () => {
    const repo = new FakeDeliveryRepository();
    repo.campaign = {
      ...baseCampaign,
      dmSteps: [
        {
          text: "Sebelum gue kirim, pilih gaya dulu.",
          textVariants: ["Sebelum gue kirim, pilih gaya dulu."],
          buttonTitle: "LANJUT"
        },
        {
          text: "Oke, terakhir konfirmasi.",
          textVariants: ["Oke, terakhir konfirmasi."],
          buttonTitle: "AMBIL"
        }
      ]
    };
    const meta = new FakeMetaClient();
    const queue = new FakeQueue();
    const job: DeliveryJob = {
      deliveryId: "campaign-1:user-1:button_step:1",
      campaignId: "campaign-1",
      igUserId: "user-1",
      deliveryType: "button_step",
      stepIndex: 0
    };

    const disposition = await processDeliveryJob(repo as never, meta as never, job, true, 30, queue as never);

    expect(disposition).toBe("ack");
    expect(meta.buttonMessages).toEqual([
      {
        igUserId: "user-1",
        text: "Sebelum gue kirim, pilih gaya dulu.",
        buttonTitle: "LANJUT",
        buttonPayload: "campaign-1:step:2"
      }
    ]);
    expect(repo.sent).toEqual([{ deliveryId: "campaign-1:user-1:button_step:1", messageId: "button-step-1" }]);
    expect(repo.states).toEqual([
      { campaignId: "campaign-1", igUserId: "user-1", state: "button_step:1" }
    ]);
    expect(repo.createdDeliveries).toEqual([]);
    expect(queue.sent).toEqual([]);
  });

  it("selects intermediate DM step variants deterministically per user and step", async () => {
    const variants = [
      "Sebelum gue kirim, pilih gaya dulu.",
      "Pilih gaya dulu sebelum gue kirim promptnya.",
      "Satu tap lagi buat pilih gaya."
    ];
    const job: DeliveryJob = {
      deliveryId: "campaign-1:user-1:button_step:1",
      campaignId: "campaign-1",
      igUserId: "user-1",
      deliveryType: "button_step",
      stepIndex: 0
    };
    const firstRepo = new FakeDeliveryRepository();
    firstRepo.campaign = {
      ...baseCampaign,
      dmSteps: [{ text: variants[0], textVariants: variants, buttonTitle: "LANJUT" }]
    };
    const firstMeta = new FakeMetaClient();

    await processDeliveryJob(firstRepo as never, firstMeta as never, job);

    const secondRepo = new FakeDeliveryRepository();
    secondRepo.campaign = {
      ...baseCampaign,
      dmSteps: [{ text: variants[0], textVariants: variants, buttonTitle: "LANJUT" }]
    };
    const secondMeta = new FakeMetaClient();

    await processDeliveryJob(secondRepo as never, secondMeta as never, job);

    expect(variants).toContain(firstMeta.buttonMessages[0]?.text);
    expect(secondMeta.buttonMessages[0]?.text).toBe(firstMeta.buttonMessages[0]?.text);
  });

  it("acks malformed public comment reply jobs without sending the final prompt", async () => {
    const repo = new FakeDeliveryRepository();
    repo.campaign = { ...baseCampaign, commentReplyText: "Cek DM kamu ya" };
    const meta = new FakeMetaClient();
    const job: DeliveryJob = {
      deliveryId: "campaign-1:user-1:comment_reply",
      campaignId: "campaign-1",
      igUserId: "user-1",
      deliveryType: "comment_reply"
    };

    const disposition = await processDeliveryJob(repo as never, meta as never, job);

    expect(disposition).toBe("ack");
    expect(repo.claims).toEqual([]);
    expect(meta.repliedComments).toEqual([]);
    expect(meta.sentTexts).toEqual([]);
    expect(repo.sent).toEqual([]);
    expect(repo.failed).toEqual([
      {
        deliveryId: "campaign-1:user-1:comment_reply",
        code: "malformed_job",
        message: "Comment reply delivery is missing commentId"
      }
    ]);
  });

  it("acks malformed opening jobs without sending the final prompt", async () => {
    const repo = new FakeDeliveryRepository();
    const meta = new FakeMetaClient();
    const job: DeliveryJob = {
      deliveryId: "campaign-1:user-1:opening",
      campaignId: "campaign-1",
      igUserId: "user-1",
      deliveryType: "opening"
    };

    const disposition = await processDeliveryJob(repo as never, meta as never, job);

    expect(disposition).toBe("ack");
    expect(repo.claims).toEqual([]);
    expect(meta.sentTexts).toEqual([]);
    expect(repo.sent).toEqual([]);
    expect(repo.failed).toEqual([
      {
        deliveryId: "campaign-1:user-1:opening",
        code: "malformed_job",
        message: "Opening delivery is missing commentId"
      }
    ]);
  });

  it("acks unknown delivery types without sending", async () => {
    const repo = new FakeDeliveryRepository();
    const meta = new FakeMetaClient();
    const job = {
      deliveryId: "campaign-1:user-1:unknown",
      campaignId: "campaign-1",
      igUserId: "user-1",
      deliveryType: "unknown"
    } as unknown as DeliveryJob;

    const disposition = await processDeliveryJob(repo as never, meta as never, job);

    expect(disposition).toBe("ack");
    expect(repo.claims).toEqual([]);
    expect(meta.sentTexts).toEqual([]);
    expect(repo.sent).toEqual([]);
    expect(repo.failed).toEqual([
      {
        deliveryId: "campaign-1:user-1:unknown",
        code: "malformed_job",
        message: "Unknown delivery type"
      }
    ]);
  });

  it("acks duplicate queue deliveries without sending when the row was already claimed", async () => {
    const repo = new FakeDeliveryRepository();
    repo.claimAllowed = false;
    const meta = new FakeMetaClient();

    const disposition = await processDeliveryJob(repo as never, meta as never, finalJob);

    expect(disposition).toBe("ack");
    expect(repo.claims).toEqual(["campaign-1:user-1:final"]);
    expect(meta.sentTexts).toEqual([]);
    expect(repo.sent).toEqual([]);
    expect(repo.retrying).toEqual([]);
    expect(repo.failed).toEqual([]);
  });

  it("acks duplicate queue deliveries while another worker is processing the row", async () => {
    const repo = new FakeDeliveryRepository();
    repo.claimAllowed = false;
    repo.claimDeliveryForSend = async (deliveryId: string) => {
      repo.claims.push(deliveryId);
      return "busy";
    };
    const meta = new FakeMetaClient();

    const disposition = await processDeliveryJob(repo as never, meta as never, finalJob);

    expect(disposition).toBe("ack");
    expect(repo.claims).toEqual(["campaign-1:user-1:final"]);
    expect(meta.sentTexts).toEqual([]);
    expect(repo.sent).toEqual([]);
    expect(repo.retrying).toEqual([]);
    expect(repo.failed).toEqual([]);
  });
});
