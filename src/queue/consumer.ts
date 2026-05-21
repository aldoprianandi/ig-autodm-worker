import { Repository, type Campaign } from "../db/repository";
import { isAutomationEnabled, metaSendsPerMinute } from "../config";
import { sentStepState, stepButtonPayload, stepDeliveryType } from "../flows/steps";
import { selectMessageVariant } from "../flows/variants";
import { MetaApiClient, type MetaSendResult } from "../meta/api";
import { redactSensitiveText } from "../security/redaction";
import { getInstagramAccessToken } from "../token/manager";
import type { DeliveryJob, Env } from "../types";

type DeliveryRepository = Pick<
  Repository,
  | "createDelivery"
  | "findCampaignById"
  | "markDeliverySent"
  | "markDeliveryWaitingFollow"
  | "markDeliveryRetrying"
  | "markDeliveryFailed"
  | "claimDeliveryForSend"
  | "upsertContactState"
  | "tryConsumeOutboundRateLimit"
>;

type DeliveryMetaClient = {
  replyToComment(commentId: string, text: string): Promise<MetaSendResult>;
  sendOpening(commentId: string, campaign: Campaign, text?: string): Promise<MetaSendResult>;
  sendButtonMessage(igUserId: string, text: string, buttonTitle: string, buttonPayload: string): Promise<MetaSendResult>;
  sendText(igUserId: string, text: string): Promise<MetaSendResult>;
  getUserProfile(igUserId: string): Promise<{ isUserFollowBusiness: boolean | null }>;
};

type DeliveryQueue = Pick<Queue<DeliveryJob>, "send">;

export type DeliveryDisposition = "ack" | "retry";
const QUEUE_RETRY_DELAY_SECONDS = 60;

export async function processDeliveryBatch(
  batch: MessageBatch<DeliveryJob>,
  env: Env
): Promise<void> {
  const repo = new Repository(env.DB);

  if (!isAutomationEnabled(env)) {
    for (const message of batch.messages) {
      await repo.markDeliveryFailed(
        message.body.deliveryId,
        "automation_disabled",
        "Automation is disabled by AUTOMATION_ENABLED"
      );
      message.ack();
    }

    return;
  }

  const token = await getInstagramAccessToken(env, repo);
  const meta = new MetaApiClient(env.INSTAGRAM_ACCOUNT_ID, token);
  const outboundLimit = metaSendsPerMinute(env);

  for (const message of batch.messages) {
    const disposition = await processDeliveryJob(repo, meta, message.body, true, outboundLimit, env.DELIVERY_QUEUE);

    if (disposition === "ack") {
      message.ack();
    } else {
      message.retry({ delaySeconds: QUEUE_RETRY_DELAY_SECONDS });
    }
  }
}

