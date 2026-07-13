// 適用と再検査（C-td6/C-td7・INV1・冪等）の判別テスト。
// - 承認なしの項目は1バイトも書かれない（INV1 の核）
// - 非 git 管理下では適用自体を拒否する
// - 理由を添えた例外は置換されず・再報告されない（冪等）
// - 理由なしマーカーは無効（例外として扱わず・無効として報告される）
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
  assert.ok(a.includes("フォームと組版を先につなぎ込む。"), "1箇所目の承認文が書かれた");
  assert.ok(a.includes("つなぎ込みが終われば動く。"), "2箇所目の承認文が書かれた");
  // 承認印の無い「配線→流れ」は1バイトも適用されない。
  const d = fs.readFileSync(path.join(dir, "doc-d.md"), "utf8");
  assert.ok(d.includes("配線"), "承認印の無い置換は適用されない");
  assert.ok(!d.includes("流れ"), "承認印の無い言い換え先は書かれない");
  assert.deepEqual(result.rejectedUnapproved, ["配線"], "拒否が名指しで報告される");
});

test("理由を添えて例外として残した語は置換されない", () => {
  const dir = tmpCopy({ git: true });
  const result = applyDictionary(dict(), dir);
  const b = fs.readFileSync(path.join(dir, "doc-b.md"), "utf8");
  assert.ok(b.includes("結線"), "例外として指定した語は残る");
  assert.ok(result.exemptedFiles.some((e) => e.file === "doc-b.md" && e.term === "結線"), "例外が報告される");
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

test("冪等: 適用→再検査で残存ゼロ（理由つきの例外のみ）・再適用しても変化ゼロ", () => {
  const dir = tmpCopy({ git: true });
  applyDictionary(dict(), dir);
  const rc1 = recheckDictionary(dict(), dir);
  assert.equal(rc1.remaining.length, 0, "承認済み置換の残存ゼロ（例外は残存に数えない）");
  assert.ok(rc1.exempted.some((e) => e.file === "doc-b.md"), "理由つきの例外が別枠で数えられる");
  // 2回目の適用は変化ゼロ（冪等）。
  const result2 = applyDictionary(dict(), dir);
  assert.deepEqual(result2.changes, [], "再適用で書き込みが発生しない");
});

test("git 追跡外のファイルには書き込まず、スキップとして報告される（INV1・git から復元できないため）", () => {
  const dir = tmpCopy({ git: true });
  const untracked = path.join(dir, "doc-untracked.md");
  fs.writeFileSync(untracked, "結線の話。\n");
  const targeted = { replacements: [{ term: "結線", path: "doc-untracked.md", from: "結線の話。", to: "つなぎ込みの話。", approved: true }] };
  const result = applyDictionary(targeted, dir);
  assert.ok(fs.readFileSync(untracked, "utf8").includes("結線"), "未追跡ファイルは無傷");
  assert.ok(result.skippedUntracked.includes("doc-untracked.md"), "スキップが名指しで報告される");
  const rc = recheckDictionary(targeted, dir);
  assert.ok(!rc.remaining.some((r) => r.file === "doc-untracked.md"), "適用対象外は残存に数えない");
  assert.ok(rc.skippedUntracked.includes("doc-untracked.md"), "recheck でも別枠で報告される");
});

test("交差辞書（言い換え先に別の承認語を含む）は連鎖するため適用前に拒否する", () => {
  const dir = tmpCopy({ git: true });
  const chained = {
    replacements: [
      { term: "甲", path: "doc-a.md", from: "甲", to: "乙", approved: true },
      { term: "乙", path: "doc-a.md", from: "乙", to: "丙", approved: true },
    ],
  };
  const before = fs.readFileSync(path.join(dir, "doc-a.md"), "utf8");
  assert.throws(() => applyDictionary(chained, dir), /連鎖/);
  assert.equal(fs.readFileSync(path.join(dir, "doc-a.md"), "utf8"), before, "拒否時は1バイトも書かれない");
});

test("同時置換: 同じ行の複数の承認語が1パスで置換され、置換結果へ連鎖しない", () => {
  const dir = tmpCopy({ git: true });
  fs.writeFileSync(path.join(dir, "doc-multi.md"), "結線と切断の話。\n");
  execFileSync("git", ["add", "-A"], { cwd: dir });
  const d = {
    replacements: [
      { term: "結線", path: "doc-multi.md", from: "結線", to: "つなぎ込み", approved: true },
      { term: "切断", path: "doc-multi.md", from: "切断", to: "取り外し", approved: true },
    ],
  };
  const result = applyDictionary(d, dir);
  const t = fs.readFileSync(path.join(dir, "doc-multi.md"), "utf8");
  assert.ok(t.includes("つなぎ込みと取り外し"), "両方の語が同時に置換される");
  assert.ok(result.changes.some((c) => c.file === "doc-multi.md" && c.term === "結線" && c.count === 1));
  assert.ok(result.changes.some((c) => c.file === "doc-multi.md" && c.term === "切断" && c.count === 1));
});

test("辞書の重複 from（同じ語の二重定義）は読み込み時に拒否する", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "term-drift-dict-"));
  const dup = path.join(dir, "dup.json");
  fs.writeFileSync(dup, JSON.stringify({
    replacements: [
      { term: "結線", path: "doc-a.md", from: "結線", to: "つなぎ込み", approved: true },
      { term: "結線", path: "doc-a.md", from: "結線", to: "接続", approved: true },
    ],
  }));
  assert.throws(() => loadDictionary(dup), /重複/);
});

