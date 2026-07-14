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
  assert.match(skill, /current conversation first[\s\S]*approved occurrence-level replacement dictionaries[\s\S]*approved general-term classifications[\s\S]*term-drift:allow/);
  assert.match(workflow, /現在の会話にある箇所別判断[\s\S]*承認済みの箇所単位置換辞書[\s\S]*台帳の承認済み一般語分類[\s\S]*理由付きの `term-drift:allow` 例外/);
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
  assert.match(workflow, /最初の実質的な判断面[\s\S]*語境界・全出現棚卸し・各出現の意味確認を内部で確定[\s\S]*未決グループ/);
  assert.match(workflow, /`実線で`[\s\S]*`実線`[\s\S]*提示前に境界を広げて全件を数える/);
});

test("全出現を個別検査し、意味同値だけをグループ化して未提示箇所への承認流用を拒否する", () => {
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
  assert.match(skill, /Approval authorizes only the explicitly listed members and rewrites in the current group/);
  assert.match(skill, /new, changed, or previously unlisted occurrence requires a new decision/);
  assert.match(skill, /Expand every approved replacement group into occurrence-level JSON dictionary items/);
  assert.match(workflow, /未提示箇所へ以前の承認を流用しない/);
  assert.match(workflow, /1語ずつ・意味グループごと/);
  assert.match(workflow, /字面が同じだけではまとめず、少しでも違うか迷う箇所は単独グループ/);
  assert.match(detect, /同じ判断へ至る出現だけを、同一の意味グループにまとめる/);
  assert.match(detect, /グループには対象となる全ファイル・行[\s\S]*代表例や件数だけで対象を隠さない/);
  assert.match(detect, /未提示・新規・変更された出現へ以前の承認を流用しない/);
  assert.match(detect, /同じ意味を持ち同じ文脈書き換えで意味を保てる2箇所[\s\S]*1グループ/);
  assert.match(detect, /字面が同じでも必須度・範囲・指示対象・例外[\s\S]*別グループ/);
  assert.match(detect, /グループ承認後に見つかった3箇所目[\s\S]*未決の新しい判断対象/);
});

test("意味検査の厚さを保ったまま通常の判断画面と承認後の遷移を軽くする", () => {
  assert.match(skill, /Keep each review prompt compact by default/);
  assert.match(skill, /Do not repeat the term summary, prior decisions, progress narration, or the full semantic checklist/);
  assert.match(skill, /Compact output compresses presentation only[\s\S]*individual reading and semantic checks remain complete/);
  assert.match(skill, /present the next unresolved group directly, without an acknowledgement, recap, or transition narration/);
  assert.match(workflow, /通常の判断面は、グループ内の全ファイル・行、各引用・各完成文、同じ判断にまとめられる理由1文/);
  assert.match(workflow, /内部では各出現の主体・対象・操作・因果・範囲・必須度・例外をすべて個別に確認/);
  assert.match(detect, /復唱・要約・つなぎの実況を挟まず、次の未決グループを直接示す/);
});

test("日英READMEが再開時の利用者体験を説明する", () => {
  const ja = fs.readFileSync(path.join(ROOT, "README.md"), "utf8");
  const en = fs.readFileSync(path.join(ROOT, "README_en.md"), "utf8");
  assert.match(ja, /全出現を個別に読み[\s\S]*意味と修正内容が同じ箇所だけをグループ/);
  assert.match(ja, /「造語チェックの続き」[\s\S]*次の未決グループから再開/);
  assert.match(en, /reads every occurrence individually[\s\S]*groups only occurrences with equivalent meaning/);
  assert.match(en, /continue a terminology review[\s\S]*resumes with the next unresolved semantic group/);
});
