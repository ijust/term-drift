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
  assert.match(skill, /current conversation first[\s\S]*approved non-overlapping rewrite-unit dictionaries[\s\S]*approved general-term classifications[\s\S]*term-drift:allow/);
  assert.match(workflow, /現在の会話にある箇所別判断[\s\S]*承認済みの重ならない書き換え単位の辞書[\s\S]*台帳の承認済み一般語分類[\s\S]*理由付きの `term-drift:allow` 例外/);
  assert.match(skill, /exact next unresolved point cannot be proved[\s\S]*ask only which safe review point to resume from/);
  assert.match(workflow, /正確な次の未決箇所を証拠から決められない場合だけ/);
});

test("一般語として承認した分類を永続化し、内輪転用へ流用しない", () => {
  assert.match(skill, /status: approved[\s\S]*classification: general/);
  assert.match(skill, /does not approve unclear wording or a project-specific repurposing/);
  assert.match(skill, /another session cannot recover it/);
  assert.match(workflow, /状態「承認済み」・分類「一般語」/);
  assert.match(workflow, /内輪転用や曖昧な文章まで維持承認したことにはならない/);
  assert.match(detect, /状態\*\*承認済み\*\*・分類\*\*一般語\/general\*\*/);
  assert.match(detect, /同じ字面でも内輪の意味へ転用されている箇所/);
});

test("内部準備を利用者の操作判断へ変換しない", () => {
  assert.match(skill, /internal read-only preparation/);
  assert.match(skill, /Do not ask the user for term-drift permission[\s\S]*choose a CLI command/);
  assert.match(workflow, /read-only な内部準備/);
  assert.match(workflow, /操作ごとの許可、CLI コマンドの選択[\s\S]*利用者へ求めない/);
  assert.match(skill, /Obey any security approval that the host environment itself requires/);
  assert.match(workflow, /宿主環境が強制するセキュリティ承認には従う/);
});

test("最初の判断面は語境界・全件棚卸し・個別意味確認が完成した1語のグループである", () => {
  assert.match(skill, /Fix its exact term boundary and complete its occurrence inventory before the first substantive user-facing decision/);
  assert.match(skill, /`実線で` must be widened to the actual candidate `実線` before presentation/);
  assert.match(workflow, /ガイド方式の最初の判断面[\s\S]*語境界・全出現棚卸し・各出現の意味確認を内部で確定[\s\S]*未決グループ/);
  assert.match(workflow, /`実線で`[\s\S]*`実線`[\s\S]*提示前に境界を広げて全件を数える/);
});

test("全出現を個別検査し、ガイド確認と明示委任を安全に分ける", () => {
  for (const rejected of ["setup narration", "rules recap", "operational-choice question", "representative sample", "unreviewed full-inventory batch", "bare term mapping"]) {
    assert.ok(skill.includes(rejected), `再開時の誤実装 ${rejected} を明示的に拒否する`);
  }
  assert.match(skill, /Classify and inspect every occurrence individually/);
  assert.match(skill, /partition the occurrences into semantic review groups/);
  assert.match(skill, /Group occurrences only when their classification, referent, actor, object, operation, causality, scope, strength, exceptions, proposed action, and semantic-preservation reason lead to the same decision/);
  assert.match(skill, /Surface similarity alone is insufficient/);
  assert.match(skill, /single-occurrence group is the safe fallback/);
  assert.match(skill, /same meaning and the same contextual rewrite may form one group after both are inspected/);
  assert.match(skill, /visually identical occurrences with different obligation strength, scope, referent, or exceptions must be separate groups/);
  assert.match(skill, /discovered after a group was approved is a new undecided occurrence/);
  assert.match(skill, /A group card must enumerate every member/);
  assert.match(skill, /Use guided review by default/);
  assert.match(skill, /explicitly delegates terminology decisions/);
  assert.match(skill, /Pause delegated review and ask the user only when/);
  assert.match(skill, /decided rewrite units may be applied while other occurrences remain unresolved/);
  assert.match(skill, /Expand decided replacement groups into non-overlapping rewrite-unit JSON dictionary items/);
  assert.match(workflow, /以前の個別承認を未提示箇所へ流用しない/);
  assert.match(workflow, /既定は人確認・明示委任では低リスクを宿主判断/);
  assert.match(workflow, /字面が同じだけではまとめず、少しでも違うか迷う箇所は単独グループ/);
  assert.match(detect, /同じ判断へ至る出現だけを、同一の意味グループにまとめる/);
  assert.match(detect, /明確な範囲を宿主エージェントへ委任/);
  assert.match(detect, /低リスクな出現は全件を個別検査した後に宿主が判断/);
  assert.match(detect, /同じ意味を持ち同じ文脈書き換えで意味を保てる2箇所[\s\S]*1グループ/);
  assert.match(detect, /字面が同じでも必須度・範囲・指示対象・例外[\s\S]*別グループ/);
  assert.match(detect, /未決出現が残っていても決定済み箇所の部分適用/);
});

