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
  // 台帳の規約（1語ずつ・否認済み・承認済み一般語）が雛形に載っている。
  const text = fs.readFileSync(p, "utf8");
  assert.ok(/登録・昇格は1語ずつ/.test(text), "1語ずつの登録関門がある");
  assert.ok(/否認済みの語は削除せず残します/.test(text), "否認済みを残す規約がある");
  assert.ok(/状態が書かれていない行は「暫定」として読みます/.test(text), "未記載＝暫定の読み規則がある");
  assert.ok(/分類.*一般語/.test(text), "一般語分類の追加列がある");
  assert.ok(/一般語の分類は状態が「承認済み」の行だけ有効/.test(text), "未承認の一般語分類を復元しない");
  assert.ok(/旧3列・5列/.test(text), "旧形式の後方互換を明示する");
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

test("検出 rules を対象リポへ配置する（他ツールが読む場所・キャッシュを見せないため）", () => {
  const dir = tmp();
  const r = initTermDrift(dir);
  const detect = path.join(dir, ".term-drift", "rules", "detect.md");
  const workflow = path.join(dir, ".term-drift", "rules", "workflow.md");
  assert.ok(fs.existsSync(detect), "検出 rules が対象リポに置かれる（intent-planner の造語検査の解決先）");
  assert.ok(fs.existsSync(workflow), "一巡の進め方も置かれる");
  assert.ok(r.created.includes(path.join(".term-drift", "rules", "detect.md")));
  // 配布物の正本と同一内容（コピーであって別物にしない）。
  const packaged = fs.readFileSync(path.join(path.dirname(new URL(import.meta.url).pathname), "..", "rules", "detect.md"), "utf8");
  assert.equal(fs.readFileSync(detect, "utf8"), packaged, "配置された rules が正本と同一");
  // 多層検出の実質が対象リポ側にも載っている（読み手が委ねられる中身）。
  assert.ok(/層2: 比喩転用/.test(fs.readFileSync(detect, "utf8")), "普通の言葉の内輪転用を見る層が載る");
});

test("非破壊: 既存の .term-drift/rules/detect.md を上書きしない（利用者の調整を消さない）", () => {
  const dir = tmp();
  const rulesDir = path.join(dir, ".term-drift", "rules");
  fs.mkdirSync(rulesDir, { recursive: true });
  const detect = path.join(rulesDir, "detect.md");
  fs.writeFileSync(detect, "# 利用者が調整した検出 rules\n");
  const r = initTermDrift(dir);
  assert.equal(fs.readFileSync(detect, "utf8"), "# 利用者が調整した検出 rules\n", "既存 rules が無傷");
  assert.ok(r.skipped.includes(path.join(".term-drift", "rules", "detect.md")), "スキップとして報告される");
});

test("非破壊: 既存の .term-drift/glossary.md を上書きしない", () => {
  const dir = tmp();
  fs.mkdirSync(path.join(dir, ".term-drift"), { recursive: true });
  const own = path.join(dir, ".term-drift", "glossary.md");
  fs.writeFileSync(own, "既存の台帳（消してはいけない）\n");
  initTermDrift(dir);
  assert.equal(fs.readFileSync(own, "utf8"), "既存の台帳（消してはいけない）\n", "既存台帳が無傷");
});

test("安全境界: .term-drift symlink 経由で対象リポ外へ書かない", () => {
  const dir = tmp();
  const outside = tmp();
  fs.symlinkSync(outside, path.join(dir, ".term-drift"), "dir");
  assert.throws(() => initTermDrift(dir), /安全のため/);
  assert.deepEqual(fs.readdirSync(outside), [], "対象外に台帳・rulesを作らない");
});
