import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const trackedFiles = execFileSync("git", ["ls-files"], { encoding: "utf8" })
  .split("\n")
  .filter(Boolean);
const candidateFiles = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], {
  encoding: "utf8"
})
  .split("\n")
  .filter(Boolean);

const forbiddenPaths = [
  ".dev.vars",
  ".env",
  ".wrangler",
  "node_modules",
  "wrangler.toml",
  "docs/08-current-deployment.md",
  "docs/11-security-review-2026-05-08.md",
  "docs/superpowers"
];

const forbiddenPathPatterns = [
  { id: ".dev.vars.*", pattern: /(^|\/)\.dev\.vars\.(?!example$)/ },
  { id: ".env.*", pattern: /(^|\/)\.env\.(?!example$)/ }
];

const forbiddenText = [
  {
    id: "specific-worker-url",
    pattern: /https:\/\/ig-autodm-worker\.(?!<cloudflare-account>)[A-Za-z0-9-]+\.workers\.dev/i
  },
  {
    id: "real-d1-database-id",
    pattern: /database_id\s*=\s*"(?!(?:replace-after-wrangler-d1-create)")[0-9a-f]{8}-[0-9a-f-]{27}"/i
  }
];

const credentialPatterns = [
  { id: "openai-api-key", pattern: /sk-[A-Za-z0-9_-]{20,}/ },
  { id: "github-token", pattern: /ghp_[A-Za-z0-9_]{20,}/ },
  { id: "github-fine-grained-token", pattern: /github_pat_[A-Za-z0-9_]{30,}/ },
  { id: "slack-token", pattern: /xox[baprs]-[A-Za-z0-9-]{20,}/ },
  { id: "aws-access-key", pattern: /AKIA[0-9A-Z]{16}/ },
  { id: "google-api-key", pattern: /AIza[0-9A-Za-z_-]{35}/ },
  { id: "instagram-access-token", pattern: /\b(?:IGAA|EAA|IGQVJ)[A-Za-z0-9._-]{40,}\b/ },
  { id: "meta-app-secret", pattern: /["']?(?:META_APP_SECRET|INSTAGRAM_APP_SECRET|APP_SECRET|CLIENT_SECRET)["']?\s*[:=]\s*["']?(?!replace-with|test-)[a-f0-9]{32,}/i },
  { id: "cloudflare-api-token", pattern: /\b(?:cf_[A-Za-z0-9_-]{32,}|CLOUDFLARE_API_TOKEN\s*[:=]\s*["']?(?!replace-with|test-)[A-Za-z0-9._-]{20,})/i },
  { id: "repo-secret-assignment", pattern: /["']?(?:ADMIN_TOKEN|META_VERIFY_TOKEN|TOKEN_ENCRYPTION_KEY|ADMIN_LOGIN_PASSWORD|TURNSTILE_SECRET_KEY)["']?\s*[:=]\s*["']?(?!replace-with|test-|verify-token|wrong-token|short|admin\b)[A-Za-z0-9._~+/=-]{24,}/i },
  { id: "admin-session-cookie", pattern: /\big_admin_session=[A-Za-z0-9._-]{20,}/ },
  { id: "admin-bearer-token", pattern: /\bAuthorization:\s*Bearer\s+(?!<|replace-with|test-)[A-Za-z0-9._-]{24,}/i },
  { id: "private-key", pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ }
];

const binaryExtensions = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico"]);
const findings = [];

for (const path of candidateFiles) {
  if (forbiddenPaths.some((forbidden) => path === forbidden || path.startsWith(`${forbidden}/`))) {
    findings.push(`forbidden tracked path: ${path}`);
    continue;
  }
  for (const rule of forbiddenPathPatterns) {
    if (rule.pattern.test(path)) findings.push(`forbidden path rule "${rule.id}" in ${path}`);
  }

  const lower = path.toLowerCase();
  if ([...binaryExtensions].some((extension) => lower.endsWith(extension))) continue;

  const text = readFileSync(path, "utf8");
  for (const rule of forbiddenText) {
    if (rule.pattern.test(text)) findings.push(`forbidden text rule "${rule.id}" in ${path}`);
  }

  for (const rule of credentialPatterns) {
    if (rule.pattern.test(text)) findings.push(`credential-like rule "${rule.id}" in ${path}`);
  }
}

if (findings.length) {
  console.error("OSS scan failed:");
  for (const finding of findings) console.error(`- ${finding}`);
  process.exit(1);
}

console.log(`OSS scan passed (${candidateFiles.length} files checked, ${trackedFiles.length} tracked).`);
