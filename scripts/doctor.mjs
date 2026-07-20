import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REQUIRED_NODE_MAJOR = 22;
const PRIVATE_PATHS = ["wrangler.toml", ".dev.vars", ".env", ".wrangler"];
const D1_DATABASE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function parseDotEnv(text) {
  const values = new Map();
  const duplicates = new Set();
  const malformed = new Set();

  for (const rawLine of text.replace(/^\uFEFF/, "").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const match = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) continue;

    const [, key, rawValue] = match;
    let value = rawValue.trim();
    const quote = value[0];
    if (quote === '"' || quote === "'") {
      let escaped = false;
      let closingQuote = -1;
      for (let index = 1; index < value.length; index += 1) {
        if (escaped) {
          escaped = false;
        } else if (value[index] === "\\") {
          escaped = true;
        } else if (value[index] === quote) {
          closingQuote = index;
          break;
        }
      }
      const trailing = closingQuote >= 1 ? value.slice(closingQuote + 1).trim() : "";
      if (closingQuote < 1 || (trailing && !trailing.startsWith("#"))) {
        value = "";
        malformed.add(key);
      } else {
        value = value.slice(1, closingQuote);
        malformed.delete(key);
      }
    } else {
      value = value.replace(/\s+#.*$/, "").trim();
      malformed.delete(key);
    }

    if (values.has(key)) duplicates.add(key);
    values.set(key, value);
  }

  return { values, duplicates: [...duplicates].sort(), malformed: [...malformed].sort() };
}

function isPlaceholder(value) {
  return !value || /replace-with|replace-after|^change-?me$|^example(?:-|$)/i.test(value);
}

function configured(values, key, minimumLength = 1) {
  const value = values.get(key) ?? "";
  return !isPlaceholder(value) && value.trim().length >= minimumLength;
}

function section(text, heading) {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return text.match(new RegExp(`\\[\\[${escaped}\\]\\]\\s*([\\s\\S]*?)(?=\\n\\s*\\[|$)`))?.[1] ?? "";
}

function quotedValue(text, key) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return text.match(new RegExp(`^\\s*${escaped}\\s*=\\s*"([^"]*)"`, "m"))?.[1] ?? "";
}