test("意味検査の厚さを保ったまま通常の判断画面と承認後の遷移を軽くする", () => {
  assert.match(skill, /Keep each guided-review prompt compact by default/);
  assert.match(skill, /State term-level classification and counts once/);
  assert.match(skill, /Compact output changes presentation only[\s\S]*individual reading and semantic checks remain complete/);
  assert.match(skill, /present the next unresolved group directly/);
  assert.match(workflow, /通常表示は、判断が必要なグループの全ファイル・行、各引用、各完成文、意味保存理由1文へ圧縮/);
  assert.match(workflow, /各箇所の周辺と参照元を読み、主体・対象・操作・因果・範囲・必須度・例外を個別に確認/);
  assert.match(detect, /ガイド方式では[\s\S]*判断が必要なグループの全ファイル・行・引用・完成文・意味保存理由を簡潔に示す/);
});

test("短い置換で意味を落とさず、現状承認と未解決を分ける", () => {
  assert.match(skill, /Test a short replacement inside the complete rewritten passage/);
  assert.match(skill, /smallest heading, sentence, or paragraph that can preserve/);
  assert.match(skill, /current wording is clear and appropriate/);
  assert.match(skill, /no safe rewrite/);
  assert.match(skill, /meaning unresolved/);
  assert.match(workflow, /適切な用語として承認できる場合だけ `kept`/);
  assert.match(workflow, /理由「安全な書き換えなし」の `deferred`/);
  assert.match(workflow, /理由「意味未確定」の `deferred`/);
  assert.match(detect, /必要な最小限の見出し・文・段落へ開く/);
  assert.match(detect, /`deferred` を埋めるために書き換え案を捏造しない/);
});

test("全出現を検査したまま重ならない書き換え単位へ展開する", () => {
  assert.match(skill, /Continue to inspect and enumerate every occurrence individually/);
  assert.match(skill, /positive integer `term_occurrences`/);
  assert.match(skill, /Every new dictionary has `decision_metadata_version: 1`/);
  assert.match(skill, /`decision_source`, `decided_at`, and `delegation_scope`/);
  assert.match(skill, /`decision_source: human-approved` with `delegation_scope: null`/);
  assert.match(skill, /`decision_source: delegated-agent` with the explicit scope text/);
  assert.match(skill, /Legacy dictionaries without `decision_metadata_version` or `term_occurrences` remain readable/);
  assert.match(skill, /`decisionSource: legacy-unknown`/);
  assert.match(skill, /keep each applied dictionary under `.term-drift\/` as the durable decision record/);
  assert.match(workflow, /検査は出現ごとのまま保ち/);
  assert.match(workflow, /重複・包含・部分交差する書き換え単位/);
  assert.match(detect, /正の整数である散文出現数 `term_occurrences`/);
  assert.match(detect, /別の未決候補語を同じ項目へ含めず/);
  assert.match(detect, /`decision_metadata_version: 1`/);
  assert.match(detect, /`decision_source`・`decided_at`・`delegation_scope`/);
});

test("日英READMEが再開時の利用者体験を説明する", () => {
  const ja = fs.readFileSync(path.join(ROOT, "README.md"), "utf8");
  const en = fs.readFileSync(path.join(ROOT, "README_en.md"), "utf8");
  assert.match(ja, /全出現を個別に読み[\s\S]*意味と修正内容が同じ箇所だけをグループ/);
  assert.match(ja, /「造語チェックの続き」[\s\S]*次の未決グループから再開/);
  assert.match(en, /reads every occurrence individually[\s\S]*groups only occurrences with equivalent meaning/);
  assert.match(en, /continue a terminology review[\s\S]*resumes with the next unresolved semantic group/);
});
