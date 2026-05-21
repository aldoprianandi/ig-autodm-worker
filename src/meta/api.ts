import type { Campaign } from "../db/repository";
import { openingButtonPayload } from "../flows/steps";
import { redactSensitiveText } from "../security/redaction";

type UnknownRecord = Record<string, unknown>;

export type MetaUsageBucket = {
  callCount?: number;
  totalCpuTime?: number;
  totalTime?: number;
};

export type MetaUsage = {
  app?: MetaUsageBucket;
  business?: unknown;
  page?: MetaUsageBucket;
  maxUsage: number;
};

export type MetaSendResult =
  | { ok: true; messageId: string; usage?: MetaUsage }
  | { ok: false; retryable: boolean; code: string; message: string; usage?: MetaUsage };

export type MetaTokenRefreshResult =
  | { ok: true; accessToken: string; expiresIn: number }
  | { ok: false; retryable: boolean; code: string; message: string };

export type MetaComment = {
  id: string;
  text: string;
  username?: string;
  userId?: string;
  timestamp?: string;
};

export class MetaApiClient {
  constructor(
    private readonly accountId: string,
    private readonly accessToken: string,
    private readonly apiVersion = "v25.0"
  ) {}

  async sendOpening(commentId: string, campaign: Campaign, text = campaign.openingText): Promise<MetaSendResult> {
    return this.sendButtonTemplate(
      { comment_id: commentId },
      text,
      campaign.buttonTitle,
      openingButtonPayload(campaign)
    );
  }

  async sendButtonMessage(
    igUserId: string,
    text: string,
    buttonTitle: string,
    buttonPayload: string
  ): Promise<MetaSendResult> {
    return this.sendButtonTemplate({ id: igUserId }, text, buttonTitle, buttonPayload);
  }

  async sendText(igUserId: string, text: string): Promise<MetaSendResult> {
    return this.postMessage({
      recipient: { id: igUserId },
      message: { text }
    });
  }

  private async sendButtonTemplate(
    recipient: { id: string } | { comment_id: string },
    text: string,
    buttonTitle: string,
    buttonPayload: string
  ): Promise<MetaSendResult> {
    const button = isHttpUrl(buttonPayload)
      ? {
          type: "web_url",
          title: buttonTitle,
          url: buttonPayload
        }
      : {
          type: "postback",
          title: buttonTitle,
          payload: buttonPayload
        };

    return this.postMessage({
      recipient,
      message: {
        attachment: {
          type: "template",
          payload: {
            template_type: "button",
            text,
            buttons: [button]
          }
        }
      }
    });
  }

  async replyToComment(commentId: string, text: string): Promise<MetaSendResult> {
    const response = await fetch(
      `https://graph.instagram.com/${this.apiVersion}/${encodeURIComponent(commentId)}/replies`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          "Content-Type": "application/x-www-form-urlencoded"
        },
        body: new URLSearchParams({ message: text }).toString()
      }
    );

    return parseMetaSendResponse(response);
  }

  async getUserProfile(igUserId: string): Promise<{ isUserFollowBusiness: boolean | null }> {
    const url = new URL(`https://graph.instagram.com/${this.apiVersion}/${encodeURIComponent(igUserId)}`);
    url.searchParams.set("fields", "is_user_follow_business");

    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${this.accessToken}` }
    });
    if (!response.ok) return { isUserFollowBusiness: null };

    const json = (await response.json()) as { is_user_follow_business?: boolean };
    return { isUserFollowBusiness: json.is_user_follow_business ?? null };
  }

  async refreshLongLivedToken(token = this.accessToken): Promise<MetaTokenRefreshResult> {
    const url = new URL("https://graph.instagram.com/refresh_access_token");
    url.searchParams.set("grant_type", "ig_refresh_token");
    url.searchParams.set("access_token", token);

    const response = await fetch(url.toString());
    const json = (await response.json().catch(() => ({}))) as UnknownRecord & {
      access_token?: string;
      expires_in?: number;
      error?: { code?: number; message?: string };
    };

    if (response.ok && json.access_token && typeof json.expires_in === "number") {
      return { ok: true, accessToken: json.access_token, expiresIn: json.expires_in };
    }

    const code = String(json.error?.code ?? response.status);
    const message = redactSensitiveText(json.error?.message) ?? `Meta token refresh returned ${response.status}`;
    return {
      ok: false,
      retryable: isRetryableMetaError(response.status, code, message),
      code,
      message
    };
  }

  async listMediaComments(mediaId: string, limit = 25): Promise<MetaComment[]> {
    const fieldsWithAuthor = "id,text,username,timestamp,from";
    const primary = await this.fetchComments(mediaId, fieldsWithAuthor, limit);
    if (primary.ok) return primary.comments;

    const fallback = await this.fetchComments(mediaId, "id,text,username,timestamp", limit);
    if (fallback.ok) return fallback.comments;

    throw new Error(fallback.message || primary.message || "Instagram comments fetch failed");
  }

  private async fetchComments(
    mediaId: string,
    fields: string,
    limit: number
  ): Promise<{ ok: true; comments: MetaComment[] } | { ok: false; message: string }> {
      const url = new URL(`https://graph.instagram.com/${this.apiVersion}/${encodeURIComponent(mediaId)}/comments`);
    url.searchParams.set("fields", fields);
    url.searchParams.set("limit", String(Math.min(Math.max(Math.trunc(limit), 1), 50)));

    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${this.accessToken}` }
    });

    const json = (await response.json().catch(() => ({}))) as UnknownRecord & {
      data?: unknown[];
      error?: { message?: string };
    };

    if (!response.ok || !Array.isArray(json.data)) {
      return { ok: false, message: redactSensitiveText(json.error?.message) ?? `Meta API returned ${response.status}` };
    }

    return { ok: true, comments: json.data.map(mapComment).filter((comment) => comment.id && comment.text) };
  }

  private async postMessage(body: unknown): Promise<MetaSendResult> {
    const response = await fetch(
      `https://graph.instagram.com/${this.apiVersion}/${encodeURIComponent(this.accountId)}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(body)
      }
    );

    return parseMetaSendResponse(response);
  }
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

