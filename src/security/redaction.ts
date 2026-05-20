const REDACTION = "[REDACTED]";

export function redactSensitiveText(value: string | undefined): string | undefined {
  if (!value) return value;

  return value
    .replace(/IGAA[A-Za-z0-9._-]+/g, REDACTION)
    .replace(/\b(?:EAA|IGQVJ)[A-Za-z0-9._-]{12,}\b/g, REDACTION)
    .replace(/(access_token=)[^&\s]+/gi, `$1${REDACTION}`)
    .replace(/(appsecret_proof=)[^&\s]+/gi, `$1${REDACTION}`)
    .replace(/Bearer\s+[A-Za-z0-9._~+/-]+/gi, `Bearer ${REDACTION}`)
    .replace(
      /((?:access[_-]?token|admin[_-]?token|app[_-]?secret|client[_-]?secret)"?\s*[:=]\s*"?)[^"\s&,}]+/gi,
      `$1${REDACTION}`
    );
}
