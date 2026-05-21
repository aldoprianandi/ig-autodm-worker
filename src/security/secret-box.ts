export type EncryptedSecret = {
  ciphertext: string;
  encryptedToken: string;
  iv: string;
};

const AES_ALGORITHM = "AES-GCM";
const IV_BYTES = 12;
const MIN_KEY_MATERIAL_CHARS = 32;

export async function encryptSecret(plaintext: string, keyMaterial: string): Promise<EncryptedSecret> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const key = await deriveAesKey(keyMaterial, ["encrypt"]);
  const bytes = new TextEncoder().encode(plaintext);
  const encrypted = await crypto.subtle.encrypt({ name: AES_ALGORITHM, iv }, key, bytes);
  const ciphertext = bytesToBase64(new Uint8Array(encrypted));

  return {
    ciphertext,
    encryptedToken: ciphertext,
    iv: bytesToBase64(iv)
  };
}

export async function decryptSecret(secret: { ciphertext: string; iv: string }, keyMaterial: string): Promise<string> {
  const key = await deriveAesKey(keyMaterial, ["decrypt"]);
  const decrypted = await crypto.subtle.decrypt(
    { name: AES_ALGORITHM, iv: base64ToBytes(secret.iv) },
    key,
    base64ToBytes(secret.ciphertext)
  );

  return new TextDecoder().decode(decrypted);
}

async function deriveAesKey(keyMaterial: string, usages: KeyUsage[]): Promise<CryptoKey> {
  if (!keyMaterial.trim()) {
    throw new Error("TOKEN_ENCRYPTION_KEY is required to decrypt stored Instagram tokens");
  }
  if (keyMaterial.trim().length < MIN_KEY_MATERIAL_CHARS) {
    throw new Error("TOKEN_ENCRYPTION_KEY must be at least 32 characters");
  }

  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(keyMaterial));
  return crypto.subtle.importKey("raw", digest, AES_ALGORITHM, false, usages);
}

function bytesToBase64(bytes: Uint8Array<ArrayBufferLike>): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array<ArrayBuffer> {
  const binary = atob(value);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}
