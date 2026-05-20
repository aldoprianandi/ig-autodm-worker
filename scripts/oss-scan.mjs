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
  { id: "slack-token", pattern: /xox[baprs]-[A-Za-z0-9-]{20,}/ },
  { id: "aws-access-key", pattern: /AKIA[0-9A-Z]{16}/ },
  { id: "private-key", pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ }
];

const binaryExtensions = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico"]);
const findings = [];

for (const path of candidateFiles) {
  if (forbiddenPaths.some((forbidden) => path === forbidden || path.startsWith(`${forbidden}/`))) {
    findings.push(`forbidden tracked path: ${path}`);
    continue;
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
