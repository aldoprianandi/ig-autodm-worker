import { describe, expect, it } from "vitest";
import {
  evaluateSetup,
  exitCode,
  formatReport,
  isPrivateTrackedPath,
  parseDotEnv
} from "../scripts/doctor.mjs";

const databaseId = ["123e4567", "e89b", "42d3", "a456", "426614174000"].join("-");
const validWrangler = `
[triggers]
crons = ["* * * * *"]

[[d1_databases]]
binding = "DB"
database_id = "${databaseId}"

[[queues.producers]]
binding = "DELIVERY_QUEUE"
queue = "test-deliveries"

[[queues.consumers]]
queue = "test-deliveries"
dead_letter_queue = "test-deliveries-dlq"
`;

const validVars = `
META_APP_SECRET="test-meta-app-secret-value"
META_VERIFY_TOKEN="test-verify-token"
INSTAGRAM_ACCESS_TOKEN="test-access-token"
INSTAGRAM_ACCOUNT_ID="test-account-id"
ADMIN_TOKEN="test-admin-token-with-safe-length"
ADMIN_LOGIN_USERNAME="test-admin"
ADMIN_LOGIN_PASSWORD="test-admin-password"
AUTOMATION_ENABLED="false"
TOKEN_ENCRYPTION_KEY="test-encryption-key-material-at-least-32-characters"
META_SENDS_PER_MINUTE="30"
AUTO_FINAL_AFTER_OPENING="false"
`;

const baseInput = {
  nodeVersion: "22.0.0",
  wranglerText: validWrangler,
  devVarsText: validVars,
  migrationCount: 15,
  wranglerInstalled: true,
  gitAvailable: true,
  gitTrackingChecked: true,
  trackedPrivatePaths: [],
  ignoredPrivatePaths: ["wrangler.toml", ".dev.vars", ".env", ".wrangler"]
};

describe("doctor dotenv parser", () => {
  it("handles BOM, CRLF, exports, comments, quoted values, and duplicates", () => {
    const parsed = parseDotEnv(
      '\uFEFFexport FIRST="value with # and =" # comment\r\nSECOND=old\r\nSECOND=new # comment\r\n# ignored\r\n'
    );

    expect(parsed.values.get("FIRST")).toBe("value with # and =");
    expect(parsed.values.get("SECOND")).toBe("new");
    expect(parsed.duplicates).toEqual(["SECOND"]);
    expect(parsed.malformed).toEqual([]);
  });

  it("marks unterminated and trailing quoted assignments as malformed", () => {
    const parsed = parseDotEnv('FIRST="unterminated\nSECOND="valid" trailing\nTHIRD="valid" # comment\n');

    expect(parsed.malformed).toEqual(["FIRST", "SECOND"]);
    expect(parsed.values.get("THIRD")).toBe("valid");
  });
});

describe("doctor evaluation", () => {
  it("passes a safe local setup without exposing values", () => {
    const report = evaluateSetup(baseInput);
    const output = formatReport(report);

    expect(report.ok).toBe(true);
    expect(output).toContain("0 failure(s)");
    expect(output).not.toContain("test-admin-token-with-safe-length");
    expect(output).not.toContain(databaseId);
  });

  it("fails unsupported runtimes, placeholders, and tracked private files", () => {
    const report = evaluateSetup({
      ...baseInput,
      nodeVersion: "21.9.0",
      wranglerText: validWrangler.replace(databaseId, "replace-after-wrangler-d1-create"),
      trackedPrivatePaths: ["wrangler.toml"]
    });

    expect(report.ok).toBe(false);
    expect(report.checks.map((check) => check.id)).toEqual(
      expect.arrayContaining(["runtime.node", "privacy.tracked", "config.d1-id"])
    );
  });

  it("rejects malformed D1 identifiers without printing them", () => {
    const report = evaluateSetup({
      ...baseInput,
      wranglerText: validWrangler.replace(databaseId, "not-a-database-id")
    });
    const output = formatReport(report);

    expect(report.ok).toBe(false);
    expect(report.checks.map((check) => check.id)).toContain("config.d1-id");
    expect(output).not.toContain("not-a-database-id");
  });

  it("warns when local private config is intentionally absent", () => {
    const report = evaluateSetup({ ...baseInput, wranglerText: null, devVarsText: null });

    expect(report.ok).toBe(false);
    expect(report.checks.filter((check) => check.level === "warn").map((check) => check.id)).toEqual(
      expect.arrayContaining(["config.local-vars", "scope.remote"])
    );
    expect(exitCode(report)).toBe(1);
  });

  it("fails incomplete secret names and unsafe optional configuration", () => {
    const report = evaluateSetup({
      ...baseInput,
      devVarsText: `${validVars}
ADMIN_TOKEN="short"
TURNSTILE_SITE_KEY="test-site-key"
AUTO_FINAL_AFTER_OPENING="sometimes"
META_SENDS_PER_MINUTE="500"
`
    });

    expect(report.ok).toBe(false);
    expect(report.checks.map((check) => check.id)).toEqual(
      expect.arrayContaining(["config.required-vars", "config.turnstile", "safety.auto-final", "safety.send-rate"])
    );
  });

  it("warns but does not fail for intentionally enabled automation flags", () => {
    const report = evaluateSetup({
      ...baseInput,
      devVarsText: validVars.replace('AUTOMATION_ENABLED="false"', 'AUTOMATION_ENABLED="true"').replace(
        'AUTO_FINAL_AFTER_OPENING="false"',
        'AUTO_FINAL_AFTER_OPENING="true"'
      )
    });

    expect(report.ok).toBe(true);
    expect(report.checks.filter((check) => check.level === "warn").map((check) => check.id)).toEqual(
      expect.arrayContaining(["safety.automation", "safety.auto-final"])
    );
  });

  it("never includes a secret canary in validation output", () => {
    const canary = "test-unique-secret-canary-value-that-must-stay-hidden";
    const report = evaluateSetup({
      ...baseInput,
      devVarsText: [
        "META_APP_SECRET",
        "META_VERIFY_TOKEN",
        "INSTAGRAM_ACCESS_TOKEN",
        "INSTAGRAM_ACCOUNT_ID",
        "ADMIN_TOKEN",
        "ADMIN_LOGIN_USERNAME",
        "ADMIN_LOGIN_PASSWORD",
        "TOKEN_ENCRYPTION_KEY",
        "AUTOMATION_ENABLED",
        "TURNSTILE_SITE_KEY"
      ].map((key) => `${key}="${canary}"`).join("\n")
    });

    expect(report.ok).toBe(false);
    expect(formatReport(report)).not.toContain(canary);
  });

  it("recognizes nested and environment-specific private paths", () => {
    expect(isPrivateTrackedPath("nested/.env")).toBe(true);
    expect(isPrivateTrackedPath("nested/.dev.vars.production")).toBe(true);
    expect(isPrivateTrackedPath("nested/wrangler.production.toml")).toBe(true);
    expect(isPrivateTrackedPath("nested/.wrangler/state.json")).toBe(true);
    expect(isPrivateTrackedPath("wrangler.example.toml")).toBe(false);
    expect(isPrivateTrackedPath("nested/.env.example")).toBe(false);
  });

  it("does not report a privacy pass when Git tracking cannot be queried", () => {
    const report = evaluateSetup({ ...baseInput, gitTrackingChecked: false });
    const privacyCheck = report.checks.find((check) => check.id === "privacy.tracked");

    expect(privacyCheck?.level).toBe("warn");
  });
});