export function evaluateSetup({
  nodeVersion,
  wranglerText,
  devVarsText,
  migrationCount,
  wranglerInstalled,
  gitAvailable,
  gitTrackingChecked,
  trackedPrivatePaths,
  ignoredPrivatePaths
}) {
  const checks = [];
  const add = (level, id, message) => checks.push({ level, id, message });
  const nodeMajor = Number.parseInt(nodeVersion.split(".")[0] ?? "", 10);

  if (Number.isInteger(nodeMajor) && nodeMajor >= REQUIRED_NODE_MAJOR) {
    add("pass", "runtime.node", `Node.js ${REQUIRED_NODE_MAJOR}+ is available.`);
  } else {
    add("fail", "runtime.node", `Node.js ${REQUIRED_NODE_MAJOR}+ is required.`);
  }

  if (wranglerInstalled) {
    add("pass", "runtime.wrangler", "The local Wrangler dependency is installed.");
  } else {
    add("fail", "runtime.wrangler", "Local dependencies are missing; run npm install before development.");
  }

  if (migrationCount > 0) {
    add("pass", "project.migrations", `${migrationCount} migration file(s) are available.`);
  } else {
    add("fail", "project.migrations", "No D1 migration files were found.");
  }

  if (!gitAvailable) {
    add("warn", "privacy.git", "Git tracking could not be checked; verify private configuration stays untracked.");
  } else if (!gitTrackingChecked) {
    add("warn", "privacy.tracked", "Git tracking could not be queried; verify private configuration stays untracked.");
  } else if (trackedPrivatePaths.length > 0) {
    add(
      "fail",
      "privacy.tracked",
      `Private configuration is tracked by Git: ${trackedPrivatePaths.join(", ")}. Remove it from the index before pushing.`
    );
  } else {
    add("pass", "privacy.tracked", "Private configuration is not tracked by Git.");
  }

  if (gitAvailable) {
    const missingIgnores = PRIVATE_PATHS.filter((path) => !ignoredPrivatePaths.includes(path));
    if (missingIgnores.length > 0) {
      add(
        "fail",
        "privacy.ignored",
        `Private paths are not ignored by Git: ${missingIgnores.join(", ")}.`
      );
    } else {
      add("pass", "privacy.ignored", "Private configuration paths are ignored by Git.");
    }
  }

  if (wranglerText === null) {
    add("fail", "config.wrangler", "wrangler.toml is absent; copy wrangler.example.toml before local setup or deploy.");
  } else {
    const d1 = section(wranglerText, "d1_databases");
    const producer = section(wranglerText, "queues.producers");
    const consumer = section(wranglerText, "queues.consumers");
    const databaseId = quotedValue(d1, "database_id");
    const producerQueue = quotedValue(producer, "queue");
    const consumerQueue = quotedValue(consumer, "queue");
    const deadLetterQueue = quotedValue(consumer, "dead_letter_queue");

    if (quotedValue(d1, "binding") !== "DB") {
      add("fail", "config.d1-binding", "wrangler.toml must define the D1 binding DB.");
    } else if (isPlaceholder(databaseId) || !D1_DATABASE_ID.test(databaseId)) {
      add("fail", "config.d1-id", "wrangler.toml has a missing, placeholder, or invalid D1 database ID.");
    } else {
      add("pass", "config.d1", "The D1 binding and database ID are configured.");
    }

    if (quotedValue(producer, "binding") !== "DELIVERY_QUEUE") {
      add("fail", "config.queue-binding", "wrangler.toml must define the producer binding DELIVERY_QUEUE.");
    } else if (
      !producerQueue ||
      !consumerQueue ||
      producerQueue !== consumerQueue ||
      !deadLetterQueue ||
      deadLetterQueue === producerQueue
    ) {
      add(
        "fail",
        "config.queue-pair",
        "The producer, consumer, and distinct dead-letter queue names must be configured consistently."
      );
    } else {
      add("pass", "config.queue", "The delivery queue producer and consumer are configured consistently.");
    }

    if (!/crons\s*=\s*\[\s*"\* \* \* \* \*"\s*\]/m.test(wranglerText)) {
      add("fail", "config.cron", "wrangler.toml must keep the every-minute maintenance cron.");
    } else {
      add("pass", "config.cron", "The every-minute maintenance cron is configured.");
    }
  }

  if (devVarsText === null) {
    add(
      "warn",
      "config.local-vars",
      ".dev.vars is absent; local secret readiness was not checked. Remote Wrangler secrets are never inspected."
    );
  } else {
    const { values, duplicates, malformed } = parseDotEnv(devVarsText);
    if (duplicates.length > 0) {
      add("warn", "config.duplicate-vars", `Duplicate local key names use the last value: ${duplicates.join(", ")}.`);
    }
    if (malformed.length > 0) {
      add("fail", "config.malformed-vars", `Malformed quoted assignments were found for key names: ${malformed.join(", ")}.`);
    }

    const required = [
      ["META_APP_SECRET", 16],
      ["META_VERIFY_TOKEN", 8],
      ["INSTAGRAM_ACCESS_TOKEN", 1],
      ["INSTAGRAM_ACCOUNT_ID", 1],
      ["ADMIN_TOKEN", 24],
      ["ADMIN_LOGIN_USERNAME", 3],
      ["ADMIN_LOGIN_PASSWORD", 10],
      ["TOKEN_ENCRYPTION_KEY", 32]
    ];
    const invalid = required.filter(([key, minimum]) => !configured(values, key, minimum)).map(([key]) => key);
    if (invalid.length > 0) {
      add("fail", "config.required-vars", `Required local key names are missing, placeholders, or too short: ${invalid.join(", ")}.`);
    } else {
      add("pass", "config.required-vars", "Required local key names are configured.");
    }

    const instagramAppSecret = values.get("INSTAGRAM_APP_SECRET") ?? "";
    if (instagramAppSecret && !isPlaceholder(instagramAppSecret) && instagramAppSecret.trim().length < 16) {
      add("fail", "config.instagram-app-secret", "INSTAGRAM_APP_SECRET must be at least 16 characters when configured.");
    }

    const automationEnabled = values.get("AUTOMATION_ENABLED");
    if (!new Set(["true", "false"]).has(automationEnabled)) {
      add("fail", "safety.automation", "AUTOMATION_ENABLED must be exactly true or false.");
    } else if (automationEnabled === "true") {
      add("warn", "safety.automation", "Automation is enabled; use false for the first controlled deploy.");
    } else {
      add("pass", "safety.automation", "Automation defaults to the safe disabled state.");
    }

    const autoFinal = values.get("AUTO_FINAL_AFTER_OPENING");
    if (autoFinal && !new Set(["true", "false"]).has(autoFinal)) {
      add("fail", "safety.auto-final", "AUTO_FINAL_AFTER_OPENING must be exactly true or false when configured.");
    } else if (autoFinal === "true") {
      add("warn", "safety.auto-final", "Automatic final delivery is enabled; review the Meta compliance tradeoff.");
    }

    const sendRate = values.get("META_SENDS_PER_MINUTE");
    if (sendRate && (!/^\d+$/.test(sendRate) || Number(sendRate) < 1 || Number(sendRate) > 120)) {
      add("fail", "safety.send-rate", "META_SENDS_PER_MINUTE must be an integer from 1 to 120 when configured.");
    }

    const turnstileSite = configured(values, "TURNSTILE_SITE_KEY");
    const turnstileSecret = configured(values, "TURNSTILE_SECRET_KEY");
    if (turnstileSite !== turnstileSecret) {
      add("fail", "config.turnstile", "Turnstile site and secret key names must be configured together or both omitted.");
    }
  }

  add(
    "warn",
    "scope.remote",
    "Offline check only: Cloudflare resources, remote secrets, Meta permissions, and webhook delivery were not verified."
  );

  return { checks, ok: !checks.some((check) => check.level === "fail") };
}

