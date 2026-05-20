export type Env = {
  DB: D1Database;
  DELIVERY_QUEUE: Queue<DeliveryJob>;
  META_APP_SECRET?: string;
  INSTAGRAM_APP_SECRET?: string;
  META_VERIFY_TOKEN: string;
  INSTAGRAM_ACCESS_TOKEN: string;
  INSTAGRAM_ACCOUNT_ID: string;
  ADMIN_TOKEN: string;
  ADMIN_LOGIN_USERNAME?: string;
  ADMIN_LOGIN_PASSWORD?: string;
  TURNSTILE_SITE_KEY?: string;
  TURNSTILE_SECRET_KEY?: string;
  AUTOMATION_ENABLED?: string;
  TOKEN_ENCRYPTION_KEY?: string;
  META_SENDS_PER_MINUTE?: string;
  AUTO_FINAL_AFTER_OPENING?: string;
};

export type NormalizedEvent =
  | {
      type: "comment.created";
      eventId: string;
      commentId: string;
      mediaId: string;
      igUserId: string;
      username?: string;
      text: string;
      createdAt?: string;
    }
  | {
      type: "message.postback";
      eventId: string;
      igUserId: string;
      payload: string;
    }
  | {
      type: "message.text";
      eventId: string;
      igUserId: string;
      text: string;
    };

export type DeliveryJob = {
  deliveryId: string;
  campaignId: string;
  igUserId: string;
  deliveryType: "opening" | "comment_reply" | "opening_failure_reply" | "button_step" | "final";
  commentId?: string;
  stepIndex?: number;
};

export type PollResult = {
  campaignsChecked: number;
  commentsSeen: number;
  eventsSubmitted: number;
  commentRepliesQueued: number;
  finalDeliveriesQueued: number;
};