export async function processDeliveryJob(
  repo: DeliveryRepository,
  meta: DeliveryMetaClient,
  job: DeliveryJob,
  automationEnabled = true,
  outboundLimit = 30,
  queue?: DeliveryQueue
): Promise<DeliveryDisposition> {
  if (!automationEnabled) {
    await repo.markDeliveryFailed(job.deliveryId, "automation_disabled", "Automation is disabled by AUTOMATION_ENABLED");
    return "ack";
  }

  const campaign = await repo.findCampaignById(job.campaignId);

  if (!campaign?.enabled) return "ack";

  if (job.deliveryType === "opening") {
    if (!job.commentId) {
      await repo.markDeliveryFailed(job.deliveryId, "malformed_job", "Opening delivery is missing commentId");
      return "ack";
    }
    const commentId = job.commentId;
    const claim = await claimDelivery(repo, job.deliveryId);
    if (claim) return claim;
    const outboundDisposition = await ensureOutboundSendAllowed(repo, job, outboundLimit);
    if (outboundDisposition) return outboundDisposition;
    const openingText = selectMessageVariant(
      campaign.openingText,
      campaign.openingTextVariants,
      `${job.campaignId}:${job.igUserId}:${commentId}:opening`
    );
    if (!openingText) {
      await repo.markDeliveryFailed(job.deliveryId, "malformed_campaign", "Opening delivery text is missing");
      return "ack";
    }
    const result = await runRetryableMetaCall(repo, job, () => meta.sendOpening(commentId, campaign, openingText));
    if (isDeliveryDisposition(result)) return result;
    return handleOpeningSendResult(repo, job, result, commentId, campaign, queue);
  }

  if (job.deliveryType === "comment_reply" || job.deliveryType === "opening_failure_reply") {
    if (!job.commentId) {
      await repo.markDeliveryFailed(job.deliveryId, "malformed_job", "Comment reply delivery is missing commentId");
      return "ack";
    }
    const commentId = job.commentId;
    const commentReplyText = publicReplyTextForJob(campaign, job);
    if (!commentReplyText) return "ack";
    const claim = await claimDelivery(repo, job.deliveryId);
    if (claim) return claim;
    const outboundDisposition = await ensureOutboundSendAllowed(repo, job, outboundLimit);
    if (outboundDisposition) return outboundDisposition;
    const result = await runRetryableMetaCall(repo, job, () => meta.replyToComment(commentId, commentReplyText));
    if (isDeliveryDisposition(result)) return result;
    return handleSendResult(repo, job, result);
  }

  if (job.deliveryType === "button_step") {
    const stepIndex = job.stepIndex;
    if (typeof stepIndex !== "number" || !Number.isInteger(stepIndex) || stepIndex < 0) {
      await repo.markDeliveryFailed(job.deliveryId, "malformed_job", "Button step delivery is missing stepIndex");
      return "ack";
    }
    const step = campaign.dmSteps[stepIndex];
    if (!step) {
      await repo.markDeliveryFailed(job.deliveryId, "malformed_campaign", "Button step is missing from campaign");
      return "ack";
    }
    const claim = await claimDelivery(repo, job.deliveryId);
    if (claim) return claim;
    const outboundDisposition = await ensureOutboundSendAllowed(repo, job, outboundLimit);
    if (outboundDisposition) return outboundDisposition;
    const stepText = selectMessageVariant(
      step.text,
      step.textVariants,
      `${job.campaignId}:${job.igUserId}:button_step:${stepIndex + 1}`
    );
    if (!stepText) {
      await repo.markDeliveryFailed(job.deliveryId, "malformed_campaign", "Button step text is missing");
      return "ack";
    }
    const result = await runRetryableMetaCall(repo, job, () =>
      meta.sendButtonMessage(
        job.igUserId,
        stepText,
        step.buttonTitle,
        stepButtonPayload(campaign, stepIndex)
      )
    );
    if (isDeliveryDisposition(result)) return result;
    return handleButtonStepSendResult(repo, job, result, campaign, stepIndex, queue);
  }

  if (job.deliveryType !== "final") {
    await repo.markDeliveryFailed(job.deliveryId, "malformed_job", "Unknown delivery type");
    return "ack";
  }

  const claim = await claimDelivery(repo, job.deliveryId);
  if (claim) return claim;

  if (job.deliveryType === "final" && campaign.followGateEnabled) {
    const readAllowed = await repo.tryConsumeOutboundRateLimit("instagram_read", Math.max(outboundLimit, 30), 60);
    if (!readAllowed) {
      return markDeliveryRetrying(
        repo,
        job,
        "local_read_rate_limited",
        "Local Meta read rate limit reached"
      );
    }

    const profile = await runRetryableMetaCall(repo, job, () => meta.getUserProfile(job.igUserId));
    if (isDeliveryDisposition(profile)) return profile;

    if (profile.isUserFollowBusiness === null) {
      return markDeliveryRetrying(
        repo,
        job,
        "follow_status_unknown",
        "Could not verify follow status before final delivery"
      );
    }

    if (profile.isUserFollowBusiness !== true) {
      const outboundDisposition = await ensureOutboundSendAllowed(repo, job, outboundLimit);
      if (outboundDisposition) return outboundDisposition;
      const result = await runRetryableMetaCall(repo, job, () =>
        meta.sendButtonMessage(
          job.igUserId,
          followGateInstruction(followGateButtonTitle(campaign), campaign.followGateText),
          followGateButtonTitle(campaign),
          campaign.buttonPayload
        )
      );
      if (isDeliveryDisposition(result)) return result;

      if (!result.ok) {
        return handleSendResult(repo, job, result);
      }

      await repo.markDeliveryWaitingFollow(job.deliveryId, result.messageId);
      await repo.upsertContactState({
        campaignId: job.campaignId,
        igUserId: job.igUserId,
        state: "follow_requested"
      });

      return "ack";
    }
  }

  const outboundDisposition = await ensureOutboundSendAllowed(repo, job, outboundLimit);
  if (outboundDisposition) return outboundDisposition;
  const result = await runRetryableMetaCall(repo, job, () => meta.sendText(job.igUserId, campaign.deliveryText));
  if (isDeliveryDisposition(result)) return result;
  return handleSendResult(repo, job, result, "delivered");
}

