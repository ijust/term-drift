// 導入（init）の判別テスト。
// - 目印 .term-drift/ と台帳の雛形を置く（非破壊: 既存は上書きしない）
// - .intent/glossary.md があればそれを正本として使い、二重台帳を作らない（DR4）
// - 台帳の雛形が自分の読み手（parseLedger）でそのまま読める（スキーマ同一）
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { initTermDrift } from "../src/init.mjs";
import { loadLedger } from "../src/ledger.mjs";

function tmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "term-drift-init-"));
}

test("台帳の無いリポ: 目印と台帳の雛形を置く", () => {
  const dir = tmp();
  const r = initTermDrift(dir);
  assert.ok(fs.existsSync(path.join(dir, ".term-drift")), "目印ディレクトリができる");
  assert.equal(r.ledger, path.join(".term-drift", "glossary.md"));
  assert.ok(fs.existsSync(path.join(dir, ".term-drift", "glossary.md")), "台帳の雛形ができる");
  assert.ok(r.created.includes(".term-drift/"));
});

test("台帳の雛形は自分の読み手でそのまま読める（スキーマ同一・空の台帳）", () => {
  const dir = tmp();
  initTermDrift(dir);
  const { path: p, entries } = loadLedger(dir);
  assert.ok(p.endsWith(path.join(".term-drift", "glossary.md")), "雛形が台帳として解決される");
  assert.deepEqual(entries, [], "見出し行だけの空台帳（行を誤読しない）");
  // 台帳の規約（1語ずつ・否認済みは残す）が雛形に載っている（承認洗浄の入口を塞ぐ）。
  const text = fs.readFileSync(p, "utf8");
  assert.ok(/登録・昇格は1語ずつ/.test(text), "1語ずつの登録関門がある");
  assert.ok(/否認済みの語は削除せず残します/.test(text), "否認済みを残す規約がある");
  assert.ok(/状態が書かれていない行は「暫定」として読みます/.test(text), "未記載＝暫定の読み規則がある");
});

test(".intent/glossary.md があれば正本として使い、二重台帳を作らない（DR4）", () => {
  const dir = tmp();
  fs.mkdirSync(path.join(dir, ".intent"), { recursive: true });
  const intentLedger = path.join(dir, ".intent", "glossary.md");
  fs.writeFileSync(intentLedger, "| 正規語 | 別表記・同義語 | 一行説明 |\n|---|---|---|\n| packet | — | 作業のひとまとまり。 |\n");
  const r = initTermDrift(dir);
  assert.equal(r.ledger, path.join(".intent", "glossary.md"), "既存の .intent 台帳が正本");
  assert.ok(!fs.existsSync(path.join(dir, ".term-drift", "glossary.md")), "二重台帳を作らない");
  assert.ok(r.notes.some((n) => n.includes("既存")), "既存台帳を使う旨が案内される");
});

test("非破壊: 既存の .term-drift/glossary.md を上書きしない", () => {
  const dir = tmp();
  fs.mkdirSync(path.join(dir, ".term-drift"), { recursive: true });
  const own = path.join(dir, ".term-drift", "glossary.md");
  fs.writeFileSync(own, "既存の台帳（消してはいけない）\n");
  initTermDrift(dir);
  assert.equal(fs.readFileSync(own, "utf8"), "既存の台帳（消してはいけない）\n", "既存台帳が無傷");
});
