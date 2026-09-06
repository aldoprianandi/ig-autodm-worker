import { commentMatchesKeyword } from "../flows/keyword";

export type Campaign = {
  id: string;
  name: string;
  mediaId: string;
  keyword: string;
  openingText: string;
  openingTextVariants: string[];
  buttonTitle: string;
  buttonPayload: string;
  dmSteps: DmStep[];
  deliveryText: string;
  commentReplyText?: string | null;
  commentReplyTextVariants: string[];
  openingFailureReplyText?: string | null;
  followGateEnabled: boolean;
  followGateText?: string | null;
  followGateButtonTitle?: string | null;
  enabled: boolean;
};

export type DmStep = {
  text: string;
  textVariants: string[];
  buttonTitle: string;
};

export type MessageVariantKind = "opening" | "comment_reply";

export type MessageVariantTemplate = {
  id: string;
  kind: MessageVariantKind;
  text: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ContactState = {
  campaignId: string;
  igUserId: string;
  state: string;
  lastCommentId?: string | null;
};

export type AdminAuditLog = {
  id: string;
  actorKeyHash: string;
  method: string;
  path: string;
  action: string;
  status: number;
  createdAt: string;
};

export type AdminSession = {
  idHash: string;
  csrfHash: string;
  actorKeyHash: string;
  userAgentHash: string;
  expiresAt: string;
  revokedAt: string | null;
};

export type FinalDeliveryCandidate = {
  campaignId: string;
  igUserId: string;
};

export type CommentReplyCandidate = {
  campaignId: string;
  igUserId: string;
  commentId: string;
};

export type DeliveryClaimResult = "claimed" | "busy" | "skip";

export type RecoverableDelivery = {
  deliveryId: string;
  campaignId: string;
  igUserId: string;
  deliveryType: "opening" | "comment_reply" | "opening_failure_reply" | "button_step" | "final";
  commentId?: string;
  stepIndex?: number;
};

export type InstagramTokenState = {
  encryptedToken: string;
  iv: string;
  expiresAt: string;
  refreshedAt: string | null;
  refreshAfter: string | null;
  lastError: string | null;
};

export type CleanupCounts = {
  webhookEvents: number;
  deliveries: number;
  contactStates: number;
  adminRateLimits: number;
  adminSessions: number;
  adminAuditLogs: number;
  operationalEvents: number;
  dataDeletionRequests: number;
  outboundRateLimits: number;
};

export type CampaignDeleteCounts = {
  campaign: number;
  contactStates: number;
  deliveries: number;
  webhookEvents: number;
};

export type UserDataDeleteCounts = {
  adminAuditLogs: number;
  contactStates: number;
  deliveries: number;
  operationalEvents: number;
  webhookEvents: number;
};

export type DataDeletionRequestClaim =
  | { status: "claimed" }
  | { status: "completed"; confirmationCode: string | null }
  | { status: "processing" };

export type OperationalDashboard = {
  counts: {
    campaigns: number;
    enabledCampaigns: number;
    contactStates: number;
    webhookEvents: number;
    deliveries: number;
    failedDeliveries: number;
    retryingDeliveries: number;
    sendStatusUnknownDeliveries: number;
  };
  token: InstagramTokenState | null;
};

const CLEANUP_BATCH_LIMIT = 500;
const QUEUE_RECOVERY_STALE_MS = 2 * 60 * 1000;
const PROCESSING_RECOVERY_STALE_MS = 5 * 60 * 1000;
const DATA_DELETION_PROCESSING_STALE_MS = 10 * 60 * 1000;
const CLEANUP_TARGETS = {
  webhookEvents: {
    sql: "DELETE FROM webhook_events WHERE rowid IN (SELECT rowid FROM webhook_events WHERE processed_at < ?1 LIMIT ?2)"
  },
  deliveries: {
    sql: "DELETE FROM deliveries WHERE rowid IN (SELECT rowid FROM deliveries WHERE created_at < ?1 LIMIT ?2)"
  },
  contactStates: {
    sql: "DELETE FROM contact_states WHERE rowid IN (SELECT rowid FROM contact_states WHERE updated_at < ?1 LIMIT ?2)"
  },
  adminRateLimits: {
    sql: "DELETE FROM admin_rate_limits WHERE rowid IN (SELECT rowid FROM admin_rate_limits WHERE window_start < ?1 LIMIT ?2)"
  },
  adminSessions: {
    sql: "DELETE FROM admin_sessions WHERE rowid IN (SELECT rowid FROM admin_sessions WHERE expires_at < ?1 OR revoked_at IS NOT NULL LIMIT ?2)"
  },
  adminAuditLogs: {
    sql: "DELETE FROM admin_audit_logs WHERE rowid IN (SELECT rowid FROM admin_audit_logs WHERE created_at < ?1 LIMIT ?2)"
  },
  operationalEvents: {
    sql: "DELETE FROM operational_events WHERE rowid IN (SELECT rowid FROM operational_events WHERE created_at < ?1 LIMIT ?2)"
  },
  dataDeletionRequests: {
    sql: "DELETE FROM data_deletion_requests WHERE rowid IN (SELECT rowid FROM data_deletion_requests WHERE created_at < ?1 LIMIT ?2)"
  },
  outboundRateLimits: {
    sql: "DELETE FROM outbound_rate_limits WHERE rowid IN (SELECT rowid FROM outbound_rate_limits WHERE window_start < ?1 LIMIT ?2)"
  }
} as const;

type CleanupTarget = keyof typeof CLEANUP_TARGETS;
const MAX_DELIVERY_ATTEMPTS = 5;

export class Repository {
  constructor(private readonly db: D1Database) {}

  async listCampaigns(): Promise<Campaign[]> {
    const rows = await this.db
      .prepare("SELECT * FROM campaigns ORDER BY created_at DESC")
      .all<Record<string, unknown>>();
    return rows.results.map(mapCampaign);
  }

  async listEnabledCampaigns(): Promise<Campaign[]> {
    const rows = await this.db
      .prepare("SELECT * FROM campaigns WHERE enabled = 1 ORDER BY created_at DESC")
      .all<Record<string, unknown>>();
    return rows.results.map(mapCampaign);
  }

  async findCampaignById(id: string): Promise<Campaign | null> {
    const row = await this.db
      .prepare("SELECT * FROM campaigns WHERE id = ?1")
      .bind(id)
      .first<Record<string, unknown>>();
    return row ? mapCampaign(row) : null;
  }

  async findCampaignForComment(mediaId: string, text: string): Promise<Campaign | null> {
    const rows = await this.db
      .prepare("SELECT * FROM campaigns WHERE media_id = ?1 AND enabled = 1")
      .bind(mediaId)
      .all<Record<string, unknown>>();

    const match = rows.results.find((row) => commentMatchesKeyword(text, String(row.keyword)));

    return match ? mapCampaign(match) : null;
  }

  async listCommentedCampaignsForUserOnMedia(mediaId: string, igUserId: string): Promise<Campaign[]> {
    const rows = await this.db
      .prepare(
        `SELECT campaigns.*
        FROM campaigns
        JOIN contact_states
          ON contact_states.campaign_id = campaigns.id
         AND contact_states.ig_user_id = ?2
         AND contact_states.state = 'commented'
        WHERE campaigns.media_id = ?1
          AND campaigns.enabled = 1
        ORDER BY contact_states.updated_at DESC`
      )
      .bind(mediaId, igUserId)
      .all<Record<string, unknown>>();

    return rows.results.map(mapCampaign);
  }

  async upsertCampaign(campaign: Campaign): Promise<void> {
    const now = new Date().toISOString();
    await this.db
      .prepare(
        `INSERT INTO campaigns
        (id, name, media_id, keyword, opening_text, opening_text_variants, button_title, button_payload, dm_steps, delivery_text, comment_reply_text, comment_reply_text_variants, opening_failure_reply_text, follow_gate_enabled, follow_gate_text, follow_gate_button_title, enabled, created_at, updated_at)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?18)
        ON CONFLICT(id) DO UPDATE SET
          name = excluded.name,
          media_id = excluded.media_id,
          keyword = excluded.keyword,
          opening_text = excluded.opening_text,
          opening_text_variants = excluded.opening_text_variants,
          button_title = excluded.button_title,
          button_payload = excluded.button_payload,
          dm_steps = excluded.dm_steps,
          delivery_text = excluded.delivery_text,
          comment_reply_text = excluded.comment_reply_text,
          comment_reply_text_variants = excluded.comment_reply_text_variants,
          opening_failure_reply_text = excluded.opening_failure_reply_text,
          follow_gate_enabled = excluded.follow_gate_enabled,
          follow_gate_text = excluded.follow_gate_text,
          follow_gate_button_title = excluded.follow_gate_button_title,
          enabled = excluded.enabled,
          updated_at = excluded.updated_at`
      )
      .bind(
        campaign.id,
        campaign.name,
        campaign.mediaId,
        campaign.keyword,
        campaign.openingText,
        JSON.stringify(campaign.openingTextVariants),
        campaign.buttonTitle,
        campaign.buttonPayload,
        JSON.stringify(campaign.dmSteps),
        campaign.deliveryText,
        campaign.commentReplyText ?? null,
        JSON.stringify(campaign.commentReplyTextVariants),
        campaign.openingFailureReplyText ?? null,
        campaign.followGateEnabled ? 1 : 0,
        campaign.followGateText ?? null,
        campaign.followGateButtonTitle ?? null,
        campaign.enabled ? 1 : 0,
        now
      )
      .run();
  }

  async setCampaignEnabled(id: string, enabled: boolean): Promise<boolean> {
    const result = await this.db
      .prepare("UPDATE campaigns SET enabled = ?2, updated_at = ?3 WHERE id = ?1")
      .bind(id, enabled ? 1 : 0, new Date().toISOString())
      .run();
    return Number(result.meta.changes ?? 0) > 0;
  }

  async deleteCampaignCascade(campaignId: string): Promise<CampaignDeleteCounts> {
    const deliveries = await this.deleteBy("DELETE FROM deliveries WHERE campaign_id = ?1", campaignId);
    const contactStates = await this.deleteBy("DELETE FROM contact_states WHERE campaign_id = ?1", campaignId);
    const webhookEvents = await this.deleteBy("DELETE FROM webhook_events WHERE campaign_id = ?1", campaignId);
    const campaign = await this.deleteBy("DELETE FROM campaigns WHERE id = ?1", campaignId);

    return { campaign, contactStates, deliveries, webhookEvents };
  }

  async insertWebhookEvent(input: {
    eventId: string;
    eventType: string;
    campaignId?: string;
    igUserId?: string;
    rawHash: string;
  }): Promise<boolean> {
    const result = await this.db
      .prepare(
        "INSERT OR IGNORE INTO webhook_events (event_id, event_type, campaign_id, ig_user_id, raw_hash, processed_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)"
      )
      .bind(
        input.eventId,
        input.eventType,
        input.campaignId ?? null,
        input.igUserId ?? null,
        input.rawHash,
        new Date().toISOString()
      )
      .run();

    return result.meta.changes === 1;
  }

  async setWebhookEventCampaign(eventId: string, campaignId: string): Promise<void> {
    await this.db
      .prepare("UPDATE webhook_events SET campaign_id = COALESCE(campaign_id, ?2) WHERE event_id = ?1")
      .bind(eventId, campaignId)
      .run();
  }

  async upsertContactState(input: {
    campaignId: string;
    igUserId: string;
    username?: string;
    state: string;
    commentId?: string;
    messageId?: string;
  }): Promise<void> {
    const now = new Date().toISOString();
    const id = `${input.campaignId}:${input.igUserId}`;
    await this.db
      .prepare(
        `INSERT INTO contact_states
        (id, campaign_id, ig_user_id, username, state, last_comment_id, last_message_id, created_at, updated_at)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?8)
        ON CONFLICT(campaign_id, ig_user_id) DO UPDATE SET
          username = COALESCE(excluded.username, contact_states.username),
          state = excluded.state,
          last_comment_id = COALESCE(excluded.last_comment_id, contact_states.last_comment_id),
          last_message_id = COALESCE(excluded.last_message_id, contact_states.last_message_id),
          updated_at = excluded.updated_at`
      )
      .bind(
        id,
        input.campaignId,
        input.igUserId,
        input.username ?? null,
        input.state,
        input.commentId ?? null,
        input.messageId ?? null,
        now
      )
      .run();
  }

  async findLatestContactState(igUserId: string): Promise<ContactState | null> {
    const row = await this.db
      .prepare(
        "SELECT campaign_id, ig_user_id, state, last_comment_id FROM contact_states WHERE ig_user_id = ?1 ORDER BY updated_at DESC LIMIT 1"
      )
      .bind(igUserId)
      .first<Record<string, unknown>>();

    return row
      ? {
          campaignId: String(row.campaign_id),
          igUserId: String(row.ig_user_id),
          state: String(row.state),
          lastCommentId: row.last_comment_id == null ? null : String(row.last_comment_id)
        }
      : null;
  }

  async findContactState(campaignId: string, igUserId: string): Promise<ContactState | null> {
    const row = await this.db
      .prepare(
        "SELECT campaign_id, ig_user_id, state, last_comment_id FROM contact_states WHERE campaign_id = ?1 AND ig_user_id = ?2 LIMIT 1"
      )
      .bind(campaignId, igUserId)
      .first<Record<string, unknown>>();

    return row
      ? {
          campaignId: String(row.campaign_id),
          igUserId: String(row.ig_user_id),
          state: String(row.state),
          lastCommentId: row.last_comment_id == null ? null : String(row.last_comment_id)
        }
      : null;
  }

  async deleteUserData(igUserId: string): Promise<UserDataDeleteCounts> {
    const deliveries = await this.deleteBy("DELETE FROM deliveries WHERE ig_user_id = ?1", igUserId);
    const contactStates = await this.deleteBy("DELETE FROM contact_states WHERE ig_user_id = ?1", igUserId);
    const webhookEvents = await this.deleteBy("DELETE FROM webhook_events WHERE ig_user_id = ?1", igUserId);
    const operationalEvents = await this.deleteBy(
      "DELETE FROM operational_events WHERE json_valid(metadata_json) AND json_extract(metadata_json, '$.igUserId') = ?1",
      igUserId
    );
    const adminAuditLogs = await this.deleteBy(
      "DELETE FROM admin_audit_logs WHERE path LIKE ?1 ESCAPE '\\'",
      `%/${escapeLikePattern(igUserId)}/%`
    );

    return { adminAuditLogs, contactStates, deliveries, operationalEvents, webhookEvents };
  }

  async claimDataDeletionRequest(requestHash: string, now = new Date()): Promise<DataDeletionRequestClaim> {
    const nowIso = now.toISOString();
    const staleProcessingCutoff = new Date(now.getTime() - DATA_DELETION_PROCESSING_STALE_MS).toISOString();
    const inserted = await this.db
      .prepare(
        `INSERT OR IGNORE INTO data_deletion_requests
        (request_hash, status, created_at, updated_at)
        VALUES (?1, 'processing', ?2, ?2)`
      )
      .bind(requestHash, nowIso)
      .run();

    if (Number(inserted.meta.changes ?? 0) === 1) {
      return { status: "claimed" };
    }

    const reclaimed = await this.db
      .prepare(
        `UPDATE data_deletion_requests
        SET status = 'processing',
            updated_at = ?2
        WHERE request_hash = ?1
          AND status != 'completed'
          AND updated_at < ?3`
      )
      .bind(requestHash, nowIso, staleProcessingCutoff)
      .run();

    if (Number(reclaimed.meta.changes ?? 0) === 1) {
      return { status: "claimed" };
    }

    const row = await this.db
      .prepare("SELECT status, confirmation_code FROM data_deletion_requests WHERE request_hash = ?1")
      .bind(requestHash)
      .first<Record<string, unknown>>();

    if (row?.status === "completed") {
      return {
        status: "completed",
        confirmationCode: row.confirmation_code == null ? null : String(row.confirmation_code)
      };
    }

    return { status: "processing" };
  }

  async completeDataDeletionRequest(requestHash: string, confirmationCode: string): Promise<void> {
    const now = new Date().toISOString();
    await this.db
      .prepare(
        `UPDATE data_deletion_requests
        SET status = 'completed',
            confirmation_code = ?2,
            completed_at = ?3,
            updated_at = ?3
        WHERE request_hash = ?1`
      )
      .bind(requestHash, confirmationCode, now)
      .run();
  }

  async releaseDataDeletionRequest(requestHash: string): Promise<void> {
    await this.db
      .prepare("DELETE FROM data_deletion_requests WHERE request_hash = ?1 AND status = 'processing'")
      .bind(requestHash)
      .run();
  }

  async dataDeletionConfirmationExists(confirmationCode: string): Promise<boolean> {
    const row = await this.db
      .prepare(
        `SELECT 1 AS ok
        FROM data_deletion_requests
        WHERE confirmation_code = ?1
          AND status = 'completed'
        LIMIT 1`
      )
      .bind(confirmationCode)
      .first<Record<string, unknown>>();

    return Boolean(row);
  }

  async createDelivery(input: {
    id: string;
    campaignId: string;
    igUserId: string;
    deliveryType: string;
    status: "queued" | "sent" | "failed" | "retrying";
  }): Promise<boolean> {
    const now = new Date().toISOString();
    const result = await this.db
      .prepare(
        `INSERT OR IGNORE INTO deliveries
        (id, campaign_id, ig_user_id, delivery_type, status, created_at, updated_at)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6)`
      )
      .bind(input.id, input.campaignId, input.igUserId, input.deliveryType, input.status, now)
      .run();
    return result.meta.changes === 1;
  }

  async listOpeningSentWithoutFinal(limit = 25): Promise<FinalDeliveryCandidate[]> {
    const safeLimit = Math.min(Math.max(Math.trunc(limit), 1), 100);
    const rows = await this.db
      .prepare(
        `SELECT opening.campaign_id, opening.ig_user_id
        FROM deliveries AS opening
        JOIN contact_states
          ON contact_states.campaign_id = opening.campaign_id
         AND contact_states.ig_user_id = opening.ig_user_id
        JOIN campaigns
          ON campaigns.id = opening.campaign_id
         AND campaigns.enabled = 1
         AND campaigns.follow_gate_enabled = 0
         AND campaigns.button_payload NOT LIKE 'http://%'
         AND campaigns.button_payload NOT LIKE 'https://%'
        WHERE opening.delivery_type = 'opening'
          AND opening.status = 'sent'
          AND contact_states.state = 'commented'
          AND (campaigns.dm_steps IS NULL OR campaigns.dm_steps = '' OR campaigns.dm_steps = '[]')
          AND NOT EXISTS (
            SELECT 1
            FROM deliveries AS final
            WHERE final.campaign_id = opening.campaign_id
              AND final.ig_user_id = opening.ig_user_id
              AND final.delivery_type = 'final'
          )
        ORDER BY opening.updated_at ASC
        LIMIT ?1`
      )
      .bind(safeLimit)
      .all<Record<string, unknown>>();

    return rows.results.map((row) => ({
      campaignId: String(row.campaign_id),
      igUserId: String(row.ig_user_id)
    }));
  }

  async listLastStepSentWithoutFinal(limit = 25): Promise<FinalDeliveryCandidate[]> {
    const safeLimit = Math.min(Math.max(Math.trunc(limit), 1), 100);
    const rows = await this.db
      .prepare(
        `SELECT contact_states.campaign_id, contact_states.ig_user_id
        FROM contact_states
        JOIN campaigns
          ON campaigns.id = contact_states.campaign_id
         AND campaigns.enabled = 1
        JOIN deliveries AS step_delivery
          ON step_delivery.campaign_id = contact_states.campaign_id
         AND step_delivery.ig_user_id = contact_states.ig_user_id
         AND step_delivery.delivery_type = contact_states.state
         AND step_delivery.status = 'sent'
        WHERE contact_states.state LIKE 'button_step:%'
          AND json_valid(campaigns.dm_steps)
          AND json_array_length(campaigns.dm_steps) = CAST(substr(contact_states.state, length('button_step:') + 1) AS INTEGER)
          AND NOT EXISTS (
            SELECT 1
            FROM deliveries AS final
            WHERE final.campaign_id = contact_states.campaign_id
              AND final.ig_user_id = contact_states.ig_user_id
              AND final.delivery_type = 'final'
          )
        ORDER BY step_delivery.updated_at ASC
        LIMIT ?1`
      )
      .bind(safeLimit)
      .all<Record<string, unknown>>();

    return rows.results.map((row) => ({
      campaignId: String(row.campaign_id),
      igUserId: String(row.ig_user_id)
    }));
  }

  async listOpeningSentWithoutCommentReply(limit = 25): Promise<CommentReplyCandidate[]> {
    const safeLimit = Math.min(Math.max(Math.trunc(limit), 1), 100);
    const rows = await this.db
      .prepare(
        `SELECT opening.campaign_id, opening.ig_user_id, contact_states.last_comment_id
        FROM deliveries AS opening
        JOIN contact_states
          ON contact_states.campaign_id = opening.campaign_id
         AND contact_states.ig_user_id = opening.ig_user_id
        JOIN campaigns
          ON campaigns.id = opening.campaign_id
         AND campaigns.enabled = 1
         AND campaigns.comment_reply_text IS NOT NULL
         AND campaigns.comment_reply_text != ''
        WHERE opening.delivery_type = 'opening'
          AND opening.status = 'sent'
          AND contact_states.last_comment_id IS NOT NULL
          AND NOT EXISTS (
            SELECT 1
            FROM deliveries AS comment_reply
            WHERE comment_reply.campaign_id = opening.campaign_id
              AND comment_reply.ig_user_id = opening.ig_user_id
              AND comment_reply.delivery_type = 'comment_reply'
          )
        ORDER BY opening.updated_at ASC
        LIMIT ?1`
      )
      .bind(safeLimit)
      .all<Record<string, unknown>>();

    return rows.results.map((row) => ({
      campaignId: String(row.campaign_id),
      igUserId: String(row.ig_user_id),
      commentId: String(row.last_comment_id)
    }));
  }

  async markDeliverySent(deliveryId: string, messageId: string): Promise<void> {
    await this.updateDelivery(deliveryId, "sent", messageId, null, null);
  }

  async markDeliveryWaitingFollow(deliveryId: string, messageId: string): Promise<void> {
    await this.updateDelivery(deliveryId, "waiting_follow", messageId, null, null);
  }

  async markDeliveryRetrying(
    deliveryId: string,
    code: string,
    message: string,
    options: { countAttempt?: boolean } = {}
  ): Promise<boolean> {
    const countAttempt = options.countAttempt !== false;
    const row = await this.db
      .prepare("SELECT attempt_count FROM deliveries WHERE id = ?1")
      .bind(deliveryId)
      .first<{ attempt_count: number }>();
    const nextAttempt = Number(row?.attempt_count ?? 0) + (countAttempt ? 1 : 0);
    if (countAttempt && nextAttempt >= MAX_DELIVERY_ATTEMPTS) {
      await this.updateDelivery(
        deliveryId,
        "failed",
        null,
        "retry_exhausted",
        `Retry attempts exhausted after ${MAX_DELIVERY_ATTEMPTS} attempts; last error ${code}: ${message}`
      );
      return false;
    }

    await this.updateDelivery(deliveryId, "retrying", null, code, message, { incrementAttempt: countAttempt });
    return true;
  }

  async markDeliveryFailed(deliveryId: string, code: string, message: string): Promise<void> {
    await this.updateDelivery(deliveryId, "failed", null, code, message);
  }

  async claimDeliveryForSend(deliveryId: string, options: { includeWaitingFollow?: boolean } = {}): Promise<DeliveryClaimResult> {
    const now = new Date();
    const result = await this.db
      .prepare(
        `UPDATE deliveries
        SET status = 'processing',
            updated_at = ?2
        WHERE id = ?1
          AND (
            (status IN ('queued', 'retrying') AND attempt_count < ?4)
            OR (?3 = 1 AND status = 'waiting_follow')
          )`
      )
      .bind(deliveryId, now.toISOString(), options.includeWaitingFollow ? 1 : 0, MAX_DELIVERY_ATTEMPTS)
      .run();

    if (Number(result.meta.changes ?? 0) === 1) return "claimed";

    const row = await this.db
      .prepare("SELECT status FROM deliveries WHERE id = ?1")
      .bind(deliveryId)
      .first<{ status: string }>();

    return row?.status === "processing" ? "busy" : "skip";
  }

  async requeueWaitingFollowDelivery(deliveryId: string): Promise<boolean> {
    const result = await this.db
      .prepare(
        `UPDATE deliveries
        SET status = 'queued',
            attempt_count = 0,
            updated_at = ?2
        WHERE id = ?1
          AND status = 'waiting_follow'`
      )
      .bind(deliveryId, new Date().toISOString())
      .run();

    return Number(result.meta.changes ?? 0) === 1;
  }

  async requeueInteractiveDelivery(deliveryId: string): Promise<boolean> {
    const result = await this.db
      .prepare(
        `UPDATE deliveries
        SET status = 'queued',
            error_code = NULL,
            error_message = NULL,
            attempt_count = 0,
            updated_at = ?2
        WHERE id = ?1
          AND status IN ('queued', 'retrying', 'failed')
          AND COALESCE(error_code, '') != 'send_status_unknown'`
      )
      .bind(deliveryId, new Date().toISOString())
      .run();

    return Number(result.meta.changes ?? 0) === 1;
  }

  async requeueFailedOpeningDelivery(deliveryId: string): Promise<boolean> {
    const result = await this.db
      .prepare(
        `UPDATE deliveries
        SET status = 'queued',
            error_code = NULL,
            error_message = NULL,
            attempt_count = 0,
            updated_at = ?2
        WHERE id = ?1
          AND delivery_type = 'opening'
          AND status = 'failed'
          AND COALESCE(error_code, '') != 'send_status_unknown'`
      )
      .bind(deliveryId, new Date().toISOString())
      .run();

    return Number(result.meta.changes ?? 0) === 1;
  }

  async requeueSentOpeningDelivery(deliveryId: string): Promise<boolean> {
    const result = await this.db
      .prepare(
        `UPDATE deliveries
        SET status = 'queued',
            error_code = NULL,
            error_message = NULL,
            attempt_count = 0,
            updated_at = ?2
        WHERE id = ?1
          AND delivery_type = 'opening'
          AND status = 'sent'`
      )
      .bind(deliveryId, new Date().toISOString())
      .run();

    return Number(result.meta.changes ?? 0) === 1;
  }

  async checkAdminRateLimit(input: {
    keyHash: string;
    limit: number;
    windowSeconds: number;
  }): Promise<{ allowed: boolean; count: number; resetAt: string }> {
    if (!this.db) {
      return { allowed: true, count: 0, resetAt: new Date().toISOString() };
    }

    const nowMs = Date.now();
    const windowMs = input.windowSeconds * 1000;
    const windowStartMs = Math.floor(nowMs / windowMs) * windowMs;
    const windowStart = new Date(windowStartMs).toISOString();
    const resetAt = new Date(windowStartMs + windowMs).toISOString();

    const inserted = await this.db
      .prepare(
        `INSERT OR IGNORE INTO admin_rate_limits
        (key_hash, window_start, count, updated_at)
        VALUES (?1, ?2, 1, ?3)`
      )
      .bind(input.keyHash, windowStart, new Date(nowMs).toISOString())
      .run();

    let allowed = Number(inserted.meta.changes ?? 0) === 1;

    if (!allowed) {
      const updated = await this.db
        .prepare(
          `UPDATE admin_rate_limits
          SET count = count + 1,
              updated_at = ?3
          WHERE key_hash = ?1
            AND window_start = ?2
            AND count < ?4`
        )
        .bind(input.keyHash, windowStart, new Date(nowMs).toISOString(), input.limit)
        .run();
      allowed = Number(updated.meta.changes ?? 0) === 1;
    }

    const current = await this.db
      .prepare("SELECT count FROM admin_rate_limits WHERE key_hash = ?1 AND window_start = ?2")
      .bind(input.keyHash, windowStart)
      .first<{ count: number }>();

    return { allowed, count: Number(current?.count ?? 0), resetAt };
  }

  async tryConsumeOutboundRateLimit(bucket = "instagram_send", limit = 30, windowSeconds = 60): Promise<boolean> {
    if (!this.db) return true;

    const safeLimit = Math.min(Math.max(Math.trunc(limit), 1), 120);
    const nowMs = Date.now();
    const windowMs = windowSeconds * 1000;
    const windowStartMs = Math.floor(nowMs / windowMs) * windowMs;
    const windowStart = new Date(windowStartMs).toISOString();

    const inserted = await this.db
      .prepare(
        `INSERT OR IGNORE INTO outbound_rate_limits
        (bucket, window_start, count, updated_at)
        VALUES (?1, ?2, 1, ?3)`
      )
      .bind(bucket, windowStart, new Date(nowMs).toISOString())
      .run();

    if (Number(inserted.meta.changes ?? 0) === 1) return true;

    const updated = await this.db
      .prepare(
        `UPDATE outbound_rate_limits
        SET count = count + 1,
            updated_at = ?3
        WHERE bucket = ?1
          AND window_start = ?2
          AND count < ?4`
      )
      .bind(bucket, windowStart, new Date(nowMs).toISOString(), safeLimit)
      .run();

    return Number(updated.meta.changes ?? 0) === 1;
  }

  async insertAdminAuditLog(input: {
    actorKeyHash: string;
    method: string;
    path: string;
    action: string;
    status: number;
  }): Promise<void> {
    if (!this.db) return;

    await this.db
      .prepare(
        `INSERT INTO admin_audit_logs
        (id, actor_key_hash, method, path, action, status, created_at)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`
      )
      .bind(
        crypto.randomUUID(),
        input.actorKeyHash,
        input.method,
        input.path,
        input.action,
        input.status,
        new Date().toISOString()
      )
      .run();
  }

  async listAdminAuditLogs(limit = 50): Promise<AdminAuditLog[]> {
    if (!this.db) return [];

    // Non-numeric query input arrives as NaN and must fall back instead of reaching .bind().
    const requested = Number.isFinite(limit) ? Math.trunc(limit) : 50;
    const safeLimit = Math.min(Math.max(requested, 1), 100);
    const rows = await this.db
      .prepare("SELECT * FROM admin_audit_logs ORDER BY created_at DESC LIMIT ?1")
      .bind(safeLimit)
      .all<Record<string, unknown>>();

    return rows.results.map((row) => ({
      id: String(row.id),
      actorKeyHash: String(row.actor_key_hash),
      method: String(row.method),
      path: String(row.path),
      action: String(row.action),
      status: Number(row.status),
      createdAt: String(row.created_at)
    }));
  }

  async insertAdminSession(input: {
    idHash: string;
    csrfHash: string;
    actorKeyHash: string;
    userAgentHash: string;
    expiresAt: string;
  }): Promise<void> {
    if (!this.db) return;

    const now = new Date().toISOString();
    await this.db
      .prepare(
        `INSERT INTO admin_sessions
        (id_hash, csrf_hash, actor_key_hash, user_agent_hash, expires_at, revoked_at, created_at, last_seen_at)
        VALUES (?1, ?2, ?3, ?4, ?5, NULL, ?6, ?6)`
      )
      .bind(input.idHash, input.csrfHash, input.actorKeyHash, input.userAgentHash, input.expiresAt, now)
      .run();
  }

  async findActiveAdminSession(idHash: string, now = new Date()): Promise<AdminSession | null> {
    if (!this.db) return null;

    const row = await this.db
      .prepare(
        `SELECT id_hash, csrf_hash, actor_key_hash, user_agent_hash, expires_at, revoked_at
        FROM admin_sessions
        WHERE id_hash = ?1
          AND revoked_at IS NULL
          AND expires_at > ?2`
      )
      .bind(idHash, now.toISOString())
      .first<Record<string, unknown>>();

    return row ? mapAdminSession(row) : null;
  }

  async touchAdminSession(idHash: string): Promise<void> {
    if (!this.db) return;

    await this.db
      .prepare("UPDATE admin_sessions SET last_seen_at = ?2 WHERE id_hash = ?1")
      .bind(idHash, new Date().toISOString())
      .run();
  }

  async rotateAdminSessionCsrf(idHash: string, csrfHash: string): Promise<void> {
    if (!this.db) return;

    await this.db
      .prepare("UPDATE admin_sessions SET csrf_hash = ?2, last_seen_at = ?3 WHERE id_hash = ?1")
      .bind(idHash, csrfHash, new Date().toISOString())
      .run();
  }

  async revokeAdminSession(idHash: string): Promise<void> {
    if (!this.db) return;

    await this.db
      .prepare("UPDATE admin_sessions SET revoked_at = ?2, last_seen_at = ?2 WHERE id_hash = ?1")
      .bind(idHash, new Date().toISOString())
      .run();
  }

  async listMessageVariantTemplates(kind?: MessageVariantKind, limit = 120): Promise<MessageVariantTemplate[]> {
    const clampedLimit = Math.min(Math.max(limit, 1), 200);
    const query = kind
      ? this.db
          .prepare(
            `SELECT id, kind, text, enabled, created_at, updated_at
            FROM message_variant_templates
            WHERE kind = ?1 AND enabled = 1
            ORDER BY updated_at DESC, text ASC
            LIMIT ?2`
          )
          .bind(kind, clampedLimit)
      : this.db.prepare(
          `SELECT id, kind, text, enabled, created_at, updated_at
          FROM message_variant_templates
          WHERE enabled = 1
          ORDER BY kind ASC, updated_at DESC, text ASC
          LIMIT ?1`
        ).bind(clampedLimit);

    const rows = await query.all<Record<string, unknown>>();
    return rows.results.map(mapMessageVariantTemplate);
  }

  async upsertMessageVariantTemplate(input: {
    id: string;
    kind: MessageVariantKind;
    text: string;
    enabled?: boolean;
  }): Promise<MessageVariantTemplate> {
    const now = new Date().toISOString();
    await this.db
      .prepare(
        `INSERT INTO message_variant_templates
          (id, kind, text, enabled, created_at, updated_at)
        VALUES (?1, ?2, ?3, ?4, ?5, ?5)
        ON CONFLICT(kind, text) DO UPDATE SET
          enabled = excluded.enabled,
          updated_at = excluded.updated_at`
      )
      .bind(input.id, input.kind, input.text, input.enabled === false ? 0 : 1, now)
      .run();

    const row = await this.db
      .prepare(
        `SELECT id, kind, text, enabled, created_at, updated_at
        FROM message_variant_templates
        WHERE kind = ?1 AND text = ?2`
      )
      .bind(input.kind, input.text)
      .first<Record<string, unknown>>();

    return mapMessageVariantTemplate(row ?? {
      id: input.id,
      kind: input.kind,
      text: input.text,
      enabled: input.enabled === false ? 0 : 1,
      created_at: now,
      updated_at: now
    });
  }

  async upsertMessageVariantTemplates(
    kind: MessageVariantKind,
    inputs: Array<{ id: string; text: string; enabled?: boolean }>
  ): Promise<MessageVariantTemplate[]> {
    if (!inputs.length) return [];

    const now = new Date().toISOString();
    await this.db.batch(
      inputs.map((input) =>
        this.db
          .prepare(
            `INSERT INTO message_variant_templates
              (id, kind, text, enabled, created_at, updated_at)
            VALUES (?1, ?2, ?3, ?4, ?5, ?5)
            ON CONFLICT(kind, text) DO UPDATE SET
              enabled = excluded.enabled,
              updated_at = excluded.updated_at`
          )
          .bind(input.id, kind, input.text, input.enabled === false ? 0 : 1, now)
      )
    );

    const placeholders = inputs.map((_, index) => `?${index + 2}`).join(", ");
    const rows = await this.db
      .prepare(
        `SELECT id, kind, text, enabled, created_at, updated_at
        FROM message_variant_templates
        WHERE kind = ?1 AND text IN (${placeholders})
        ORDER BY updated_at DESC, text ASC`
      )
      .bind(kind, ...inputs.map((input) => input.text))
      .all<Record<string, unknown>>();

    return rows.results.map(mapMessageVariantTemplate);
  }

  async getInstagramTokenState(): Promise<InstagramTokenState | null> {
    const row = await this.db
      .prepare(
        `SELECT encrypted_token, iv, expires_at, refreshed_at, refresh_after, last_error
        FROM instagram_tokens
        WHERE id = 'default'`
      )
      .first<Record<string, unknown>>();

    return row ? mapInstagramTokenState(row) : null;
  }

  async upsertInstagramTokenState(input: {
    encryptedToken: string;
    iv: string;
    expiresAt: string;
    refreshedAt: string;
    lastError: string | null;
  }): Promise<void> {
    const now = new Date().toISOString();
    const refreshedAtMs = Date.parse(input.refreshedAt);
    const refreshAfter = Number.isFinite(refreshedAtMs)
      ? new Date(refreshedAtMs + 45 * 24 * 60 * 60 * 1000).toISOString()
      : null;

    await this.db
      .prepare(
        `INSERT INTO instagram_tokens
        (id, encrypted_token, iv, expires_at, refreshed_at, refresh_after, last_error, created_at, updated_at)
        VALUES ('default', ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?7)
        ON CONFLICT(id) DO UPDATE SET
          encrypted_token = excluded.encrypted_token,
          iv = excluded.iv,
          expires_at = excluded.expires_at,
          refreshed_at = excluded.refreshed_at,
          refresh_after = excluded.refresh_after,
          last_error = excluded.last_error,
          updated_at = excluded.updated_at`
      )
      .bind(input.encryptedToken, input.iv, input.expiresAt, input.refreshedAt, refreshAfter, input.lastError, now)
      .run();
  }

  async recordInstagramTokenRefreshError(message: string): Promise<void> {
    await this.db
      .prepare(
        `UPDATE instagram_tokens
        SET last_error = ?1,
            updated_at = ?2
        WHERE id = 'default'`
      )
      .bind(message, new Date().toISOString())
      .run();
  }

  async insertOperationalEvent(input: {
    eventType: string;
    status: string;
    message?: string;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    await this.db
      .prepare(
        `INSERT INTO operational_events
        (id, event_type, status, message, metadata_json, created_at)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6)`
      )
      .bind(
        crypto.randomUUID(),
        input.eventType,
        input.status,
        input.message ?? null,
        input.metadata ? JSON.stringify(input.metadata) : null,
        new Date().toISOString()
      )
      .run();
  }

  async cleanupOldOperationalData(now = new Date()): Promise<CleanupCounts> {
    const webhookEvents = await this.deleteOlderThan("webhookEvents", daysAgo(now, 30));
    const deliveries = await this.deleteOlderThan("deliveries", daysAgo(now, 90));
    const contactStates = await this.deleteOlderThan("contactStates", daysAgo(now, 180));
    const adminRateLimits = await this.deleteOlderThan("adminRateLimits", daysAgo(now, 1));
    const adminSessions = await this.deleteOlderThan("adminSessions", now.toISOString());
    const adminAuditLogs = await this.deleteOlderThan("adminAuditLogs", daysAgo(now, 90));
    const operationalEvents = await this.deleteOlderThan("operationalEvents", daysAgo(now, 90));
    const dataDeletionRequests = await this.deleteOlderThan("dataDeletionRequests", daysAgo(now, 90));
    const outboundRateLimits = await this.deleteOlderThan("outboundRateLimits", daysAgo(now, 1));

    return {
      webhookEvents,
      deliveries,
      contactStates,
      adminRateLimits,
      adminSessions,
      adminAuditLogs,
      operationalEvents,
      dataDeletionRequests,
      outboundRateLimits
    };
  }

  async listRecoverableDeliveries(limit = 25, now = new Date()): Promise<RecoverableDelivery[]> {
    const safeLimit = Math.min(Math.max(Math.trunc(limit), 1), 100);
    const queuedCutoff = new Date(now.getTime() - QUEUE_RECOVERY_STALE_MS).toISOString();
    const rows = await this.db
      .prepare(
        `SELECT
          deliveries.id,
          deliveries.campaign_id,
          deliveries.ig_user_id,
          deliveries.delivery_type,
          COALESCE(
            contact_states.last_comment_id,
            (
              SELECT substr(recovery_events.event_id, length('comment:') + 1)
              FROM webhook_events AS recovery_events
              WHERE recovery_events.campaign_id = deliveries.campaign_id
                AND recovery_events.ig_user_id = deliveries.ig_user_id
                AND recovery_events.event_type = 'comment.created'
                AND recovery_events.event_id LIKE 'comment:%'
              ORDER BY recovery_events.processed_at DESC
              LIMIT 1
            )
          ) AS last_comment_id
        FROM deliveries
        JOIN campaigns
          ON campaigns.id = deliveries.campaign_id
         AND campaigns.enabled = 1
        LEFT JOIN contact_states
          ON contact_states.campaign_id = deliveries.campaign_id
         AND contact_states.ig_user_id = deliveries.ig_user_id
        WHERE (
            deliveries.delivery_type IN ('opening', 'comment_reply', 'opening_failure_reply', 'final')
            OR deliveries.delivery_type LIKE 'button_step:%'
          )
          AND deliveries.status IN ('queued', 'retrying')
          AND deliveries.updated_at < ?1
          AND deliveries.attempt_count < ?3
        ORDER BY deliveries.updated_at ASC
        LIMIT ?2`
      )
      .bind(queuedCutoff, safeLimit, MAX_DELIVERY_ATTEMPTS)
      .all<Record<string, unknown>>();

    return rows.results.map((row) => ({
      deliveryId: String(row.id),
      campaignId: String(row.campaign_id),
      igUserId: String(row.ig_user_id),
      deliveryType: String(row.delivery_type).startsWith("button_step:")
        ? "button_step"
        : row.delivery_type as RecoverableDelivery["deliveryType"],
      commentId: row.last_comment_id == null ? undefined : String(row.last_comment_id),
      stepIndex: parseButtonStepDeliveryType(String(row.delivery_type))
    }));
  }

  async markExhaustedRecoverableDeliveries(limit = 100, now = new Date()): Promise<number> {
    const safeLimit = Math.min(Math.max(Math.trunc(limit), 1), 500);
    const queuedCutoff = new Date(now.getTime() - QUEUE_RECOVERY_STALE_MS).toISOString();
    const result = await this.db
      .prepare(
        `UPDATE deliveries
        SET status = 'failed',
            error_code = 'retry_exhausted',
            error_message = 'Retry attempts exhausted before stale recovery',
            updated_at = ?2
        WHERE rowid IN (
          SELECT deliveries.rowid
          FROM deliveries
          WHERE (
              deliveries.delivery_type IN ('opening', 'comment_reply', 'opening_failure_reply', 'final')
              OR deliveries.delivery_type LIKE 'button_step:%'
            )
            AND deliveries.status IN ('queued', 'retrying')
            AND deliveries.updated_at < ?1
            AND deliveries.attempt_count >= ?3
          ORDER BY deliveries.updated_at ASC
          LIMIT ?4
        )`
      )
      .bind(queuedCutoff, now.toISOString(), MAX_DELIVERY_ATTEMPTS, safeLimit)
      .run();

    return Number(result.meta.changes ?? 0);
  }

  async markStaleProcessingDeliveriesUnknown(limit = 100, now = new Date()): Promise<number> {
    const safeLimit = Math.min(Math.max(Math.trunc(limit), 1), 500);
    const processingCutoff = new Date(now.getTime() - PROCESSING_RECOVERY_STALE_MS).toISOString();
    const result = await this.db
      .prepare(
        `UPDATE deliveries
        SET status = 'failed',
            error_code = 'send_status_unknown',
            error_message = 'Delivery was still processing after stale cutoff; manual reconciliation required',
            updated_at = ?2
        WHERE rowid IN (
          SELECT deliveries.rowid
          FROM deliveries
          WHERE (
              deliveries.delivery_type IN ('opening', 'comment_reply', 'opening_failure_reply', 'final')
              OR deliveries.delivery_type LIKE 'button_step:%'
            )
            AND deliveries.status = 'processing'
            AND deliveries.updated_at < ?1
          ORDER BY deliveries.updated_at ASC
          LIMIT ?3
        )`
      )
      .bind(processingCutoff, now.toISOString(), safeLimit)
      .run();

    return Number(result.meta.changes ?? 0);
  }

  async getOperationalDashboard(): Promise<OperationalDashboard> {
    const row = await this.db
      .prepare(
        `SELECT
          COUNT(*) AS campaigns,
          SUM(CASE WHEN enabled = 1 THEN 1 ELSE 0 END) AS enabled_campaigns,
          (SELECT COUNT(*) FROM contact_states) AS contact_states,
          (SELECT COUNT(*) FROM webhook_events) AS webhook_events,
          (SELECT COUNT(*) FROM deliveries) AS deliveries,
          (SELECT COUNT(*) FROM deliveries WHERE status = 'failed') AS failed_deliveries,
          (SELECT COUNT(*) FROM deliveries WHERE status = 'retrying') AS retrying_deliveries,
          (SELECT COUNT(*) FROM deliveries WHERE status = 'failed' AND error_code = 'send_status_unknown') AS send_status_unknown_deliveries
        FROM campaigns`
      )
      .first<Record<string, unknown>>();

    return {
      counts: {
        campaigns: Number(row?.campaigns ?? 0),
        enabledCampaigns: Number(row?.enabled_campaigns ?? 0),
        contactStates: Number(row?.contact_states ?? 0),
        webhookEvents: Number(row?.webhook_events ?? 0),
        deliveries: Number(row?.deliveries ?? 0),
        failedDeliveries: Number(row?.failed_deliveries ?? 0),
        retryingDeliveries: Number(row?.retrying_deliveries ?? 0),
        sendStatusUnknownDeliveries: Number(row?.send_status_unknown_deliveries ?? 0)
      },
      token: await this.getInstagramTokenState()
    };
  }

  private async updateDelivery(
    deliveryId: string,
    status: string,
    metaMessageId: string | null,
    errorCode: string | null,
    errorMessage: string | null,
    options: { incrementAttempt?: boolean } = {}
  ): Promise<void> {
    const attemptExpression = options.incrementAttempt === false ? "attempt_count" : "attempt_count + 1";
    await this.db
      .prepare(
        `UPDATE deliveries
        SET status = ?2,
            meta_message_id = COALESCE(?3, meta_message_id),
            error_code = ?4,
            error_message = ?5,
            attempt_count = ${attemptExpression},
            updated_at = ?6
        WHERE id = ?1`
      )
      .bind(deliveryId, status, metaMessageId, errorCode, errorMessage, new Date().toISOString())
      .run();
  }

  private async deleteOlderThan(target: CleanupTarget, cutoff: string): Promise<number> {
    const result = await this.db.prepare(CLEANUP_TARGETS[target].sql).bind(cutoff, CLEANUP_BATCH_LIMIT).run();
    return Number(result.meta.changes ?? 0);
  }

  private async deleteBy(sql: string, value: string): Promise<number> {
    const result = await this.db.prepare(sql).bind(value).run();
    return Number(result.meta.changes ?? 0);
  }
}

function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (character) => `\\${character}`);
}

