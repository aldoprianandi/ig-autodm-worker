import type { DeliveryJob, NormalizedEvent } from "../types";
import { Repository, type Campaign } from "../db/repository";
import { isOpeningRetryComment } from "./opening-retry";
import { resolvePayloadAdvance, resolveTextAdvance, stepDeliveryType, type ButtonAdvance } from "./steps";

async function sha256Hex(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

const PRIVATE_REPLY_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export class FlowRouter {
  constructor(
    private readonly repo: Repository,
    private readonly queue: Queue<DeliveryJob>,
    private readonly automationEnabled = true,
    private readonly ignoredCommenterIgUserId?: string
  ) {}

  async handleEvent(event: NormalizedEvent, rawBody: string): Promise<void> {
    const inserted = await this.repo.insertWebhookEvent({
      eventId: event.eventId,
      eventType: event.type,
      igUserId: event.igUserId,
      rawHash: await sha256Hex(rawBody)
    });

    if (!inserted) return;
    if (!this.automationEnabled) return;

    if (event.type === "comment.created") {
      await this.handleComment(event);
      return;
    }

    if (event.type === "message.postback") {
      await this.handlePostback(event);
      return;
    }

    if (event.type === "message.text") {
      if (await this.handleReadyText(event)) return;
      await this.handleButtonText(event);
    }
  }

  private async handleComment(
    event: Extract<NormalizedEvent, { type: "comment.created" }>
  ): Promise<void> {
    if (this.ignoredCommenterIgUserId && event.igUserId === this.ignoredCommenterIgUserId) return;
    if (!isInsidePrivateReplyWindow(event.createdAt)) return;

    const campaign =
      (await this.repo.findCampaignForComment(event.mediaId, event.text)) ??
      (await this.findOpeningRetryCampaign(event));
    if (!campaign) return;

    await this.repo.setWebhookEventCampaign(event.eventId, campaign.id);

    const previousState = await this.repo.findContactState(campaign.id, event.igUserId);
    const isManualOpeningRetry =
      previousState?.state === "commented" && previousState.lastCommentId !== event.commentId;

    const deliveryId = `${campaign.id}:${event.igUserId}:opening`;
    const created = await this.repo.createDelivery({
      id: deliveryId,
      campaignId: campaign.id,
      igUserId: event.igUserId,
      deliveryType: "opening",
      status: "queued"
    });

    const shouldQueue =
      created ||
      (await this.repo.requeueFailedOpeningDelivery(deliveryId)) ||
      (isManualOpeningRetry && (await this.repo.requeueSentOpeningDelivery(deliveryId)));

    if (shouldQueue) {
      await this.repo.upsertContactState({
        campaignId: campaign.id,
        igUserId: event.igUserId,
        username: event.username,
        state: "commented",
        commentId: event.commentId
      });
      await this.queue.send({
        deliveryId,
        campaignId: campaign.id,
        igUserId: event.igUserId,
        deliveryType: "opening",
        commentId: event.commentId
      });
    }
  }

  private async findOpeningRetryCampaign(
    event: Extract<NormalizedEvent, { type: "comment.created" }>
  ): Promise<Campaign | null> {
    if (!isOpeningRetryComment(event.text)) return null;

    const campaigns = await this.repo.listCommentedCampaignsForUserOnMedia(event.mediaId, event.igUserId);
    return campaigns[0] ?? null;
  }

  private async handlePostback(
    event: Extract<NormalizedEvent, { type: "message.postback" }>
  ): Promise<void> {
    const [campaignId] = event.payload.split(":");
    if (!campaignId) return;

    const campaign = await this.repo.findCampaignById(campaignId);
    if (!campaign?.enabled) return;

    const state = await this.repo.findLatestContactState(event.igUserId);
    if (state && state.campaignId !== campaignId) return;

    const stateName = state?.state ?? recoverMissingStateForOneButtonPostback(campaign, event.payload);
    if (!stateName) return;

    const advance = resolvePayloadAdvance(campaign, stateName, event.payload);
    if (!advance) return;

    await this.repo.setWebhookEventCampaign(event.eventId, campaignId);
    await this.queueButtonAdvance(campaignId, event.igUserId, advance, event.eventId);
  }

  private async handleButtonText(
    event: Extract<NormalizedEvent, { type: "message.text" }>
  ): Promise<void> {
    const state = await this.repo.findLatestContactState(event.igUserId);
    if (!state) return;

    const campaign = await this.repo.findCampaignById(state.campaignId);
    if (!campaign?.enabled) return;

    const advance = resolveTextAdvance(campaign, state.state, event.text);
    if (!advance) return;

    await this.repo.setWebhookEventCampaign(event.eventId, state.campaignId);
    await this.queueButtonAdvance(state.campaignId, event.igUserId, advance, event.eventId);
  }

  private async queueButtonAdvance(
    campaignId: string,
    igUserId: string,
    advance: ButtonAdvance,
    messageId?: string
  ): Promise<void> {
    if (advance.type === "step") {
      const stepNumber = advance.stepIndex + 1;
      const deliveryId = `${campaignId}:${igUserId}:button_step:${stepNumber}`;
      const created = await this.repo.createDelivery({
        id: deliveryId,
        campaignId,
        igUserId,
        deliveryType: stepDeliveryType(advance.stepIndex),
        status: "queued"
      });

      if (created) {
        await this.queue.send({
          deliveryId,
          campaignId,
          igUserId,
          deliveryType: "button_step",
          stepIndex: advance.stepIndex
        });
      }
      return;
    }

    await this.repo.upsertContactState({
      campaignId,
      igUserId,
      state: "confirmed",
      messageId
    });
    const deliveryId = `${campaignId}:${igUserId}:final`;
    const created = await this.repo.createDelivery({
      id: deliveryId,
      campaignId,
      igUserId,
      deliveryType: "final",
      status: "queued"
    });

    const shouldQueue =
      created ||
      (await this.repo.requeueWaitingFollowDelivery(deliveryId)) ||
      (await this.repo.requeueInteractiveDelivery(deliveryId));

    if (shouldQueue) {
      await this.queue.send({
        deliveryId,
        campaignId,
        igUserId,
        deliveryType: "final"
      });
    }
  }

  private async handleReadyText(
    event: Extract<NormalizedEvent, { type: "message.text" }>
  ): Promise<boolean> {
    if (event.text.trim().toLowerCase() !== "ready") return false;

    const state = await this.repo.findLatestContactState(event.igUserId);
    if (!state || state.state !== "follow_requested") return false;

    const campaign = await this.repo.findCampaignById(state.campaignId);
    if (!campaign?.enabled) return false;

    await this.repo.setWebhookEventCampaign(event.eventId, state.campaignId);

    const deliveryId = `${state.campaignId}:${event.igUserId}:final`;
    const requeued = await this.repo.requeueWaitingFollowDelivery(deliveryId);
    if (!requeued) {
      const created = await this.repo.createDelivery({
        id: deliveryId,
        campaignId: state.campaignId,
        igUserId: event.igUserId,
        deliveryType: "final",
        status: "queued"
      });
      if (!created) return true;
    }

    await this.queue.send({
      deliveryId,
      campaignId: state.campaignId,
      igUserId: event.igUserId,
      deliveryType: "final"
    });
    return true;
  }
}

function isInsidePrivateReplyWindow(createdAt: string | undefined): boolean {
  if (!createdAt) return true;

  const timestampMs = Date.parse(createdAt);
  if (!Number.isFinite(timestampMs)) return false;

  return Date.now() - timestampMs <= PRIVATE_REPLY_WINDOW_MS;
}

function recoverMissingStateForOneButtonPostback(campaign: Campaign, payload: string): string | null {
  if (campaign.dmSteps.length) return null;
  return payload === campaign.buttonPayload ? "commented" : null;
}
