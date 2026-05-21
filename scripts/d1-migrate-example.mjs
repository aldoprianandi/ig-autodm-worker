import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const persistTo = mkdtempSync(join(tmpdir(), "ig-autodm-worker-d1-"));
const wranglerBin = process.platform === "win32" ? "wrangler.cmd" : "wrangler";

let result;
try {
  result = spawnSync(
    wranglerBin,
    [
      "d1",
      "migrations",
      "apply",
      "DB",
      "--local",
      "--config",
      "wrangler.example.toml",
      "--persist-to",
      persistTo
    ],
    {
      env: { ...process.env, CI: "true" },
      stdio: "inherit"
    }
  );
} finally {
  rmSync(persistTo, { force: true, recursive: true });
}

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);