async function runRetryableMetaCall<T>(
  repo: DeliveryRepository,
  job: DeliveryJob,
  operation: () => Promise<T>
): Promise<T | DeliveryDisposition> {
  try {
    return await operation();
  } catch (error) {
    return markDeliveryRetrying(repo, job, "delivery_exception", unexpectedDeliveryErrorMessage(error));
  }
}

function isDeliveryDisposition(value: unknown): value is DeliveryDisposition {
  return value === "ack" || value === "retry";
}

function unexpectedDeliveryErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return `Unexpected delivery error: ${redactSensitiveText(message)}`;
}

function followGateInstruction(buttonTitle: string, customText?: string | null): string {
  const normalizedCustom = customText?.trim();
  if (normalizedCustom) return normalizedCustom;

  const title = buttonTitle.trim() || "tombol tadi";
  return `Follow dulu akun ini, lalu tap ${title} lagi. Kalau tombolnya gak muncul, balas READY.`;
}

function followGateButtonTitle(campaign: { buttonTitle: string; followGateButtonTitle?: string | null }): string {
  return campaign.followGateButtonTitle?.trim() || campaign.buttonTitle;
}

async function claimDelivery(
  repo: DeliveryRepository,
  deliveryId: string
): Promise<DeliveryDisposition | null> {
  const result = await repo.claimDeliveryForSend(deliveryId);
  if (result === "claimed") return null;
  if (result === "busy") return "ack";
  return "ack";
}

async function ensureOutboundSendAllowed(
  repo: DeliveryRepository,
  job: DeliveryJob,
  outboundLimit: number
): Promise<DeliveryDisposition | null> {
  const allowed = await repo.tryConsumeOutboundRateLimit("instagram_send", outboundLimit, 60);
  if (allowed) return null;

  return markDeliveryRetrying(
    repo,
    job,
    "local_rate_limited",
    "Local outbound Meta send rate limit reached"
  );
}

async function markDeliveryRetrying(
  repo: DeliveryRepository,
  job: DeliveryJob,
  code: string,
  message: string
): Promise<DeliveryDisposition> {
  const retrying = await repo.markDeliveryRetrying(job.deliveryId, code, message);
  return retrying === false ? "ack" : "retry";
}

async function handleSendResult(
  repo: DeliveryRepository,
  job: DeliveryJob,
  result: MetaSendResult,
  successState?: string
): Promise<DeliveryDisposition> {
  if (result.ok) {
    await repo.markDeliverySent(job.deliveryId, result.messageId);

    if (successState) {
      await repo.upsertContactState({
        campaignId: job.campaignId,
        igUserId: job.igUserId,
        state: successState
      });
    }

    return "ack";
  }

  if (result.retryable) {
    return markDeliveryRetrying(repo, job, result.code, result.message);
  }

  await repo.markDeliveryFailed(job.deliveryId, result.code, result.message);
  return "ack";
}