export function formatReport(report) {
  const labels = { pass: "PASS", warn: "WARN", fail: "FAIL" };
  const lines = report.checks.map((check) => `${labels[check.level]} ${check.id}: ${check.message}`);
  const counts = Object.fromEntries(
    ["pass", "warn", "fail"].map((level) => [level, report.checks.filter((check) => check.level === level).length])
  );
  lines.push(`Summary: ${counts.pass} passed, ${counts.warn} warning(s), ${counts.fail} failure(s).`);
  return lines.join("\n");
}

export function exitCode(report) {
  return report.ok ? 0 : 1;
}

function gitPaths(root, args) {
  try {
    return execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] })
      .split(/\r?\n/)
      .filter(Boolean);
  } catch {
    return null;
  }
}

export function isPrivateTrackedPath(path) {
  const normalized = path.replaceAll("\\", "/");
  const segments = normalized.split("/");
  const basename = segments.at(-1) ?? "";
  return (
    basename === "wrangler.toml" ||
    (/^wrangler\..+\.toml$/.test(basename) && basename !== "wrangler.example.toml") ||
    basename === ".dev.vars" ||
    /^\.dev\.vars\.(?!example$)/.test(basename) ||
    basename === ".env" ||
    /^\.env\.(?!example$)/.test(basename) ||
    segments.includes(".wrangler")
  );
}

function collectInputs(root) {
  let gitAvailable = false;
  try {
    gitAvailable = execFileSync("git", ["rev-parse", "--is-inside-work-tree"], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    }).trim() === "true";
  } catch {
    gitAvailable = false;
  }

  const migrationDirectory = resolve(root, "migrations");
  const migrationCount = existsSync(migrationDirectory)
    ? readdirSync(migrationDirectory).filter((name) => name.endsWith(".sql")).length
    : 0;
  const readOptional = (path) => {
    try {
      return existsSync(path) ? readFileSync(path, "utf8") : null;
    } catch {
      return null;
    }
  };
  const trackedPaths = gitAvailable ? gitPaths(root, ["ls-files"]) : null;

  return {
    nodeVersion: process.versions.node,
    wranglerText: readOptional(resolve(root, "wrangler.toml")),
    devVarsText: readOptional(resolve(root, ".dev.vars")),
    migrationCount,
    wranglerInstalled: existsSync(resolve(root, "node_modules", "wrangler", "package.json")),
    gitAvailable,
    gitTrackingChecked: trackedPaths !== null,
    trackedPrivatePaths: trackedPaths?.filter(isPrivateTrackedPath) ?? [],
    ignoredPrivatePaths: gitAvailable
      ? PRIVATE_PATHS.filter((path) => {
          try {
            execFileSync("git", ["check-ignore", "-q", "--", path], {
              cwd: root,
              stdio: "ignore"
            });
            return true;
          } catch {
            return false;
          }
        })
      : []
  };
}

function printHelp() {
  console.log(`Usage: npm run doctor

Runs an offline, read-only setup and privacy preflight. It never contacts
Cloudflare or Meta, prints configuration values, migrates data, or deploys.`);
}

const scriptPath = fileURLToPath(import.meta.url);
if (process.argv[1] && resolve(process.argv[1]) === scriptPath) {
  const args = process.argv.slice(2);
  if (args.length === 1 && (args[0] === "--help" || args[0] === "-h")) {
    printHelp();
    process.exit(0);
  }
  if (args.length > 0) {
    console.error("Unknown argument. Run npm run doctor -- --help for usage.");
    process.exit(2);
  }

  const root = resolve(dirname(scriptPath), "..");
  const report = evaluateSetup(collectInputs(root));
  console.log(formatReport(report));
  process.exit(exitCode(report));
}
