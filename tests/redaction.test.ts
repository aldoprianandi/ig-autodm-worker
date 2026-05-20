import { describe, expect, it } from "vitest";
import { redactSensitiveText } from "../src/security/redaction";

describe("redactSensitiveText", () => {
  it("redacts documented token and secret patterns", () => {
    const input = [
      "IGAAabcdef123456",
      "EAAabcdef1234567890",
      "IGQVJabcdef1234567890",
      "access_token=secret-token",
      "appsecret_proof=proof-token",
      "Bearer bearer-token",
      '"admin_token":"admin-secret"',
      "client_secret=client-secret"
    ].join(" ");

    const output = redactSensitiveText(input);

    expect(output).not.toContain("abcdef1234567890");
    expect(output).not.toContain("secret-token");
    expect(output).not.toContain("proof-token");
    expect(output).not.toContain("bearer-token");
    expect(output).not.toContain("admin-secret");
    expect(output).not.toContain("client-secret");
    expect(output).toContain("[REDACTED]");
  });
});