test("辞書の形の検証: replacements 配列が無ければ・from が空なら拒否する", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "term-drift-dict-"));
  const bad1 = path.join(dir, "bad1.json");
  fs.writeFileSync(bad1, JSON.stringify({ foo: 1 }));
  assert.throws(() => loadDictionary(bad1), /辞書の形が不正/);
  const bad2 = path.join(dir, "bad2.json");
  fs.writeFileSync(bad2, JSON.stringify({ replacements: [{ term: "x", path: "doc.md", from: "", to: "x", approved: true }] }));
  assert.throws(() => loadDictionary(bad2), /不正/);
  const bad3 = path.join(dir, "bad3.json");
  fs.writeFileSync(bad3, JSON.stringify({ replacements: [{ term: "x", path: "doc.md", from: "x", to: "", approved: true }] }));
  assert.throws(() => loadDictionary(bad3), /不正/, "空の置換先による削除を拒否する");
  const bad4 = path.join(dir, "bad4.json");
  fs.writeFileSync(bad4, JSON.stringify({ replacements: [{ term: "x", from: "x", to: "y", approved: true }] }));
  assert.throws(() => loadDictionary(bad4), /path/, "対象箇所を固定しない旧式辞書を拒否する");
  const bad5 = path.join(dir, "bad5.json");
  fs.writeFileSync(bad5, JSON.stringify({ replacements: [{ term: "x", path: "../outside.md", from: "x", to: "y", approved: true }] }));
  assert.throws(() => loadDictionary(bad5), /path/, "対象リポジトリ外へのパスを拒否する");
});

test("1辞書項目が同じファイルの複数箇所に一致したら、書き込み前に拒否する", () => {
  const dir = tmpCopy({ git: true });
  const before = fs.readFileSync(path.join(dir, "doc-a.md"), "utf8");
  const broad = { replacements: [{ term: "結線", path: "doc-a.md", from: "結線", to: "つなぎ込み", approved: true }] };
  assert.throws(() => applyDictionary(broad, dir), /2箇所に一致/);
  assert.equal(fs.readFileSync(path.join(dir, "doc-a.md"), "utf8"), before, "一括一致を拒否して無傷を保つ");
});

test("同じ承認文章が別ファイルにもあっても、指定された1ファイルだけを変更する", () => {
  const dir = tmpCopy({ git: true });
  fs.writeFileSync(path.join(dir, "same-a.md"), "この実線を確認する。\n");
  fs.writeFileSync(path.join(dir, "same-b.md"), "この実線を確認する。\n");
  execFileSync("git", ["add", "-A"], { cwd: dir });
  const one = { replacements: [{ term: "実線", path: "same-a.md", from: "この実線を確認する。", to: "この明示記録を確認する。", approved: true }] };
  applyDictionary(one, dir);
  assert.equal(fs.readFileSync(path.join(dir, "same-a.md"), "utf8"), "この明示記録を確認する。\n");
  assert.equal(fs.readFileSync(path.join(dir, "same-b.md"), "utf8"), "この実線を確認する。\n", "未承認の別箇所へ流用しない");
});

