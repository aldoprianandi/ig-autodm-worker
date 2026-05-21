import type { NormalizedEvent } from "../types";

type UnknownRecord = Record<string, unknown>;
const MAX_TEXT_CHARS = 1000;
const MAX_PAYLOAD_CHARS = 200;
const MAX_USERNAME_CHARS = 80;

function asRecord(value: unknown): UnknownRecord {
  return value && typeof value === "object" ? (value as UnknownRecord) : {};
}

function asArray(value: unknown): UnknownRecord[] {
  return Array.isArray(value) ? value.map(asRecord) : [];
}

export function normalizeMetaWebhook(payload: unknown): NormalizedEvent[];
export function normalizeMetaWebhook(payload: unknown, expectedAccountId: string): NormalizedEvent[];
export function normalizeMetaWebhook(payload: unknown, expectedAccountId: string, messagingAccountIds: string[]): NormalizedEvent[];
export function normalizeMetaWebhook(payload: unknown, expectedAccountId?: string, messagingAccountIds: string[] = []): NormalizedEvent[] {
  const root = asRecord(payload);
  if (expectedAccountId && root.object !== "instagram") return [];

  const entries = asArray(root.entry);
  const events: NormalizedEvent[] = [];
  const allowedMessagingIds = new Set([expectedAccountId, ...messagingAccountIds].filter(Boolean));

  for (const entry of entries) {
    const entryMatchesExpectedAccount = !expectedAccountId || String(entry.id ?? "") === expectedAccountId;

    for (const change of asArray(entry.changes)) {
      if (!entryMatchesExpectedAccount) continue;
      if (change.field !== "comments") continue;

      const value = asRecord(change.value);
      const from = asRecord(value.from);
      const media = asRecord(value.media);
      const commentId = String(value.id ?? "");
      const mediaId = String(media.id ?? "");
      const igUserId = String(from.id ?? "");
      const text = truncate(String(value.text ?? ""), MAX_TEXT_CHARS);
      const createdAt = value.created_time ? String(value.created_time) : value.timestamp ? String(value.timestamp) : undefined;

      if (!commentId || !mediaId || !igUserId) continue;

      events.push({
        type: "comment.created",
        eventId: `comment:${commentId}`,
        commentId,
        mediaId,
        igUserId,
        username: from.username ? truncate(String(from.username), MAX_USERNAME_CHARS) : undefined,
        text,
        createdAt
      });
    }

    for (const messageEvent of asArray(entry.messaging)) {
      const recipient = asRecord(messageEvent.recipient);
      const recipientId = String(recipient.id ?? "");
      const entryId = String(entry.id ?? "");
      if (expectedAccountId && !allowedMessagingIds.has(entryId) && !allowedMessagingIds.has(recipientId)) continue;

      const sender = asRecord(messageEvent.sender);
      const senderId = String(sender.id ?? "");
      const timestamp = String(messageEvent.timestamp ?? "");
      const postback = asRecord(messageEvent.postback);
      const message = asRecord(messageEvent.message);

      if (!senderId || !timestamp) continue;

      const quickReply = asRecord(message.quick_reply);
      const quickReplyPayload = quickReply.payload ? truncate(String(quickReply.payload), MAX_PAYLOAD_CHARS) : "";
      const postbackPayload = postback.payload ? truncate(String(postback.payload), MAX_PAYLOAD_CHARS) : "";
      const messageId = message.mid ? String(message.mid) : postback.mid ? String(postback.mid) : "";

      if (postbackPayload || quickReplyPayload) {
        const payloadText = postbackPayload || quickReplyPayload;
        events.push({
          type: "message.postback",
          eventId: `postback:${senderId}:${messageId || timestamp}`,
          igUserId: senderId,
          payload: payloadText
        });
        continue;
      }

      if (message.text) {
        const text = truncate(String(message.text), MAX_TEXT_CHARS);
        events.push({
          type: "message.text",
          eventId: `message:${senderId}:${messageId || timestamp}`,
          igUserId: senderId,
          text
        });
      }
    }
  }

  return events;
}

function truncate(value: string, maxChars: number): string {
  return value.length > maxChars ? value.slice(0, maxChars) : value;
}
