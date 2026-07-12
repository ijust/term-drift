import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { AGENT_SKILL_PATHS, installTermDrift } from "../src/install.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const CLI = path.join(ROOT, "bin", "cli.mjs");

function tmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "term-drift-install-"));
}

function cli(args, cwd) {
  return spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: "utf8" });
}

test("引数なしは Claude Code 向けに project-local install する", () => {
  const dir = tmp();
  const result = cli([], dir);
  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.equal(output.installed, true);
  assert.equal(output.agent, "claude");
  assert.ok(fs.existsSync(path.join(dir, ".term-drift", "rules", "detect.md")));
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir, ".term-drift", "version.json"), "utf8")), { package: "term-drift", version: "0.1.3" });
  assert.ok(fs.existsSync(path.join(dir, AGENT_SKILL_PATHS.claude, "SKILL.md")));
  assert.match(result.stderr, /インストール完了/);
});

for (const agent of ["claude", "codex", "gemini"]) {
  test(`--${agent} は選択した agent の skill だけを配置する`, () => {
    const dir = tmp();
    const result = cli([`--${agent}`], dir);
    assert.equal(result.status, 0, result.stderr);
    for (const [name, rel] of Object.entries(AGENT_SKILL_PATHS)) {
      assert.equal(fs.existsSync(path.join(dir, rel, "SKILL.md")), name === agent);
    }
  });
}

test("既存台帳と無関係なファイルを1バイトも変更しない", () => {
  const dir = tmp();
  fs.mkdirSync(path.join(dir, ".term-drift"));
  const ledger = path.join(dir, ".term-drift", "glossary.md");
  const unrelated = path.join(dir, "important.txt");
  fs.writeFileSync(ledger, "利用者が育てた台帳\n");
  fs.writeFileSync(unrelated, "変更禁止\n");
  const beforeLedger = fs.readFileSync(ledger);
  const beforeUnrelated = fs.readFileSync(unrelated);
  const result = installTermDrift(dir, "codex");
  assert.equal(result.installed, true);
  assert.deepEqual(fs.readFileSync(ledger), beforeLedger);
  assert.deepEqual(fs.readFileSync(unrelated), beforeUnrelated);
});

test(".intent/glossary.md があれば二重台帳を作らない", () => {
  const dir = tmp();
  fs.mkdirSync(path.join(dir, ".intent"));
  const ledger = path.join(dir, ".intent", "glossary.md");
  fs.writeFileSync(ledger, "既存の正本\n");
  installTermDrift(dir, "gemini");
  assert.equal(fs.readFileSync(ledger, "utf8"), "既存の正本\n");
  assert.equal(fs.existsSync(path.join(dir, ".term-drift", "glossary.md")), false);
});

test("同内容への再インストールは冪等", () => {
  const dir = tmp();
  installTermDrift(dir, "claude");
  const skill = path.join(dir, AGENT_SKILL_PATHS.claude, "SKILL.md");
  const before = fs.readFileSync(skill);
  const result = installTermDrift(dir, "claude");
  assert.equal(result.installed, true);
  assert.ok(result.skipped.includes(AGENT_SKILL_PATHS.claude));
  assert.deepEqual(fs.readFileSync(skill), before);
});

test("異なるバージョン記録は上書きせず、skill 配置前に拒否する", () => {
  const dir = tmp();
  fs.mkdirSync(path.join(dir, ".term-drift"));
  const version = path.join(dir, ".term-drift", "version.json");
  fs.writeFileSync(version, '{"package":"term-drift","version":"0.1.2"}\n');
  assert.throws(() => installTermDrift(dir, "gemini"), /既存のバージョン記録と異なるため上書きしません/);
  assert.equal(fs.readFileSync(version, "utf8"), '{"package":"term-drift","version":"0.1.2"}\n');
  assert.equal(fs.existsSync(path.join(dir, AGENT_SKILL_PATHS.gemini)), false);
});

test("内容が異なる既存 skill は上書きせず、.term-drift へ書く前に拒否する", () => {
  const dir = tmp();
  const skillDir = path.join(dir, AGENT_SKILL_PATHS.codex);
  fs.mkdirSync(skillDir, { recursive: true });
  fs.writeFileSync(path.join(skillDir, "SKILL.md"), "利用者のskill\n");
  assert.throws(() => installTermDrift(dir, "codex"), /内容が異なるため上書きしません/);
  assert.equal(fs.readFileSync(path.join(skillDir, "SKILL.md"), "utf8"), "利用者のskill\n");
  assert.equal(fs.existsSync(path.join(dir, ".term-drift")), false);
});

test("skill 配置に失敗したら成功表示せず、今回作った .term-drift を巻き戻す", () => {
  const dir = tmp();
  fs.writeFileSync(path.join(dir, ".claude"), "directoryではない\n");
  const result = cli([], dir);
  assert.equal(result.status, 2);
  assert.doesNotMatch(result.stderr, /インストール完了:/);
  assert.match(result.stderr, /インストール未完了:/);
  assert.equal(fs.existsSync(path.join(dir, ".term-drift")), false);
  assert.equal(fs.readFileSync(path.join(dir, ".claude"), "utf8"), "directoryではない\n");
});

test("複数 agent 指定と余分な引数は書き込み前に拒否する", () => {
  for (const args of [["--claude", "--codex"], ["--gemini", "extra"]]) {
    const dir = tmp();
    const result = cli(args, dir);
    assert.equal(result.status, 1);
    assert.equal(fs.readdirSync(dir).length, 0);
  }
});

test("agent skill の親が対象外 symlink なら外へ書かず拒否する", () => {
  const dir = tmp();
  const outside = tmp();
  fs.symlinkSync(outside, path.join(dir, ".agents"), "dir");
  assert.throws(() => installTermDrift(dir, "codex"), /安全のため/);
  assert.deepEqual(fs.readdirSync(outside), []);
  assert.equal(fs.existsSync(path.join(dir, ".term-drift")), false);
});
