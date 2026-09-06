import { execFileSync, spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";

it("checks local Markdown targets while excluding external links, anchors, and fenced examples", () => {
  const fixture = mkdtempSync(join(tmpdir(), "autodm-doc-links-"));
  try {
    execFileSync("git", ["init", "--quiet", fixture]);
    mkdirSync(join(fixture, "scripts"));
    copyFileSync(fileURLToPath(new URL("../scripts/check-doc-links.mjs", import.meta.url)), join(fixture, "scripts/check-doc-links.mjs"));
    writeFileSync(join(fixture, "guide page.md"), "# Guide\n");
    writeFileSync(join(fixture, "README.md"), [
      "[Guide](guide%20page.md#guide)",
      "[External](https://example.invalid)",
      "[Anchor](#heading)",
      "```md", "[Example](not-a-real-file.md)", "```"
    ].join("\n"));
    const run = () => spawnSync(process.execPath, ["scripts/check-doc-links.mjs"], { cwd: fixture, encoding: "utf8" });
    expect(run().status).toBe(0);
    writeFileSync(join(fixture, "README.md"), "![Missing preview](missing.png)\n");
    const failed = run();
    expect(failed.status).toBe(1);
    expect(failed.stderr).toContain("README.md: missing file missing.png");
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});