test("未ステージ変更のある追跡済みファイルは書き換えず、可逆性を守る", () => {
  const dir = tmpCopy({ git: true });
  const file = path.join(dir, "doc-a.md");
  fs.appendFileSync(file, "未コミットの重要メモ: 結線\n");
  const before = fs.readFileSync(file);
  const result = applyDictionary(dict(), dir);
  assert.ok(result.skippedDirty.includes("doc-a.md"));
  assert.deepEqual(fs.readFileSync(file), before, "dirtyな適用前内容を保持する");
});

test("非 UTF-8 文書は1バイトも変更せずスキップする", () => {
  const dir = tmpCopy({ git: true });
  const file = path.join(dir, "binary.txt");
  const before = Buffer.from([0xff, ...Buffer.from("結線\n")]);
  fs.writeFileSync(file, before);
  execFileSync("git", ["add", "-A"], { cwd: dir });
  const result = applyDictionary(dict(), dir);
  assert.ok(result.skippedInvalidUtf8.includes("binary.txt"));
  assert.deepEqual(fs.readFileSync(file), before);
});

test("インラインの別語マーカーは散文の置換・再検査を隠さない", () => {
  const dir = tmpCopy({ git: true });
  const file = path.join(dir, "inline-marker.md");
  fs.writeFileSync(file, "結線は対象。 <!-- term-drift:allow 別語 — 別語だけを残す -->\n");
  execFileSync("git", ["add", "-A"], { cwd: dir });
  const targeted = { replacements: [{ term: "結線", path: "inline-marker.md", from: "結線は対象。", to: "つなぎ込みは対象。", approved: true }] };
  const result = applyDictionary(targeted, dir);
  const text = fs.readFileSync(file, "utf8");
  assert.ok(text.includes("つなぎ込みは対象"));
  assert.ok(text.includes("term-drift:allow 別語"), "コメントは無傷");
  assert.ok(result.changes.some((c) => c.file === "inline-marker.md"));
  assert.equal(recheckDictionary(targeted, dir).remaining.length, 0);
});

test("Markdown のコード・識別子・リンク先は置換せず、散文だけを変える", () => {
  const dir = tmpCopy({ git: true });
  const file = path.join(dir, "code.md");
  fs.writeFileSync(file, [
    "drain the queue.",
    "Run `drain --force` or call `drain()`.",
    "[drain docs](https://example.invalid/drain)",
    "```sh",
    "drain --force",
    "```",
    "",
  ].join("\n"));
  execFileSync("git", ["add", "-A"], { cwd: dir });
  const d = { replacements: [{ term: "drain", path: "code.md", from: "drain the queue.", to: "empty the queue.", approved: true }] };
  applyDictionary(d, dir);
  const text = fs.readFileSync(file, "utf8");
  assert.ok(text.includes("empty the queue"));
  assert.ok(text.includes("`drain --force`"));
  assert.ok(text.includes("`drain()`"));
  assert.ok(text.includes("https://example.invalid/drain"));
  assert.ok(text.includes("\ndrain --force\n```"));
  assert.deepEqual(recheckDictionary(d, dir).remaining, [], "保護領域の識別子は残存扱いしない");
});

test("置換先と隣接文字で別の承認語が生まれる境界連鎖を、書き込み前に拒否する", () => {
  const dir = tmpCopy({ git: true });
  const file = path.join(dir, "boundary.md");
  fs.writeFileSync(file, "AC\n");
  execFileSync("git", ["add", "-A"], { cwd: dir });
  const d = { replacements: [
    { term: "A", path: "boundary.md", from: "A", to: "B", approved: true },
    { term: "BC", path: "boundary.md", from: "BC", to: "D", approved: true },
  ] };
  assert.throws(() => applyDictionary(d, dir), /再生成/);
  assert.equal(fs.readFileSync(file, "utf8"), "AC\n");
});

test("コミットだけに残る承認語は、現在文書の残存でなく確認済み履歴として報告する", () => {
  const dir = tmpCopy({ git: true });
  execFileSync("git", ["-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "-qm", "結線を導入"], { cwd: dir });
  applyDictionary(dict(), dir);
  const result = recheckDictionary(dict(), dir);
  assert.equal(result.remaining.length, 0);
  assert.ok(result.historicalAcknowledged.some((h) => h.term === "結線" && h.subject.includes("結線")));
});
