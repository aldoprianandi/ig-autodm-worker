import { describe, expect, it } from "vitest";
import { normalizeMetaWebhook } from "../src/meta/webhook";

describe("normalizeMetaWebhook", () => {
  it("normalizes a comment webhook", () => {
    const events = normalizeMetaWebhook(
      {
        object: "instagram",
        entry: [
          {
            id: "ig-account-id",
            changes: [
              {
                field: "comments",
                value: {
                  id: "comment-1",
                  text: "PROMPT please",
                  media: { id: "media-1" },
                  from: { id: "user-1", username: "testuser" }
                }
              }
            ]
          }
        ]
      },
      "ig-account-id"
    );

    expect(events).toEqual([
      {
        type: "comment.created",
        eventId: "comment:comment-1",
        commentId: "comment-1",
        mediaId: "media-1",
        igUserId: "user-1",
        username: "testuser",
        text: "PROMPT please",
        createdAt: undefined
      }
    ]);
  });

  it("normalizes a postback webhook", () => {
    const events = normalizeMetaWebhook(
      {
        object: "instagram",
        entry: [
          {
            id: "ig-account-id",
            messaging: [
              {
                sender: { id: "user-1" },
                recipient: { id: "ig-account-id" },
                timestamp: 1,
                postback: { payload: "campaign-1:confirm" }
              }
            ]
          }
        ]
      },
      "ig-account-id"
    );

    expect(events).toEqual([
      {
        type: "message.postback",
        eventId: "postback:user-1:1",
        igUserId: "user-1",
        payload: "campaign-1:confirm"
      }
    ]);
  });

  it("normalizes a quick reply as a postback event", () => {
    const events = normalizeMetaWebhook(
      {
        object: "instagram",
        entry: [
          {
            id: "ig-account-id",
            messaging: [
              {
                sender: { id: "user-1" },
                recipient: { id: "ig-account-id" },
                timestamp: 2,
                message: { quick_reply: { payload: "campaign-1:confirm" } }
              }
            ]
          }
        ]
      },
      "ig-account-id"
    );

    expect(events).toEqual([
      {
        type: "message.postback",
        eventId: "postback:user-1:2",
        igUserId: "user-1",
        payload: "campaign-1:confirm"
      }
    ]);
  });

  it("normalizes a READY text message", () => {
    const events = normalizeMetaWebhook(
      {
        object: "instagram",
        entry: [
          {
            id: "ig-account-id",
            messaging: [
              {
                sender: { id: "user-1" },
                recipient: { id: "ig-account-id" },
                timestamp: 3,
                message: { text: "READY" }
              }
            ]
          }
        ]
      },
      "ig-account-id"
    );

    expect(events).toEqual([
      {
        type: "message.text",
        eventId: "message:user-1:3",
        igUserId: "user-1",
        text: "READY"
      }
    ]);
  });

  it("accepts Instagram messaging events when the recipient id differs from the entry account id", () => {
    const events = normalizeMetaWebhook(
      {
        object: "instagram",
        entry: [
          {
            id: "ig-account-id",
            messaging: [
              {
                sender: { id: "user-1" },
                recipient: { id: "alternate-recipient-id" },
                timestamp: 4,
                message: { text: "CONFIRM" }
              }
            ]
          }
        ]
      },
      "ig-account-id"
    );

    expect(events).toEqual([
      {
        type: "message.text",
        eventId: "message:user-1:4",
        igUserId: "user-1",
        text: "CONFIRM"
      }
    ]);
  });

  it("accepts Instagram messaging events when the entry or recipient id is explicitly allowlisted", () => {
    const events = normalizeMetaWebhook(
      {
        object: "instagram",
        entry: [
          {
            id: "messaging-scoped-id",
            messaging: [
              {
                sender: { id: "user-1" },
                recipient: { id: "alternate-recipient-id" },
                timestamp: 5,
                postback: { payload: "campaign-1:confirm" }
              }
            ]
          }
        ]
      },
      "ig-account-id",
      ["messaging-scoped-id", "alternate-recipient-id"]
    );

    expect(events).toEqual([
      {
        type: "message.postback",
        eventId: "postback:user-1:5",
        igUserId: "user-1",
        payload: "campaign-1:confirm"
      }
    ]);
  });

  it("drops Instagram messaging events that are not scoped to a configured or allowlisted account", () => {
    const events = normalizeMetaWebhook(
      {
        object: "instagram",
        entry: [
          {
            id: "other-account-id",
            messaging: [
              {
                sender: { id: "user-1" },
                recipient: { id: "other-recipient-id" },
                timestamp: 6,
                postback: { payload: "campaign-1:confirm" }
              }
            ]
          }
        ]
      },
      "ig-account-id"
    );

    expect(events).toEqual([]);
  });

  it("drops events that are not scoped to the configured Instagram account", () => {
    const events = normalizeMetaWebhook(
      {
        object: "instagram",
        entry: [
          {
            id: "other-account-id",
            changes: [
              {
                field: "comments",
                value: {
                  id: "comment-1",
                  text: "PROMPT",
                  media: { id: "media-1" },
                  from: { id: "user-1" }
                }
              }
            ]
          }
        ]
      },
      "ig-account-id"
    );

    expect(events).toEqual([]);
  });

  it("does not include raw inbound DM text in durable event IDs", () => {
    const events = normalizeMetaWebhook(
      {
        object: "instagram",
        entry: [
          {
            id: "ig-account-id",
            messaging: [
              {
                sender: { id: "user-1" },
                recipient: { id: "ig-account-id" },
                timestamp: 4,
                message: { text: "READY with private text" }
              }
            ]
          }
        ]
      },
      "ig-account-id"
    );

    expect(events[0]?.eventId).toBe("message:user-1:4");
    expect(events[0]?.eventId).not.toContain("READY");
    expect(events[0]?.eventId).not.toContain("private");
  });
});