function mapCampaign(row: Record<string, unknown>): Campaign {
  return {
    id: String(row.id),
    name: String(row.name),
    mediaId: String(row.media_id),
    keyword: String(row.keyword),
    openingText: String(row.opening_text),
    openingTextVariants: parseVariantArray(row.opening_text_variants, String(row.opening_text)),
    buttonTitle: String(row.button_title),
    buttonPayload: String(row.button_payload),
    dmSteps: parseDmSteps(row.dm_steps),
    deliveryText: String(row.delivery_text),
    commentReplyText: row.comment_reply_text == null ? null : String(row.comment_reply_text),
    commentReplyTextVariants: parseVariantArray(row.comment_reply_text_variants, row.comment_reply_text == null ? null : String(row.comment_reply_text)),
    openingFailureReplyText: row.opening_failure_reply_text == null ? null : String(row.opening_failure_reply_text),
    followGateEnabled: Number(row.follow_gate_enabled) === 1,
    followGateText: row.follow_gate_text == null ? null : String(row.follow_gate_text),
    followGateButtonTitle: row.follow_gate_button_title == null ? null : String(row.follow_gate_button_title),
    enabled: Number(row.enabled) === 1
  };
}

function parseDmSteps(value: unknown): DmStep[] {
  if (typeof value !== "string" || !value.trim()) return [];

  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => {
        if (!item || typeof item !== "object") return null;
        const row = item as Record<string, unknown>;
        const text = String(row.text ?? "").trim();
        const buttonTitle = String(row.buttonTitle ?? "").trim();
        const textVariants = parseVariantArray(row.textVariants, text);
        return text && buttonTitle ? { text, textVariants, buttonTitle } : null;
      })
      .filter((item): item is DmStep => item !== null);
  } catch {
    return [];
  }
}

