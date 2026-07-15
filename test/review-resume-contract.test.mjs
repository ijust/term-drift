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
  assert.match(workflow, /現在の会話に残っている箇所ごとの判断[\s\S]*承認済みの重ならない書き換え単位の辞書[\s\S]*台帳の承認済み一般語分類[\s\S]*理由付きの `term-drift:allow` 例外/);
  assert.match(skill, /exact next unresolved point cannot be proved[\s\S]*ask only which safe review point to resume from/);
  assert.match(workflow, /次に確認すべき未決の箇所を記録から特定できない場合に限り/);
});

test("一般語として承認した分類を永続化し、内輪転用へ流用しない", () => {
  assert.match(skill, /status: approved[\s\S]*classification: general/);
  assert.match(skill, /does not approve unclear wording or a project-specific repurposing/);
  assert.match(skill, /another session cannot recover it/);
  assert.match(workflow, /状態「承認済み」・分類「一般語」/);
  assert.match(workflow, /プロジェクト固有の意味で使っている箇所や、曖昧な文章まで維持すると承認したことにはならない/);
  assert.match(detect, /状態\*\*承認済み\*\*・分類\*\*一般語\/general\*\*/);
  assert.match(detect, /同じ表記でもプロジェクト固有の意味で使われている箇所/);
});

test("内部準備を利用者の操作判断へ変換しない", () => {
  assert.match(skill, /internal read-only preparation/);
  assert.match(skill, /Do not ask the user for term-drift permission[\s\S]*choose a CLI command/);
  assert.match(workflow, /読み取り専用の準備/);
  assert.match(workflow, /操作ごとの許可や、実行する CLI コマンドの選択[\s\S]*利用者に求めない/);
  assert.match(skill, /Obey any security approval that the host environment itself requires/);
  assert.match(workflow, /利用中の環境が要求するセキュリティ上の承認には従う/);
});

test("最初の判断面は語境界・全件棚卸し・個別意味確認が完成した1語のグループである", () => {
  assert.match(skill, /Fix its exact term boundary and complete its occurrence inventory before the first substantive user-facing decision/);
  assert.match(skill, /`実線で` must be widened to the actual candidate `実線` before presentation/);
  assert.match(workflow, /ガイド方式で最初に利用者へ確認するとき[\s\S]*語の範囲、全出現、各出現での意味を先に確認[\s\S]*未決グループ/);
  assert.match(workflow, /`実線で`[\s\S]*`実線`[\s\S]*提示する前に検索範囲を広げて全件を数える/);
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
  assert.match(workflow, /以前の個別承認を、まだ提示していない箇所に流用してはいけない/);
  assert.match(workflow, /通常は人が確認し、任された範囲ではエージェントが低リスクな箇所を判断/);
  assert.match(workflow, /表記が同じというだけではまとめず、少しでも違う場合や迷う場合は単独のグループ/);
  assert.match(detect, /元の意味を保てる理由が同じ箇所だけを、同じ意味のグループにまとめる/);
  assert.match(detect, /明確な範囲をエージェントに任せた場合/);
  assert.match(detect, /低リスクな箇所は、すべてを個別に確認した後でエージェントが判断/);
  assert.match(detect, /同じ意味で使われ、同じように書き換えても意味を保てる 2 箇所[\s\S]*1 つのグループ/);
  assert.match(detect, /表記が同じでも、必須度、範囲、指示の対象、例外[\s\S]*別のグループ/);
  assert.match(detect, /未決の箇所が残っていても、決定済みの箇所だけを適用/);
});

test("意味検査の厚さを保ったまま通常の判断画面と承認後の遷移を軽くする", () => {
  assert.match(skill, /Keep each guided-review prompt compact by default/);
  assert.match(skill, /State term-level classification and counts once/);
  assert.match(skill, /Compact output changes presentation only[\s\S]*individual reading and semantic checks remain complete/);
  assert.match(skill, /present the next unresolved group directly/);
  assert.match(workflow, /通常は、判断が必要なグループについて、すべてのファイルと行、各引用、書き換え後の文、元の意味を保てる理由を 1 文ずつ示す/);
  assert.match(workflow, /前後の文章と参照元を読み、主体、対象、操作、因果関係、範囲、必須度、例外を個別に確認/);
  assert.match(detect, /ガイド方式では[\s\S]*すべてのファイル、行、引用、完成文、元の意味を保てる理由を簡潔に示す/);
});

test("短い置換で意味を落とさず、現状承認と未解決を分ける", () => {
  assert.match(skill, /Test a short replacement inside the complete rewritten passage/);
  assert.match(skill, /smallest heading, sentence, or paragraph that can preserve/);
  assert.match(skill, /current wording is clear and appropriate/);
  assert.match(skill, /no safe rewrite/);
  assert.match(skill, /meaning unresolved/);
  assert.match(workflow, /適切な用語だと判断できる場合だけ `kept`/);
  assert.match(workflow, /理由を「安全な書き換えなし」として `deferred`/);
  assert.match(workflow, /理由を「意味未確定」として `deferred`/);
  assert.match(detect, /必要最小限の見出し、文、段落を書き換える/);
  assert.match(detect, /保留欄を埋めるためだけに、根拠のない書き換え案を作ってはいけない/);
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
  assert.match(workflow, /検査は出現箇所ごとに行い/);
  assert.match(workflow, /範囲が重複、包含、部分交差する項目/);
  assert.match(detect, /正の整数で表す散文中の出現数 `term_occurrences`/);
  assert.match(detect, /別の未決候補語を同じ項目に含めてはいけない/);
  assert.match(detect, /`decision_metadata_version: 1`/);
  assert.match(detect, /`decision_source`、`decided_at`、`delegation_scope`/);
});

test("日英READMEが再開時の利用者体験を説明する", () => {
  const ja = fs.readFileSync(path.join(ROOT, "README.md"), "utf8");
  const en = fs.readFileSync(path.join(ROOT, "README_en.md"), "utf8");
  assert.match(ja, /全出現を個別に読み[\s\S]*意味と修正内容が同じ箇所だけをグループ/);
  assert.match(ja, /「造語チェックの続き」[\s\S]*次の未決グループから再開/);
  assert.match(en, /reads every occurrence individually[\s\S]*groups only occurrences with equivalent meaning/);
  assert.match(en, /continue a terminology review[\s\S]*resumes with the next unresolved semantic group/);
});
