import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { AGENT_COMMAND_PATHS, AGENT_SKILL_PATHS, installTermDrift } from "../src/install.mjs";
import { updateTermDrift } from "../src/update.mjs";

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
  const version = JSON.parse(fs.readFileSync(path.join(dir, ".term-drift", "version.json"), "utf8"));
  assert.equal(version.package, "term-drift");
  assert.equal(version.version, "0.3.5");
  assert.equal(version.agent, "claude");
  assert.ok(version.assets[".term-drift/rules/detect.md"]);
  assert.ok(version.assets[".claude/skills/term-drift/SKILL.md"]);
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
    assert.equal(fs.existsSync(path.join(dir, AGENT_COMMAND_PATHS.gemini)), agent === "gemini");
    const output = JSON.parse(result.stdout);
    assert.deepEqual(output.commands, agent === "gemini" ? [AGENT_COMMAND_PATHS.gemini] : []);
    if (agent === "gemini") assert.match(result.stderr, /Gemini CLI command: \/term-drift/);
  });
}

test("--gemini は Gemini CLI の skill と /term-drift command を記録する", () => {
  const dir = tmp();
  const result = installTermDrift(dir, "gemini");
  const command = AGENT_COMMAND_PATHS.gemini.split(path.sep).join("/");
  const version = JSON.parse(fs.readFileSync(path.join(dir, ".term-drift", "version.json"), "utf8"));
  assert.equal(result.skill, AGENT_SKILL_PATHS.gemini);
  assert.deepEqual(result.commands, [AGENT_COMMAND_PATHS.gemini]);
  assert.ok(version.assets[command]);
  assert.match(fs.readFileSync(path.join(dir, AGENT_COMMAND_PATHS.gemini), "utf8"), /Activate the term-drift skill/);
});

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

test("内容が異なる既存 Gemini CLI command は上書きせず、導入前に拒否する", () => {
  const dir = tmp();
  const command = path.join(dir, AGENT_COMMAND_PATHS.gemini);
  fs.mkdirSync(path.dirname(command), { recursive: true });
  fs.writeFileSync(command, 'prompt = "利用者のcommand"\n');
  assert.throws(() => installTermDrift(dir, "gemini"), /既存の Gemini CLI command と内容が異なる/);
  assert.equal(fs.readFileSync(command, "utf8"), 'prompt = "利用者のcommand"\n');
  assert.equal(fs.existsSync(path.join(dir, ".term-drift")), false);
  assert.equal(fs.existsSync(path.join(dir, AGENT_SKILL_PATHS.gemini)), false);
});

