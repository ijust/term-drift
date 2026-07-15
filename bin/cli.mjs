#!/usr/bin/env node
// term-drift CLI — 決定的層の入口。
// LLM の読解が要る仕事（検出・3分類・言い換え提案）はここでは行わない: それらの正本は
// rules/detect.md（自然言語）で、宿主エージェントが読んで実行する（rules/workflow.md 参照）。
// この CLI は外部サービス（LLM API を含む）へ一切通信しない。

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { scan } from "../src/scan.mjs";
import { loadLedger } from "../src/ledger.mjs";
import { initTermDrift, resolveLocalRules } from "../src/init.mjs";
import { installTermDrift } from "../src/install.mjs";
import { updateTermDrift } from "../src/update.mjs";
import { loadDictionary, applyDictionary } from "../src/apply.mjs";
import { recheckDictionary } from "../src/recheck.mjs";

const HELP = `term-drift — AI 支援開発で持ち込まれた用語のずれを、人承認の言い換えで揃え直す

使い方:
  term-drift                         Claude Code 向けに現在のリポへ導入（既定）
  term-drift --claude                Claude Code 向けに現在のリポへ導入
  term-drift --codex                 Codex 向けに現在のリポへ導入
  term-drift --gemini                Gemini CLI 向けに現在のリポへ導入
  term-drift update --claude [dir]   Claude Code向け資産を安全に更新
  term-drift update --codex [dir]    Codex向け資産を安全に更新
  term-drift update --gemini [dir]   Gemini CLI向け資産を安全に更新
  term-drift init [dir]              対象リポへ目印（.term-drift/）と台帳の雛形を置く（非破壊）
  term-drift scan [dir]              走査対象の収集（部位優先・秘密除外・read-only）
  term-drift ledger [dir]            台帳の解決と内容の表示（.intent/glossary.md 優先）
  term-drift apply <辞書.json> [dir]   承認済み置換辞書の適用（git 管理下のみ・承認印必須）
  term-drift recheck <辞書.json> [dir] 承認済み置換の残存照合（例外は理由一行つきのみ有効）
  term-drift rules [dir]             対象リポ固有（なければ配布物）の検出 rules を表示
  term-drift --help                  このヘルプ

検出・分類・言い換え提案の進め方は rules/workflow.md を参照（LLM を持つエージェントが実行します）。
`;

function resolveDir(arg) {
  const dir = path.resolve(arg ?? ".");
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
    console.error(`対象ディレクトリがありません: ${dir}`);
    process.exit(1);
  }
  return dir;
}

function rejectExtraArgs(args, max, usage) {
  if (args.length <= max) return;
  console.error(`余分な引数があります: ${args.slice(max).join(" ")}\n使い方: ${usage}`);
  process.exit(1);
}

const [, , command, ...rest] = process.argv;

