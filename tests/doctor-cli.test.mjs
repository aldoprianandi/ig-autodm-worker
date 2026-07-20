import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

describe("doctor CLI", () => {
  it("uses stable exit codes for help and unknown arguments", () => {
    const script = fileURLToPath(new URL("../scripts/doctor.mjs", import.meta.url));
    const help = spawnSync(process.execPath, [script, "--help"], { encoding: "utf8" });
    const unknown = spawnSync(process.execPath, [script, "--help", "--unknown"], { encoding: "utf8" });

    expect(help.status).toBe(0);
    expect(unknown.status).toBe(2);
  });
});
