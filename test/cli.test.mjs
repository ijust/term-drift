import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync, execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const CLI = path.join(ROOT, "bin", "cli.mjs");
const FIX = path.join(__dirname, "fixtures", "apply-repo");
const DICT = path.join(FIX, "dictionary.json");

function tmpCopy({ git = false } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "term-drift-cli-"));
  fs.cpSync(FIX, dir, { recursive: true });
  if (git) {
    execFileSync("git", ["init", "-q"], { cwd: dir });
    execFileSync("git", ["add", "-A"], { cwd: dir });
  }
  return dir;
}

function cli(args, cwd) {
  return spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: "utf8" });
}

test("apply は未知の余剰引数を拒否し、--dry-run と誤認して書き込まない", () => {
  const dir = tmpCopy({ git: true });
  const file = path.join(dir, "doc-a.md");
  const before = fs.readFileSync(file, "utf8");
  const result = cli(["apply", DICT, dir, "--dry-run"], dir);
  assert.equal(result.status, 1);
  assert.equal(fs.readFileSync(file, "utf8"), before);
});

test("apply はdirtyな追跡済み文書へ警告付きで適用し、終了コード0を返す", () => {
  const dir = tmpCopy({ git: true });
  const file = path.join(dir, "doc-a.md");
  fs.appendFileSync(file, "未コミットのメモ\n");
  const result = cli(["apply", DICT, dir], dir);
  assert.equal(result.status, 0);
  const output = JSON.parse(result.stdout);
  assert.ok(output.warningsDirty.includes("doc-a.md"));
  assert.ok(output.changes.some((c) => c.decisionSource === "human-approved"));
  assert.ok(output.changes.some((c) => c.decisionSource === "delegated-agent" && c.delegationScope === "test fixture repository terminology review"));
  assert.match(result.stderr, /警告: 未ステージ変更/);
  assert.match(fs.readFileSync(file, "utf8"), /未コミットのメモ/);
});

test("recheck は残存または無効マーカーがあれば終了コード3を返す", () => {
  const dir = tmpCopy({ git: true });
  const result = cli(["recheck", DICT, dir], dir);
  assert.equal(result.status, 3);
  const output = JSON.parse(result.stdout);
  assert.ok(output.remaining.length > 0 || output.invalidMarkers.length > 0);
});

test("rules は init 後の対象リポ固有 rules を単一正本として返す", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "term-drift-rules-"));
  assert.equal(cli(["init", dir], dir).status, 0);
  const result = cli(["rules", dir], dir);
  assert.equal(result.status, 0);
  const output = JSON.parse(result.stdout);
  assert.equal(output.source, "repository");
  assert.ok(output.rules.every((p) => p.startsWith(path.join(dir, ".term-drift", "rules"))));
});
