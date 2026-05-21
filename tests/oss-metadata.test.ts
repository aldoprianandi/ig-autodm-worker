import { describe, expect, it } from "vitest";
import scanScript from "../scripts/oss-scan.mjs?raw";
import workflow from "../.github/workflows/ci.yml?raw";
import codeowners from "../.github/CODEOWNERS?raw";
import architecture from "../docs/03-architecture.md?raw";

describe("open source safety metadata", () => {
  it("keeps the OSS scanner aligned with sensitive path and secret classes", () => {
    expect(scanScript).toContain(".dev.vars.");
    expect(scanScript).toContain(".env.");
    expect(scanScript).toContain("instagram-access-token");
    expect(scanScript).toContain("meta-app-secret");
    expect(scanScript).toContain("cloudflare-api-token");
    expect(scanScript).toContain("admin-session-cookie");
    expect(scanScript).toContain("repo-secret-assignment");
  });

  it("runs npm registry signature verification in CI after install", () => {
    expect(workflow).toContain("npm ci");
    expect(workflow).toContain("npm audit signatures");
    expect(workflow.indexOf("npm audit signatures")).toBeGreaterThan(workflow.indexOf("npm ci"));
  });

  it("keeps security-sensitive repository files under CODEOWNERS", () => {
    expect(codeowners).toContain("scripts/oss-scan.mjs");
    expect(codeowners).toContain("package*.json");
    expect(codeowners).toContain("SECURITY.md");
    expect(codeowners).toContain(".github/");
  });

  it("documents automatic final fallback as opt-in only", () => {
    expect(architecture).toContain("queue final deliveries only when `AUTO_FINAL_AFTER_OPENING=true`");
    expect(architecture).toContain("Queue final delivery fallback when flag enabled");
  });
});
