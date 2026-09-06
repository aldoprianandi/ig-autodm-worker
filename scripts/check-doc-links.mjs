import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const files = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], {
  cwd: root, encoding: "utf8"
}).split("\0").filter((file) => file.endsWith(".md"));
const failures = [];
let checked = 0;
for (const file of new Set(files)) {
  if (!existsSync(resolve(root, file))) continue;
  // Inline Markdown links/images only. External URLs and anchors are excluded;
  // this check does not claim to verify remote availability or heading anchors.
  const markdown = readFileSync(resolve(root, file), "utf8").replace(/^```[^\n]*\n[\s\S]*?^```\s*$/gm, "");
  for (const match of markdown.matchAll(/!?\[[^\]\n]*\]\(([^)\n]+)\)/g)) {
    let target = match[1].trim().replace(/\s+"[^"]*"$/, "").replace(/^<|>$/g, "");
    if (/^(?:[a-z][a-z\d+.-]*:|#|\/\/)/i.test(target)) continue;
    target = target.split(/[?#]/)[0];
    if (!target || target.includes("<")) continue;
    checked++;
    let path;
    try { path = resolve(dirname(resolve(root, file)), decodeURIComponent(target)); }
    catch { failures.push(file + ": invalid encoded link " + target); continue; }
    if (!existsSync(path) || !statSync(path).isFile()) failures.push(file + ": missing file " + target);
  }
}
if (failures.length) {
  console.error(failures.join("\n"));
  process.exitCode = 1;
} else {
  console.log("Documentation links passed (" + checked + " local file references; external URLs and anchors not checked).");
}
