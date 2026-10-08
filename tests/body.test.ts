import { describe, expect, it } from "vitest";
import { readLimitedBody } from "../src/http/body";

function streamOf(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    }
  });
}

describe("readLimitedBody", () => {
  it("rejects early when Content-Length exceeds the limit", async () => {
    const request = new Request("https://example.test/", {
      method: "POST",
      headers: { "Content-Length": "999" },
      body: "small"
    });

    expect(await readLimitedBody(request, 10)).toEqual({ ok: false });
  });

  it("ignores a non-numeric Content-Length and enforces the limit while streaming", async () => {
    const request = new Request("https://example.test/", {
      method: "POST",
      headers: { "Content-Length": "not-a-number" },
      body: "hello"
    });

    const result = await readLimitedBody(request, 10);
    expect(result.ok).toBe(true);
    if (result.ok) expect(new TextDecoder().decode(result.bytes)).toBe("hello");
  });

  it("returns an empty buffer when the request has no body", async () => {
    const result = await readLimitedBody(new Request("https://example.test/"), 10);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.bytes.byteLength).toBe(0);
  });

  it("joins streamed chunks within the limit", async () => {
    const request = new Request("https://example.test/", {
      method: "POST",
      body: streamOf(["ab", "cd", "ef"]),
      duplex: "half"
    } as RequestInit);

    const result = await readLimitedBody(request, 6);
    expect(result.ok).toBe(true);
    if (result.ok) expect(new TextDecoder().decode(result.bytes)).toBe("abcdef");
  });

  it("stops reading once streamed chunks exceed the limit", async () => {
    const request = new Request("https://example.test/", {
      method: "POST",
      body: streamOf(["abcd", "efgh"]),
      duplex: "half"
    } as RequestInit);

    expect(await readLimitedBody(request, 6)).toEqual({ ok: false });
  });
});
