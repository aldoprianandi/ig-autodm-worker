import { timingSafeEqual } from "./constant-time";

type SignedRequestPayload = Record<string, unknown> & {
  algorithm?: string;
  user_id?: string;
};

export type SignedRequestResult =
  | { ok: true; payload: SignedRequestPayload }
  | { ok: false; error: "missing" | "malformed" | "unsupported_algorithm" | "invalid_signature" };

export async function parseMetaSignedRequest(
  signedRequest: string | null | undefined,
  appSecret: string
): Promise<SignedRequestResult> {
  if (!signedRequest) return { ok: false, error: "missing" };

  const parts = signedRequest.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    return { ok: false, error: "malformed" };
  }

  const [encodedSignature, encodedPayload] = parts;

  let payload: SignedRequestPayload;
  let actualSignatureHex: string;
  try {
    payload = JSON.parse(base64UrlToText(encodedPayload)) as SignedRequestPayload;
    actualSignatureHex = bytesToHex(base64UrlToBytes(encodedSignature));
  } catch {
    return { ok: false, error: "malformed" };
  }

  if (String(payload.algorithm ?? "").toUpperCase() !== "HMAC-SHA256") {
    return { ok: false, error: "unsupported_algorithm" };
  }

  const expectedSignatureHex = await hmacSha256Hex(appSecret, encodedPayload);
  if (!timingSafeEqual(actualSignatureHex, expectedSignatureHex)) {
    return { ok: false, error: "invalid_signature" };
  }

  return { ok: true, payload };
}

async function hmacSha256Hex(key: string, text: string): Promise<string> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(text));
  return bytesToHex(new Uint8Array(signature));
}

function base64UrlToText(value: string): string {
  return new TextDecoder().decode(base64UrlToBytes(value));
}

function base64UrlToBytes(value: string): Uint8Array {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padding = base64.length % 4 === 0 ? "" : "=".repeat(4 - (base64.length % 4));
  const binary = atob(base64 + padding);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function bytesToHex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
