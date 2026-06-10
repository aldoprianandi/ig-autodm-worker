import { afterEach, describe, expect, it, vi } from "vitest";
import { MetaApiClient } from "../src/meta/api";

describe("MetaApiClient", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("checks profile follow status without putting access tokens in URLs", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ is_user_follow_business: true }), {
        headers: { "Content-Type": "application/json" }
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const client = new MetaApiClient("ig-account", "secret-token");
    const result = await client.getUserProfile("ig-user");

    expect(result).toEqual({ isUserFollowBusiness: true });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [URL, RequestInit];
    expect(url.toString()).not.toContain("access_token");
    expect(init.headers).toEqual({ Authorization: "Bearer secret-token" });
  });

  it("fetches media comments with authorization headers through primary and fallback requests", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({ error: { message: "Field from is not available" } }, { status: 400 })
      )
      .mockResolvedValueOnce(
        Response.json({
          data: [{ id: "comment-1", text: "Blue Green", username: "testuser", timestamp: "2026-05-08T04:00:00+0000" }]
        })
      );
    vi.stubGlobal("fetch", fetchMock);

    const client = new MetaApiClient("ig-account", "secret-token");
    const comments = await client.listMediaComments("media-1");

    expect(comments).toEqual([
      {
        id: "comment-1",
        text: "Blue Green",
        username: "testuser",
        userId: undefined,
        timestamp: "2026-05-08T04:00:00+0000"
      }
    ]);

    for (const [url, init] of fetchMock.mock.calls as unknown as Array<[URL, RequestInit]>) {
      expect(url.toString()).not.toContain("access_token");
      expect(init.headers).toEqual({ Authorization: "Bearer secret-token" });
    }
  });

  it("redacts sensitive values from Meta send errors before returning them", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json(
          { error: { code: 400, message: "bad token access_token=secret-token Bearer another-secret" } },
          { status: 400 }
        )
      )
    );

    const client = new MetaApiClient("ig-account", "secret-token");
    const result = await client.sendText("ig-user", "hello");

    expect(result).toEqual({
      ok: false,
      retryable: false,
      code: "400",
      message: "bad token access_token=[REDACTED] Bearer [REDACTED]"
    });
  });

  it("does not retry message-window blocks", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json(
          { error: { code: 10, message: "This message is sent outside of allowed window." } },
          { status: 400 }
        )
      )
    );

    const client = new MetaApiClient("ig-account", "secret-token");
    const result = await client.sendText("ig-user", "hello");

    expect(result).toEqual({
      ok: false,
      retryable: false,
      code: "10",
      message: "This message is sent outside of allowed window."
    });
  });

  it("does not retry permanent Meta send errors even when the HTTP status is retryable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json(
          {
            error: {
              code: 100,
              message:
                "Unsupported post request. Object with ID 'comment-1' does not exist, cannot be loaded due to missing permissions, or does not support this operation"
            }
          },
          { status: 500 }
        )
      )
    );

    const client = new MetaApiClient("ig-account", "secret-token");
    const result = await client.replyToComment("comment-1", "Cek DM kamu ya");

    expect(result).toEqual({
      ok: false,
      retryable: false,
      code: "100",
      message:
        "Unsupported post request. Object with ID 'comment-1' does not exist, cannot be loaded due to missing permissions, or does not support this operation"
    });
  });

  it("does not retry invalid private-reply comment errors even when Meta returns a server status", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json(
          {
            error: {
              code: 100,
              message: "The comment is invalid for a private reply"
            }
          },
          { status: 500 }
        )
      )
    );

    const client = new MetaApiClient("ig-account", "secret-token");
    const result = await client.sendOpening("comment-1", {
      id: "campaign-1",
      name: "Campaign",
      mediaId: "media-1",
      keyword: "PROMPT",
      openingText: "Opening",
      openingTextVariants: ["Opening"],
      buttonTitle: "SEND IT",
      buttonPayload: "campaign-1:confirm",
      dmSteps: [],
      deliveryText: "Prompt",
      commentReplyTextVariants: [],
      followGateEnabled: false,
      enabled: true
    });

    expect(result).toEqual({
      ok: false,
      retryable: false,
      code: "100",
      message: "The comment is invalid for a private reply"
    });
  });

  it("does not automatically retry Meta temporary-block errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json(
          {
            error: {
              code: 368,
              message: "Based on previous use of this feature, your account has been temporarily blocked from taking this action."
            }
          },
          { status: 500 }
        )
      )
    );

    const client = new MetaApiClient("ig-account", "secret-token");
    const result = await client.sendText("ig-user", "hello");

    expect(result).toEqual({
      ok: false,
      retryable: false,
      code: "368",
      message: "Based on previous use of this feature, your account has been temporarily blocked from taking this action."
    });
  });

  it("replies to comments without putting access tokens in URLs", async () => {
    const fetchMock = vi.fn(async () => Response.json({ id: "reply-1" }));
    vi.stubGlobal("fetch", fetchMock);

    const client = new MetaApiClient("ig-account", "secret-token");
    const result = await client.replyToComment("comment-1", "Cek DM kamu ya");

    expect(result).toEqual({ ok: true, messageId: "reply-1" });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://graph.instagram.com/v25.0/comment-1/replies");
    expect(url).not.toContain("access_token");
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({
      Authorization: "Bearer secret-token",
      "Content-Type": "application/x-www-form-urlencoded"
    });
    expect(init.body).toBe("message=Cek+DM+kamu+ya");
  });

  it("uses a web URL button when the opening button payload is a URL", async () => {
    const fetchMock = vi.fn(async () => Response.json({ message_id: "message-1" }));
    vi.stubGlobal("fetch", fetchMock);

    const client = new MetaApiClient("ig-account", "secret-token");
    await client.sendOpening("comment-1", {
      id: "campaign-1",
      name: "Campaign",
      mediaId: "media-1",
      keyword: "PROMPT",
      openingText: "Saya mau ke tembok ratapan itu!",
      openingTextVariants: ["Saya mau ke tembok ratapan itu!"],
      buttonTitle: "TEMBOK",
      buttonPayload: "https://example.com/prompt",
      dmSteps: [],
      deliveryText: "Prompt link",
      commentReplyTextVariants: [],
      followGateEnabled: false,
      enabled: true
    });

    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toMatchObject({
      recipient: { comment_id: "comment-1" },
      message: {
        attachment: {
          payload: {
            text: "Saya mau ke tembok ratapan itu!",
            buttons: [
              {
                type: "web_url",
                title: "TEMBOK",
                url: "https://example.com/prompt"
              }
            ]
          }
        }
      }
    });
  });

  it("refreshes long-lived tokens through the documented refresh endpoint", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      expect(url).toContain("https://graph.instagram.com/refresh_access_token");
      expect(url).toContain("grant_type=ig_refresh_token");
      expect(url).toContain("access_token=old-token");
      return Response.json({ access_token: "new-token", token_type: "bearer", expires_in: 5_184_000 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const client = new MetaApiClient("ig-account", "old-token");
    const result = await client.refreshLongLivedToken("old-token");

    expect(result).toEqual({ ok: true, accessToken: "new-token", expiresIn: 5_184_000 });
  });

  it("parses Meta usage headers for throttling decisions", async () => {
    const fetchMock = vi.fn(async () =>
      Response.json(
        { message_id: "message-1" },
        {
          headers: {
            "X-App-Usage": JSON.stringify({ call_count: 91, total_cputime: 10, total_time: 20 })
          }
        }
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    const client = new MetaApiClient("ig-account", "secret-token");
    const result = await client.sendText("ig-user", "hello");

    expect(result).toEqual({
      ok: true,
      messageId: "message-1",
      usage: { app: { callCount: 91, totalCpuTime: 10, totalTime: 20 }, maxUsage: 91 }
    });
  });
});
