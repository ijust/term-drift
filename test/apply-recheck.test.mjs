// 適用と再検査（C-td6/C-td7・INV1・冪等）の判別テスト。
// - 承認なしの項目は1バイトも書かれない（INV1 の核）
// - 非 git 管理下では適用自体を拒否する
// - 有効な免除（理由一行つき）は置換されず・再報告されない（冪等）
// - 理由なしマーカーは無効（免除として効かず・無効として報告される）
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { loadDictionary, applyDictionary } from "../src/apply.mjs";
import { recheckDictionary } from "../src/recheck.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIX = path.join(__dirname, "fixtures", "apply-repo");

function tmpCopy({ git }) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "term-drift-apply-"));
  fs.cpSync(FIX, dir, { recursive: true });
  if (git) {
    execFileSync("git", ["init", "-q"], { cwd: dir });
    execFileSync("git", ["add", "-A"], { cwd: dir });
  }
  return dir;
}
const dict = () => loadDictionary(path.join(FIX, "dictionary.json"));

test("非 git 管理下では適用を拒否し、1バイトも書き込まない", () => {
  const dir = tmpCopy({ git: false });
  const before = fs.readFileSync(path.join(dir, "doc-a.md"), "utf8");
  const result = applyDictionary(dict(), dir);
  assert.equal(result.applied, false);
  assert.equal(result.reason, "not-a-git-worktree");
  assert.equal(fs.readFileSync(path.join(dir, "doc-a.md"), "utf8"), before, "ファイルが無傷");
});

test("承認済みの置換だけが適用され、承認印の無い項目は拒否として報告される（INV1）", () => {
  const dir = tmpCopy({ git: true });
  const result = applyDictionary(dict(), dir);
  assert.equal(result.applied, true);
  // 承認済み「結線→つなぎ込み」は doc-a に効く。
  const a = fs.readFileSync(path.join(dir, "doc-a.md"), "utf8");
  assert.ok(!a.includes("結線"), "doc-a の承認済み語が置換された");
  assert.ok(a.includes("つなぎ込み"), "言い換え先が書かれた");
  // 承認印の無い「配線→流れ」は1バイトも適用されない。
  const d = fs.readFileSync(path.join(dir, "doc-d.md"), "utf8");
  assert.ok(d.includes("配線"), "承認印の無い置換は適用されない");
  assert.ok(!d.includes("流れ"), "承認印の無い言い換え先は書かれない");
  assert.deepEqual(result.rejectedUnapproved, ["配線"], "拒否が名指しで報告される");
});

test("有効な免除（理由一行つき）を持つファイルは置換されない", () => {
  const dir = tmpCopy({ git: true });
  const result = applyDictionary(dict(), dir);
  const b = fs.readFileSync(path.join(dir, "doc-b.md"), "utf8");
  assert.ok(b.includes("結線"), "免除ファイルの語は残る");
  assert.ok(result.exemptedFiles.some((e) => e.file === "doc-b.md" && e.term === "結線"), "免除が報告される");
});

test("理由の無いマーカーは無効: 置換は行われ、無効マーカーとして報告される", () => {
  const dir = tmpCopy({ git: true });
  applyDictionary(dict(), dir);
  const c = fs.readFileSync(path.join(dir, "doc-c.md"), "utf8");
  // マーカー行自体は書き換えない（語の参照を保つ）が、本文の語は置換される。
  assert.ok(c.includes("<!-- term-drift:allow 結線 -->"), "マーカー行は無傷");
  assert.ok(!c.split("\n").filter((l) => !l.includes("term-drift:allow")).join("\n").includes("結線"), "本文は置換される");
  const rc = recheckDictionary(dict(), dir);
  assert.ok(rc.invalidMarkers.some((m) => m.file === "doc-c.md"), "無効マーカーが報告される");
});

test("冪等: 適用→再検査で残存ゼロ（有効免除のみ）・再適用しても変化ゼロ", () => {
  const dir = tmpCopy({ git: true });
  applyDictionary(dict(), dir);
  const rc1 = recheckDictionary(dict(), dir);
  assert.equal(rc1.remaining.length, 0, "承認済み置換の残存ゼロ（免除は残存に数えない）");
  assert.ok(rc1.exempted.some((e) => e.file === "doc-b.md"), "免除済みが免除として数えられる");
  // 2回目の適用は変化ゼロ（冪等）。
  const result2 = applyDictionary(dict(), dir);
  assert.deepEqual(result2.changes, [], "再適用で書き込みが発生しない");
});

test("辞書の形の検証: replacements 配列が無ければ・from が空なら拒否する", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "term-drift-dict-"));
  const bad1 = path.join(dir, "bad1.json");
  fs.writeFileSync(bad1, JSON.stringify({ foo: 1 }));
  assert.throws(() => loadDictionary(bad1), /辞書の形が不正/);
  const bad2 = path.join(dir, "bad2.json");
  fs.writeFileSync(bad2, JSON.stringify({ replacements: [{ from: "", to: "x", approved: true }] }));
  assert.throws(() => loadDictionary(bad2), /不正/);
});
