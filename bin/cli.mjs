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
import { initTermDrift } from "../src/init.mjs";
import { loadDictionary, applyDictionary } from "../src/apply.mjs";
import { recheckDictionary } from "../src/recheck.mjs";

const HELP = `term-drift — AI 支援開発で持ち込まれた用語のずれを、人承認の言い換えで揃え直す

使い方:
  term-drift init [dir]              対象リポへ目印（.term-drift/）と台帳の雛形を置く（非破壊）
  term-drift scan [dir]              走査対象の収集（部位優先・秘密除外・read-only）
  term-drift ledger [dir]            台帳の解決と内容の表示（.intent/glossary.md 優先）
  term-drift apply <辞書.json> [dir]   承認済み置換辞書の適用（git 管理下のみ・承認印必須）
  term-drift recheck <辞書.json> [dir] 承認済み置換の残存照合（免除は理由一行つきのみ有効）
  term-drift rules                   検出 rules（単一正本）の場所を表示
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

const [, , command, ...rest] = process.argv;

switch (command) {
  case "init": {
    const dir = resolveDir(rest[0]);
    const result = initTermDrift(dir);
    console.log(JSON.stringify(result, null, 2));
    for (const note of result.notes) console.error(note);
    break;
  }
  case "scan": {
    const dir = resolveDir(rest[0]);
    const result = scan(dir);
    console.log(JSON.stringify(result, null, 2));
    break;
  }
  case "ledger": {
    const dir = resolveDir(rest[0]);
    const ledger = loadLedger(dir);
    if (ledger.path === null) {
      console.log(JSON.stringify({ path: null, entries: [], note: "台帳なし（チーム共通語の判定は縮退します。台帳の新設は .term-drift/glossary.md へ・人の承認後）" }, null, 2));
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
    const dict = loadDictionary(path.resolve(rest[0]));
    const dir = resolveDir(rest[1]);
    const result = applyDictionary(dict, dir);
    console.log(JSON.stringify(result, null, 2));
    if (!result.applied) {
      console.error("適用を拒否しました: 対象が git 管理下にありません（可逆性を担保できないため書き込みません）");
      process.exit(2);
    }
    break;
  }
  case "recheck": {
    if (!rest[0]) {
      console.error("辞書ファイルを指定してください: term-drift recheck <辞書.json> [dir]");
      process.exit(1);
    }
    const dict = loadDictionary(path.resolve(rest[0]));
    const dir = resolveDir(rest[1]);
    console.log(JSON.stringify(recheckDictionary(dict, dir), null, 2));
    break;
  }
  case "rules": {
    const rulesDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "rules");
    console.log(JSON.stringify({ rules: [path.join(rulesDir, "detect.md"), path.join(rulesDir, "workflow.md")] }, null, 2));
    break;
  }
  case "--help":
  case "-h":
  case undefined:
    console.log(HELP);
    break;
  default:
    console.error(`不明なコマンドです: ${command}\n`);
    console.log(HELP);
    process.exit(1);
}
