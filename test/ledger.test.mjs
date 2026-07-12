// 台帳の解決と読み取り（DR3/DR4・INV5）の判別テスト。
// 旧3列・5列・状態3値・未記載＝暫定・否認済みの保持・解決順（.intent 優先→.term-drift→なし）。
import { test } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveLedgerPath, parseLedger, loadLedger } from "../src/ledger.mjs";
import fs from "node:fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIX = path.join(__dirname, "fixtures");

function tmpCopy(name) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "term-drift-ledger-"));
  fs.cpSync(path.join(FIX, name), dir, { recursive: true });
  return dir;
}

test("5列台帳: 状態3値と言い換え例を読める", () => {
  const { entries } = loadLedger(path.join(FIX, "ledger-5col"));
  const byTerm = Object.fromEntries(entries.map((e) => [e.term, e]));
  assert.equal(byTerm["packet"].status, "approved");
  assert.equal(byTerm["packet"].rewording, "作業のひとまとまり");
  assert.equal(byTerm["下ごしらえ層"].status, "provisional");
  assert.equal(byTerm["結線"].status, "rejected");
  assert.equal(byTerm["結線"].rewording, "機能同士のつなぎ込み");
});

test("状態未記載の行は暫定として読む（勝手に承認済み扱いしない）", () => {
  const { entries } = loadLedger(path.join(FIX, "ledger-5col"));
  const compass = entries.find((e) => e.term === "compass");
  assert.equal(compass.status, "provisional");
  assert.equal(compass.statusRaw, "");
});

test("旧3列の台帳もそのまま読める（追加のみの恒久契約・全行が暫定扱い）", () => {
  const { path: p, entries } = loadLedger(path.join(FIX, "ledger-own"));
  assert.ok(p.endsWith(path.join(".term-drift", "glossary.md")));
  assert.equal(entries.length, 2);
  for (const e of entries) assert.equal(e.status, "provisional");
  // 別表記「—」は同義語として扱わない。
  assert.deepEqual(entries.find((e) => e.term === "curator").aliases, []);
});

test("解決順: .intent/glossary.md があればそちらを正本として優先する", () => {
  const { path: p, entries } = loadLedger(path.join(FIX, "ledger-both"));
  assert.ok(p.includes(".intent"));
  assert.equal(entries[0].term, "intent-side");
});

test("台帳が無ければ path: null で縮退する（分類を捏造しない側の土台）", () => {
  const { path: p, entries } = loadLedger(path.join(FIX, "scan-repo"));
  assert.equal(p, null);
  assert.deepEqual(entries, []);
});

test("否認済みの行は削除されず読み続けられる（再発明防止の土台）", () => {
  // parseLedger 単体でも状態を落とさないことを確認（他ツールが Read するときの契約）。
  const md = fs.readFileSync(path.join(FIX, "ledger-5col", ".intent", "glossary.md"), "utf8");
  const rejected = parseLedger(md).filter((e) => e.status === "rejected");
  assert.equal(rejected.length, 1);
  assert.equal(rejected[0].term, "結線");
});

test("resolveLedgerPath はリポに配置された実体だけを見る（存在しなければ null）", () => {
  assert.equal(resolveLedgerPath(path.join(FIX, "apply-repo")), null);
});

test("対象外を指す台帳 symlink は読まない", () => {
  const dir = tmpCopy("ledger-own");
  const outside = path.join(os.tmpdir(), `term-drift-outside-${process.pid}.md`);
  fs.writeFileSync(outside, "| 正規語 | 別表記・同義語 | 一行説明 |\n|---|---|---|\n| 秘密語 | — | 外部 |\n");
  fs.mkdirSync(path.join(dir, ".intent"), { recursive: true });
  fs.symlinkSync(outside, path.join(dir, ".intent", "glossary.md"));
  const result = loadLedger(dir);
  assert.ok(!result.entries.some((e) => e.term === "秘密語"));
  assert.ok(result.path.endsWith(path.join(".term-drift", "glossary.md")), "安全なリポ内台帳へ縮退する");
});
