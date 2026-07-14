import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const skill = fs.readFileSync(path.join(ROOT, "skills", "term-drift", "SKILL.md"), "utf8");
const workflow = fs.readFileSync(path.join(ROOT, "rules", "workflow.md"), "utf8");
const detect = fs.readFileSync(path.join(ROOT, "rules", "detect.md"), "utf8");

test("再開契約は既決事項の復元順と証拠不足時だけの確認を固定する", () => {
  assert.match(skill, /current conversation first[\s\S]*approved occurrence-level replacement dictionaries[\s\S]*ledger states[\s\S]*term-drift:allow/);
  assert.match(workflow, /現在の会話にある箇所別判断[\s\S]*承認済みの箇所単位置換辞書[\s\S]*台帳の承認済み・否認済み状態[\s\S]*理由付きの `term-drift:allow` 例外/);
  assert.match(skill, /exact next unresolved point cannot be proved[\s\S]*ask only which safe review point to resume from/);
  assert.match(workflow, /正確な次の未決箇所を証拠から決められない場合だけ/);
});

test("内部準備を利用者の操作判断へ変換しない", () => {
  assert.match(skill, /internal read-only preparation/);
  assert.match(skill, /Do not ask the user for term-drift permission[\s\S]*choose a CLI command/);
  assert.match(workflow, /read-only な内部準備/);
  assert.match(workflow, /操作ごとの許可、CLI コマンドの選択[\s\S]*利用者へ求めない/);
  assert.match(skill, /Obey any security approval that the host environment itself requires/);
  assert.match(workflow, /宿主環境が強制するセキュリティ承認には従う/);
});

test("最初の判断面は語境界と全件棚卸しが完成した1語である", () => {
  assert.match(skill, /Fix its exact term boundary and complete its occurrence inventory before the first substantive user-facing decision/);
  assert.match(skill, /`実線で` must be widened to the actual candidate `実線` before presentation/);
  assert.match(workflow, /最初の実質的な判断面[\s\S]*語境界と全出現棚卸しを内部で確定[\s\S]*未決の1箇所だけ/);
  assert.match(workflow, /`実線で`[\s\S]*`実線`[\s\S]*提示前に境界を広げて全件を数える/);
});

test("代表例・一括表示・新規開始への巻き戻し・未提示箇所への承認流用を拒否する", () => {
  for (const rejected of ["setup narration", "rules recap", "operational-choice question", "representative sample", "full-inventory approval screen", "bare term mapping"]) {
    assert.ok(skill.includes(rejected), `再開時の誤実装 ${rejected} を明示的に拒否する`);
  }
  assert.match(skill, /exactly one occurrence per decision turn/);
  assert.match(skill, /Even identical repeated passages are separate decisions/);
  assert.match(skill, /“all approved” counts only for that current occurrence/);
  assert.match(skill, /Earlier approval never covers text that was not shown/);
  assert.match(workflow, /未提示箇所へ以前の承認を流用しない/);
  assert.match(workflow, /1語ずつ・1箇所ずつ/);
  assert.match(detect, /判断を求める表示は常にファイル・行を特定した1箇所だけ/);
  assert.match(detect, /同一文面の反復も別箇所/);
});

test("意味検査の厚さを保ったまま通常の判断画面と承認後の遷移を軽くする", () => {
  assert.match(skill, /Keep the decision surface compact by default/);
  assert.match(skill, /do not repeat the term summary, prior decisions, progress narration, or the full semantic checklist/);
  assert.match(skill, /Compact output compresses presentation only[\s\S]*internal reading and semantic checks remain complete/);
  assert.match(skill, /present the next unresolved occurrence directly, without an acknowledgement, recap, or transition narration/);
  assert.match(workflow, /通常の判断面は、引用・完成文・意味保存理由1文/);
  assert.match(workflow, /内部では主体・対象・操作・因果・範囲・必須度・例外をすべて確認/);
  assert.match(detect, /復唱・要約・つなぎの実況を挟まず、次の未決1箇所を直接示す/);
});

test("日英READMEが再開時の利用者体験を説明する", () => {
  const ja = fs.readFileSync(path.join(ROOT, "README.md"), "utf8");
  const en = fs.readFileSync(path.join(ROOT, "README_en.md"), "utf8");
  assert.match(ja, /全出現を内部で棚卸し[\s\S]*一度に1箇所だけ/);
  assert.match(ja, /「造語チェックの続き」[\s\S]*全出現を内部棚卸しした次候補の未決1箇所から再開/);
  assert.match(en, /one occurrence at a time/);
  assert.match(en, /continue a terminology review[\s\S]*resumes with the next unresolved occurrence/);
});