async function handleOpeningSendResult(
  repo: DeliveryRepository,
  job: DeliveryJob,
  result: MetaSendResult,
  commentId: string,
  campaign: Campaign,
  queue?: DeliveryQueue
): Promise<DeliveryDisposition> {
  if (!result.ok) {
    const disposition = await handleSendResult(repo, job, result, "commented");
    if (disposition === "ack") {
      await queueOpeningFailureReply(repo, queue, job, result, campaign, commentId);
    }
    return disposition;
  }

  await repo.markDeliverySent(job.deliveryId, result.messageId);
  await repo.upsertContactState({
    campaignId: job.campaignId,
    igUserId: job.igUserId,
    state: "commented"
  });

  if (queue && campaign.commentReplyText?.trim()) {
    const deliveryId = `${job.campaignId}:${job.igUserId}:comment_reply`;
    const created = await repo.createDelivery({
      id: deliveryId,
      campaignId: job.campaignId,
      igUserId: job.igUserId,
      deliveryType: "comment_reply",
      status: "queued"
    });

    if (created) {
      await queue.send({
        deliveryId,
        campaignId: job.campaignId,
        igUserId: job.igUserId,
        deliveryType: "comment_reply",
        commentId
      });
    }
  }

  return "ack";
}

async function handleButtonStepSendResult(
  repo: DeliveryRepository,
  job: DeliveryJob,
  result: MetaSendResult,
  campaign: Campaign,
  stepIndex: number,
  queue?: DeliveryQueue
): Promise<DeliveryDisposition> {
  if (!result.ok) return handleSendResult(repo, job, result, sentStepState(stepIndex));

  await repo.markDeliverySent(job.deliveryId, result.messageId);
  await repo.upsertContactState({
    campaignId: job.campaignId,
    igUserId: job.igUserId,
    state: sentStepState(stepIndex)
  });

  void campaign;
  void queue;

  return "ack";
}

async function queueButtonStep(
  repo: DeliveryRepository,
  queue: DeliveryQueue,
  campaignId: string,
  igUserId: string,
  stepIndex: number
): Promise<void> {
  const deliveryType = stepDeliveryType(stepIndex);
  const deliveryId = `${campaignId}:${igUserId}:${deliveryType}`;
  const created = await repo.createDelivery({
    id: deliveryId,
    campaignId,
    igUserId,
    deliveryType,
    status: "queued"
  });

  if (!created) return;

  await queue.send({
    deliveryId,
    campaignId,
    igUserId,
    deliveryType: "button_step",
    stepIndex
  });
}

function publicReplyTextForJob(campaign: Campaign, job: DeliveryJob): string | null {
  if (job.deliveryType === "opening_failure_reply") {
    return campaign.openingFailureReplyText?.trim() || null;
  }

  return selectMessageVariant(
    campaign.commentReplyText,
    campaign.commentReplyTextVariants,
    `${job.campaignId}:${job.igUserId}:${job.commentId}:comment_reply`
  );
}

async function queueOpeningFailureReply(
  repo: DeliveryRepository,
  queue: DeliveryQueue | undefined,
  job: DeliveryJob,
  result: Extract<MetaSendResult, { ok: false }>,
  campaign: Campaign,
  commentId: string
): Promise<void> {
  if (!queue || !campaign.openingFailureReplyText?.trim()) return;
  if (!isRecipientUnavailableError(result)) return;

  const deliveryId = `${job.campaignId}:${job.igUserId}:opening_failure_reply`;
  const created = await repo.createDelivery({
    id: deliveryId,
    campaignId: job.campaignId,
    igUserId: job.igUserId,
    deliveryType: "opening_failure_reply",
    status: "queued"
  });

  if (!created) return;

  await queue.send({
    deliveryId,
    campaignId: job.campaignId,
    igUserId: job.igUserId,
    deliveryType: "opening_failure_reply",
    commentId
  });
}

function isRecipientUnavailableError(result: Extract<MetaSendResult, { ok: false }>): boolean {
  const normalized = result.message.toLowerCase();
  return (
    result.code === "551" ||
    normalized.includes("cannot receive messages") ||
    normalized.includes("can't receive messages") ||
    normalized.includes("isn't receiving messages") ||
    normalized.includes("is not receiving messages") ||
    normalized.includes("not receiving messages") ||
    normalized.includes("isn't available right now") ||
    normalized.includes("is not available right now") ||
    normalized.includes("invalid for a private reply") ||
    (normalized.includes("private reply") && normalized.includes("comment id"))
  );
}
