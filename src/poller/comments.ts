import { autoFinalAfterOpeningEnabled, isAutomationEnabled } from "../config";
import { Repository, type Campaign } from "../db/repository";
import { commentMatchesKeyword } from "../flows/keyword";
import { isOpeningRetryComment } from "../flows/opening-retry";
import { FlowRouter } from "../flows/router";
import { MetaApiClient, type MetaComment } from "../meta/api";
import { getInstagramAccessToken } from "../token/manager";
import type { DeliveryJob, Env, PollResult } from "../types";

type PollRepository = Partial<Pick<Repository, "listCampaigns" | "listEnabledCampaigns">>;
type PollMetaClient = Pick<MetaApiClient, "listMediaComments">;
type PollRouter = Pick<FlowRouter, "handleEvent">;
type OpeningFinalDeliveryRepository = Pick<Repository, "listOpeningSentWithoutFinal" | "createDelivery">;
type LastStepFinalDeliveryRepository = Pick<Repository, "listLastStepSentWithoutFinal" | "createDelivery">;
type CommentReplyRepository = Pick<Repository, "listOpeningSentWithoutCommentReply" | "createDelivery">;

export const POLL_LIMIT_PER_MEDIA = 25;
const PRIVATE_REPLY_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export async function pollCampaignComments(env: Env): Promise<PollResult> {
  if (!isAutomationEnabled(env)) {
    return { campaignsChecked: 0, commentsSeen: 0, eventsSubmitted: 0, commentRepliesQueued: 0, finalDeliveriesQueued: 0 };
  }

  const repo = new Repository(env.DB);
  const token = await getInstagramAccessToken(env, repo);
  const meta = new MetaApiClient(env.INSTAGRAM_ACCOUNT_ID, token);
  const router = new FlowRouter(repo, env.DELIVERY_QUEUE, true, env.INSTAGRAM_ACCOUNT_ID);

  const result = await pollCampaignCommentsWith(repo, meta, router);
  const commentRepliesQueued = await queueCommentRepliesAfterOpening(repo, env.DELIVERY_QUEUE);
  const openingFinalDeliveriesQueued = autoFinalAfterOpeningEnabled(env)
    ? await queueFinalDeliveriesAfterOpening(repo, env.DELIVERY_QUEUE)
    : 0;
  const lastStepFinalDeliveriesQueued = await queueFinalDeliveriesAfterLastStep(repo, env.DELIVERY_QUEUE);
  const finalDeliveriesQueued = openingFinalDeliveriesQueued + lastStepFinalDeliveriesQueued;
  return { ...result, commentRepliesQueued, finalDeliveriesQueued };
}

export async function pollCampaignCommentsWith(
  repo: PollRepository,
  meta: PollMetaClient,
  router: PollRouter
): Promise<PollResult> {
  const campaigns = await listEnabledCampaigns(repo);
  const campaignsByMedia = groupCampaignsByMedia(campaigns);
  let commentsSeen = 0;
  let eventsSubmitted = 0;

  for (const [mediaId, mediaCampaigns] of campaignsByMedia) {
    const comments = await meta.listMediaComments(mediaId, POLL_LIMIT_PER_MEDIA);
    commentsSeen += comments.length;

    for (const comment of comments) {
      if (!isInsidePrivateReplyWindow(comment)) continue;
      const campaign = routeableCampaignForComment(comment, mediaCampaigns);
      if (!campaign) continue;
      if (!comment.userId) continue;

      await router.handleEvent(
        {
          type: "comment.created",
          eventId: `comment:${comment.id}`,
          commentId: comment.id,
          mediaId,
          igUserId: comment.userId,
          username: comment.username,
          text: comment.text
        },
        JSON.stringify({ source: "comment-poller", campaignId: campaign.id, comment })
      );
      eventsSubmitted += 1;
    }
  }

  return { campaignsChecked: campaigns.length, commentsSeen, eventsSubmitted, commentRepliesQueued: 0, finalDeliveriesQueued: 0 };
}

export async function queueCommentRepliesAfterOpening(
  repo: CommentReplyRepository,
  queue: Queue<DeliveryJob>
): Promise<number> {
  const candidates = await repo.listOpeningSentWithoutCommentReply();
  let queued = 0;

  for (const candidate of candidates) {
    const deliveryId = `${candidate.campaignId}:${candidate.igUserId}:comment_reply`;
    const created = await repo.createDelivery({
      id: deliveryId,
      campaignId: candidate.campaignId,
      igUserId: candidate.igUserId,
      deliveryType: "comment_reply",
      status: "queued"
    });

    if (!created) continue;

    await queue.send({
      deliveryId,
      campaignId: candidate.campaignId,
      igUserId: candidate.igUserId,
      deliveryType: "comment_reply",
      commentId: candidate.commentId
    });
    queued += 1;
  }

  return queued;
}

export async function queueFinalDeliveriesAfterOpening(
  repo: OpeningFinalDeliveryRepository,
  queue: Queue<DeliveryJob>
): Promise<number> {
  return queueFinalDeliveries(await repo.listOpeningSentWithoutFinal(), repo, queue);
}

export async function queueFinalDeliveriesAfterLastStep(
  repo: LastStepFinalDeliveryRepository,
  queue: Queue<DeliveryJob>
): Promise<number> {
  void repo;
  void queue;
  return 0;
}

async function queueFinalDeliveries(
  candidates: Array<{ campaignId: string; igUserId: string }>,
  repo: { createDelivery(input: { id: string; campaignId: string; igUserId: string; deliveryType: "final"; status: "queued" }): Promise<boolean> },
  queue: Queue<DeliveryJob>
): Promise<number> {
  let queued = 0;

  for (const candidate of candidates) {
    const deliveryId = `${candidate.campaignId}:${candidate.igUserId}:final`;
    const created = await repo.createDelivery({
      id: deliveryId,
      campaignId: candidate.campaignId,
      igUserId: candidate.igUserId,
      deliveryType: "final",
      status: "queued"
    });

    if (!created) continue;

    await queue.send({
      deliveryId,
      campaignId: candidate.campaignId,
      igUserId: candidate.igUserId,
      deliveryType: "final"
    });
    queued += 1;
  }

  return queued;
}

function commentMatchesCampaign(comment: MetaComment, campaign: Campaign): boolean {
  return commentMatchesKeyword(comment.text, campaign.keyword);
}

function routeableCampaignForComment(comment: MetaComment, campaigns: Campaign[]): Campaign | null {
  return (
    campaigns.find((candidate) => commentMatchesCampaign(comment, candidate)) ??
    (isOpeningRetryComment(comment.text) ? campaigns[0] ?? null : null)
  );
}

async function listEnabledCampaigns(repo: PollRepository): Promise<Campaign[]> {
  if (repo.listEnabledCampaigns) {
    return repo.listEnabledCampaigns();
  }

  if (repo.listCampaigns) {
    return (await repo.listCampaigns()).filter((campaign) => campaign.enabled);
  }

  return [];
}

function groupCampaignsByMedia(campaigns: Campaign[]): Map<string, Campaign[]> {
  const groups = new Map<string, Campaign[]>();
  for (const campaign of campaigns) {
    const group = groups.get(campaign.mediaId) ?? [];
    group.push(campaign);
    groups.set(campaign.mediaId, group);
  }
  return groups;
}

function isInsidePrivateReplyWindow(comment: MetaComment): boolean {
  if (!comment.timestamp) return true;

  const timestampMs = Date.parse(comment.timestamp);
  if (!Number.isFinite(timestampMs)) return true;

  return Date.now() - timestampMs <= PRIVATE_REPLY_WINDOW_MS;
}