async function parseMetaSendResponse(response: Response): Promise<MetaSendResult> {
  const usage = parseMetaUsage(response.headers);
  const json = (await response.json().catch(() => ({}))) as {
    id?: string;
    message_id?: string;
    error?: { code?: number; message?: string };
  };

  const messageId = json.message_id ?? json.id;
  if (response.ok && messageId) {
    return usage ? { ok: true, messageId, usage } : { ok: true, messageId };
  }

  const code = String(json.error?.code ?? response.status);
  const message = redactSensitiveText(json.error?.message) ?? `Meta API returned ${response.status}`;
  return {
    ok: false,
    retryable: isRetryableMetaError(response.status, code, message),
    code,
    message,
    ...(usage ? { usage } : {})
  };
}

function asRecord(value: unknown): UnknownRecord {
  return value && typeof value === "object" ? (value as UnknownRecord) : {};
}

function mapComment(value: unknown): MetaComment {
  const row = asRecord(value);
  const from = asRecord(row.from);
  return {
    id: String(row.id ?? ""),
    text: String(row.text ?? ""),
    username: row.username ? String(row.username) : from.username ? String(from.username) : undefined,
    userId: from.id ? String(from.id) : undefined,
    timestamp: row.timestamp ? String(row.timestamp) : undefined
  };
}

function isRetryableMetaError(status: number, code: string, message: string): boolean {
  const normalized = message.toLowerCase();
  if (normalized.includes("outside of allowed window")) {
    return false;
  }

  if (isPermanentMetaSendCode(code) || isPermanentMetaSendMessage(normalized)) {
    return false;
  }

  return status === 429 || status >= 500;
}

function isPermanentMetaSendCode(code: string): boolean {
  return ["100", "200", "368", "551"].includes(code);
}

function isPermanentMetaSendMessage(normalizedMessage: string): boolean {
  return (
    normalizedMessage.includes("private replies") ||
    normalizedMessage.includes("too old") ||
    normalizedMessage.includes("invalid for a private reply") ||
    normalizedMessage.includes("unsupported post request") ||
    normalizedMessage.includes("no matching user") ||
    normalizedMessage.includes("requested user cannot be found") ||
    normalizedMessage.includes("cannot receive messages") ||
    normalizedMessage.includes("can't receive messages") ||
    normalizedMessage.includes("isn't receiving messages") ||
    normalizedMessage.includes("not receiving messages") ||
    normalizedMessage.includes("isn't available right now") ||
    normalizedMessage.includes("temporarily blocked from taking this action") ||
    normalizedMessage.includes("blocked from sending messages")
  );
}

function parseMetaUsage(headers: Headers): MetaUsage | undefined {
  const app = parseUsageBucketHeader(headers.get("X-App-Usage"));
  const page = parseUsageBucketHeader(headers.get("X-Page-Usage"));
  const business = parseJsonHeader(headers.get("X-Business-Use-Case-Usage"));
  const maxUsage = Math.max(
    ...usageNumbers(app),
    ...usageNumbers(page),
    ...deepNumbers(business),
    0
  );

  if (!app && !page && !business) return undefined;
  return {
    ...(app ? { app } : {}),
    ...(business ? { business } : {}),
    ...(page ? { page } : {}),
    maxUsage
  };
}

function parseUsageBucketHeader(value: string | null): MetaUsageBucket | undefined {
  const row = parseJsonHeader(value);
  if (!row || Array.isArray(row)) return undefined;

  return {
    ...numberField(row, "call_count", "callCount"),
    ...numberField(row, "total_cputime", "totalCpuTime"),
    ...numberField(row, "total_time", "totalTime")
  };
}

function parseJsonHeader(value: string | null): unknown {
  if (!value) return undefined;

  try {
    return JSON.parse(value) as unknown;
  } catch {
    return undefined;
  }
}

function numberField(row: unknown, source: string, target: keyof MetaUsageBucket): Partial<MetaUsageBucket> {
  const value = asRecord(row)[source];
  return typeof value === "number" && Number.isFinite(value) ? { [target]: value } : {};
}

function usageNumbers(bucket: MetaUsageBucket | undefined): number[] {
  if (!bucket) return [];
  return Object.values(bucket).filter((value): value is number => typeof value === "number" && Number.isFinite(value));
}

function deepNumbers(value: unknown): number[] {
  if (typeof value === "number" && Number.isFinite(value)) return [value];
  if (Array.isArray(value)) return value.flatMap(deepNumbers);
  if (value && typeof value === "object") return Object.values(value).flatMap(deepNumbers);
  return [];
}
