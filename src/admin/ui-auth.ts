export function adminUiSecurityHeaders(nonce: string, turnstileEnabled = false): HeadersInit {
  const scriptSrc = [`'nonce-${nonce}'`];
  const frameSrc = ["'none'"];
  const extraDirectives: string[] = [];

  if (turnstileEnabled) {
    scriptSrc.push("https://challenges.cloudflare.com");
    frameSrc.splice(0, 1, "https://challenges.cloudflare.com");
  } else {
    extraDirectives.push("require-trusted-types-for 'script'", "trusted-types 'none'");
  }

  return {
    "Cache-Control": "no-store",
    Pragma: "no-cache",
    "Content-Security-Policy": [
      "default-src 'none'",
      "base-uri 'none'",
      "form-action 'none'",
      "frame-ancestors 'none'",
      "img-src 'self' data:",
      "object-src 'none'",
      `script-src ${scriptSrc.join(" ")}`,
      "script-src-attr 'none'",
      `style-src 'nonce-${nonce}'`,
      "style-src-attr 'none'",
      `frame-src ${frameSrc.join(" ")}`,
      "connect-src 'self'",
      ...extraDirectives
    ].join("; "),
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()"
  };
}

export function makeNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(18));
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}
