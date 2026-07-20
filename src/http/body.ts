export async function readLimitedBody(
  request: Request,
  maxBytes: number
): Promise<{ ok: true; bytes: ArrayBuffer } | { ok: false }> {
  const contentLength = request.headers.get("Content-Length");
  if (contentLength) {
    const parsed = Number.parseInt(contentLength, 10);
    if (Number.isFinite(parsed) && parsed > maxBytes) return { ok: false };
  }

  const body = request.body;
  if (!body) {
    const bytes = await request.arrayBuffer();
    if (bytes.byteLength > maxBytes) return { ok: false };
    return { ok: true, bytes };
  }

  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.byteLength;
    if (totalBytes > maxBytes) {
      await reader.cancel();
      return { ok: false };
    }
    chunks.push(value);
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { ok: true, bytes: bytes.buffer };
}