switch (command) {
  case undefined:
  case "--claude":
  case "--codex":
  case "--gemini": {
    rejectExtraArgs(rest, 0, `term-drift ${command ?? ""}`.trim());
    const dir = resolveDir();
    const agent = command === "--codex" ? "codex" : command === "--gemini" ? "gemini" : "claude";
    try {
      const result = installTermDrift(dir, agent);
      console.log(JSON.stringify(result, null, 2));
      console.error(`インストール完了: ${result.skill}`);
      if (result.commands.includes(".gemini/commands/term-drift.toml")) {
        console.error("Gemini CLI command: /term-drift");
      }
    } catch (error) {
      console.error(`インストール未完了: ${error.message}`);
      process.exit(2);
    }
    break;
  }
  case "init": {
    rejectExtraArgs(rest, 1, "term-drift init [dir]");
    const dir = resolveDir(rest[0]);
    const result = initTermDrift(dir);
    console.log(JSON.stringify(result, null, 2));
    for (const note of result.notes) console.error(note);
    break;
  }
  case "update": {
    const flag = rest[0];
    if (!["--claude", "--codex", "--gemini"].includes(flag)) {
      console.error("更新対象を指定してください: term-drift update --claude|--codex|--gemini [dir]");
      process.exit(1);
    }
    rejectExtraArgs(rest, 2, "term-drift update --claude|--codex|--gemini [dir]");
    const dir = resolveDir(rest[1]);
    const agent = flag.slice(2);
    try {
      const result = updateTermDrift(dir, agent);
      console.log(JSON.stringify(result, null, 2));
      console.error(`更新完了: ${result.skill}`);
      if (result.commands.includes(".gemini/commands/term-drift.toml")) {
        console.error("Gemini CLI command: /term-drift");
      }
    } catch (error) {
      console.error(`更新未完了: ${error.message}`);
      process.exit(2);
    }
    break;
  }
  case "scan": {
    rejectExtraArgs(rest, 1, "term-drift scan [dir]");
    const dir = resolveDir(rest[0]);
    const result = scan(dir);
    console.log(JSON.stringify(result, null, 2));
    break;
  }
  case "ledger": {
    rejectExtraArgs(rest, 1, "term-drift ledger [dir]");
    const dir = resolveDir(rest[0]);
    const ledger = loadLedger(dir);
    if (ledger.path === null) {
      console.log(JSON.stringify({ path: null, entries: [], note: "台帳なし（チーム共通語と承認済み一般語の判定は縮退します。台帳の新設は .term-drift/glossary.md へ・人の承認後）" }, null, 2));
    } else {
      console.log(JSON.stringify(ledger, null, 2));
    }
    break;
  }
  case "apply": {
    if (!rest[0]) {
      console.error("辞書ファイルを指定してください: term-drift apply <辞書.json> [dir]");
      process.exit(1);
    }
    rejectExtraArgs(rest, 2, "term-drift apply <辞書.json> [dir]");
    const dict = loadDictionary(path.resolve(rest[0]));
    const dir = resolveDir(rest[1]);
    const result = applyDictionary(dict, dir);
    console.log(JSON.stringify(result, null, 2));
    if (!result.applied) {
      console.error("適用を拒否しました: 対象が git 管理下にありません（可逆性を担保できないため書き込みません）");
      process.exit(2);
    }
    if (result.warningsDirty?.length) {
      console.error(`警告: 未ステージ変更のある追跡済み文書へ、現在内容の一意な一致だけを適用しました: ${result.warningsDirty.join(", ")}`);
    }
    if (result.skippedUntracked.length || result.skippedDirty.length || result.skippedInvalidUtf8.length) {
      console.error("適用できなかった対象があります。JSON の skipped* を確認してください。");
      process.exit(3);
    }
    break;
  }
  case "recheck": {
    if (!rest[0]) {
      console.error("辞書ファイルを指定してください: term-drift recheck <辞書.json> [dir]");
      process.exit(1);
    }
    rejectExtraArgs(rest, 2, "term-drift recheck <辞書.json> [dir]");
    const dict = loadDictionary(path.resolve(rest[0]));
    const dir = resolveDir(rest[1]);
    const result = recheckDictionary(dict, dir);
    console.log(JSON.stringify(result, null, 2));
    if (result.remaining.length || result.invalidMarkers.length || result.skippedUntracked.length || result.skippedInvalidUtf8.length) {
      process.exit(3);
    }
    break;
  }
  case "rules": {
    rejectExtraArgs(rest, 1, "term-drift rules [dir]");
    const dir = resolveDir(rest[0]);
    const packagedRulesDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "rules");
    const localRules = resolveLocalRules(dir);
    const rules = localRules ?? [path.join(packagedRulesDir, "detect.md"), path.join(packagedRulesDir, "workflow.md")];
    console.log(JSON.stringify({ source: localRules ? "repository" : "package", rules }, null, 2));
    break;
  }
  case "--help":
  case "-h":
    console.log(HELP);
    break;
  default:
    console.error(`不明なコマンドです: ${command}\n`);
    console.log(HELP);
    process.exit(1);
}