test("Gemini CLI command の dangling symlink を経由して対象外へ書かない", () => {
  const dir = tmp();
  const outside = tmp();
  const command = path.join(dir, AGENT_COMMAND_PATHS.gemini);
  const outsideCommand = path.join(outside, "term-drift.toml");
  fs.mkdirSync(path.dirname(command), { recursive: true });
  fs.symlinkSync(outsideCommand, command);
  assert.throws(() => installTermDrift(dir, "gemini"), /対象リポ内の通常ファイル/);
  assert.equal(fs.existsSync(outsideCommand), false);
  assert.equal(fs.existsSync(path.join(dir, ".term-drift")), false);
  assert.equal(fs.existsSync(path.join(dir, AGENT_SKILL_PATHS.gemini)), false);
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

test("update は旧version記録と既知の公式資産を一括更新し、最後にmanifestを確定する", () => {
  const dir = tmp();
  installTermDrift(dir, "codex");
  const version = path.join(dir, ".term-drift", "version.json");
  fs.writeFileSync(version, '{"package":"term-drift","version":"0.2.0"}\n');
  const result = updateTermDrift(dir, "codex");
  assert.equal(result.updated, true);
  assert.deepEqual(result.commands, []);
  assert.equal(result.fromVersion, "0.2.0");
  const manifest = JSON.parse(fs.readFileSync(version, "utf8"));
  assert.equal(manifest.version, "0.3.5");
  assert.equal(manifest.agent, "codex");
  assert.ok(manifest.assets[".term-drift/rules/workflow.md"]);
  assert.ok(manifest.assets[".agents/skills/term-drift/SKILL.md"]);
});

test("Gemini CLI の既存導入へ新しい /term-drift command を安全に追加する", () => {
  const dir = tmp();
  installTermDrift(dir, "gemini");
  const commandRel = AGENT_COMMAND_PATHS.gemini.split(path.sep).join("/");
  const command = path.join(dir, AGENT_COMMAND_PATHS.gemini);
  const version = path.join(dir, ".term-drift", "version.json");
  fs.unlinkSync(command);
  const manifest = JSON.parse(fs.readFileSync(version, "utf8"));
  manifest.version = "0.3.3";
  delete manifest.assets[commandRel];
  fs.writeFileSync(version, `${JSON.stringify(manifest, null, 2)}\n`);

  const result = updateTermDrift(dir, "gemini");
  const updated = JSON.parse(fs.readFileSync(version, "utf8"));
  assert.equal(result.updated, true);
  assert.deepEqual(result.commands, [AGENT_COMMAND_PATHS.gemini]);
  assert.ok(fs.existsSync(command));
  assert.ok(updated.assets[commandRel]);
  assert.match(fs.readFileSync(command, "utf8"), /Activate the term-drift skill/);
});

test("update は公開済み0.2.3の公式資産を既知として引き継ぐ", () => {
  const source = fs.readFileSync(path.join(ROOT, "src", "update.mjs"), "utf8");
  for (const hash of [
    "3c21b9fa6a5e2498f13713648945d2e4a61e0e664a1af9f7e16204a7e922728b",
    "cf5d5475539b24fbfb4fe330b56505fdf2ce94df3c2eea0a08a2e88547ae7945",
    "1cf49ed084ad5c182d67f22cab9fc9cffa0403fe87e15681347c3906744bde0f",
  ]) assert.ok(source.includes(hash), `0.2.3の公式資産hashを保持する: ${hash}`);
});

test("update は開発版0.2.4の公式資産を既知として引き継ぐ", () => {
  const source = fs.readFileSync(path.join(ROOT, "src", "update.mjs"), "utf8");
  for (const hash of [
    "2a8dc9cbe27f026e06efe2088b2bd11dee89405f37a6d000f20f231f28ffb630",
    "ce133509e027a1f6651267c3c4912f201931c14109381b851a3ab4caa2b31185",
    "4f1e31fbf5bbf6158374a8853dd341eb67811c64aecb4449369f0d1f8d542175",
  ]) assert.ok(source.includes(hash), `0.2.4の公式資産hashを保持する: ${hash}`);
});

test("update は公開済み0.2.5の公式資産を既知として引き継ぐ", () => {
  const source = fs.readFileSync(path.join(ROOT, "src", "update.mjs"), "utf8");
  for (const hash of [
    "627d1bf950f9f87e655d5dd10215d408a2e605582e5e869f3b9b6cf67111ec49",
    "dd898983dc349d0c327e42f98f5d301bb3e08111acfdbe54624b720bdc54aba3",
    "cdd550d32d66e4c5695413e8d11ab3c0fe5eab5a853f01017b3d03d186599cf8",
  ]) assert.ok(source.includes(hash), `0.2.5の公式資産hashを保持する: ${hash}`);
});

test("update は利用者が変更したrulesを上書きせず、versionとskillも変更しない", () => {
  const dir = tmp();
  installTermDrift(dir, "gemini");
  const rule = path.join(dir, ".term-drift", "rules", "detect.md");
  const skill = path.join(dir, AGENT_SKILL_PATHS.gemini, "SKILL.md");
  const version = path.join(dir, ".term-drift", "version.json");
  fs.writeFileSync(rule, "利用者が調整したrules\n");
  const beforeSkill = fs.readFileSync(skill);
  const beforeVersion = fs.readFileSync(version);
  assert.throws(() => updateTermDrift(dir, "gemini"), /利用者が変更した可能性/);
  assert.equal(fs.readFileSync(rule, "utf8"), "利用者が調整したrules\n");
  assert.deepEqual(fs.readFileSync(skill), beforeSkill);
  assert.deepEqual(fs.readFileSync(version), beforeVersion);
});

test("update の途中失敗はrules・skill・versionをすべて元に戻す", () => {
  const dir = tmp();
  installTermDrift(dir, "claude");
  const files = [
    path.join(dir, ".term-drift", "rules", "detect.md"),
    path.join(dir, ".term-drift", "rules", "workflow.md"),
    path.join(dir, AGENT_SKILL_PATHS.claude, "SKILL.md"),
    path.join(dir, ".term-drift", "version.json"),
  ];
  const before = files.map((file) => fs.readFileSync(file));
  assert.throws(() => updateTermDrift(dir, "claude", { testHook() { throw new Error("注入失敗"); } }), /元に戻しました/);
  files.forEach((file, index) => assert.deepEqual(fs.readFileSync(file), before[index]));
});

test("Gemini CLI command の追加中に失敗したら新規assetも元に戻す", () => {
  const dir = tmp();
  installTermDrift(dir, "gemini");
  const commandRel = AGENT_COMMAND_PATHS.gemini.split(path.sep).join("/");
  const command = path.join(dir, AGENT_COMMAND_PATHS.gemini);
  const version = path.join(dir, ".term-drift", "version.json");
  fs.unlinkSync(command);
  const manifest = JSON.parse(fs.readFileSync(version, "utf8"));
  manifest.version = "0.3.3";
  delete manifest.assets[commandRel];
  fs.writeFileSync(version, `${JSON.stringify(manifest, null, 2)}\n`);
  const beforeVersion = fs.readFileSync(version);

  assert.throws(
    () => updateTermDrift(dir, "gemini", { testHook() { throw new Error("注入失敗"); } }),
    /元に戻しました/,
  );
  assert.equal(fs.existsSync(command), false);
  assert.deepEqual(fs.readFileSync(version), beforeVersion);
});

test("CLI update はagent指定を必須にし、成功時だけ更新完了を表示する", () => {
  const dir = tmp();
  installTermDrift(dir, "codex");
  const version = path.join(dir, ".term-drift", "version.json");
  fs.writeFileSync(version, '{"package":"term-drift","version":"0.2.0"}\n');
  const missing = cli(["update"], dir);
  assert.equal(missing.status, 1);
  assert.doesNotMatch(missing.stderr, /更新完了/);
  const result = cli(["update", "--codex"], dir);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stderr, /更新完了/);
});
