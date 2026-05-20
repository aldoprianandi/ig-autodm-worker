import { timingSafeEqual } from "./constant-time";

const encoder = new TextEncoder();
type SignableBody = string | ArrayBuffer | Uint8Array;

function toHex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function createMetaSignature(rawBody: SignableBody, appSecret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(appSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const digest = await crypto.subtle.sign("HMAC", key, bodyBuffer(rawBody));
  return `sha256=${toHex(digest)}`;
}

export async function verifyMetaSignature(
  rawBody: SignableBody,
  signatureHeader: string | null,
  appSecret: string
): Promise<boolean> {
  if (!signatureHeader || !signatureHeader.startsWith("sha256=")) return false;

  const expected = await createMetaSignature(rawBody, appSecret);
  return timingSafeEqual(expected, signatureHeader);
}

function bodyBuffer(rawBody: SignableBody): ArrayBuffer {
  if (typeof rawBody === "string") return toArrayBuffer(encoder.encode(rawBody));
  if (rawBody instanceof Uint8Array) return toArrayBuffer(rawBody);
  return rawBody;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}