function parseButtonStepDeliveryType(value: string): number | undefined {
  const match = /^button_step:(\d+)$/.exec(value);
  if (!match) return undefined;

  const stepNumber = Number.parseInt(match[1], 10);
  return Number.isInteger(stepNumber) && stepNumber > 0 ? stepNumber - 1 : undefined;
}

function parseVariantArray(value: unknown, fallback: string | null): string[] {
  if (Array.isArray(value)) {
    const parsed = value.map((item) => String(item).trim()).filter(Boolean);
    return parsed.length ? parsed : fallback ? [fallback] : [];
  }
  if (typeof value === "string" && value.trim()) {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (Array.isArray(parsed)) {
        return parsed.map((item) => String(item).trim()).filter(Boolean);
      }
    } catch {
      return fallback ? [fallback] : [];
    }
  }
  return fallback ? [fallback] : [];
}

function mapInstagramTokenState(row: Record<string, unknown>): InstagramTokenState {
  return {
    encryptedToken: String(row.encrypted_token),
    iv: String(row.iv),
    expiresAt: String(row.expires_at),
    refreshedAt: row.refreshed_at == null ? null : String(row.refreshed_at),
    refreshAfter: row.refresh_after == null ? null : String(row.refresh_after),
    lastError: row.last_error == null ? null : String(row.last_error)
  };
}

function mapAdminSession(row: Record<string, unknown>): AdminSession {
  return {
    idHash: String(row.id_hash),
    csrfHash: String(row.csrf_hash),
    actorKeyHash: String(row.actor_key_hash),
    userAgentHash: String(row.user_agent_hash),
    expiresAt: String(row.expires_at),
    revokedAt: row.revoked_at == null ? null : String(row.revoked_at)
  };
}

function mapMessageVariantTemplate(row: Record<string, unknown>): MessageVariantTemplate {
  return {
    id: String(row.id),
    kind: row.kind as MessageVariantKind,
    text: String(row.text),
    enabled: Number(row.enabled) === 1,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at)
  };
}

function daysAgo(now: Date, days: number): string {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
}
