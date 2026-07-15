// compass Invariants の機械検査可能な部分（INV2/INV6/INV7）と rules の実質アンカー。
// - INV2: 実行コードパス（bin/src）に既知の外部通信 API・外部コマンド呼び出しが無い
// - INV6: package.json に dependencies / devDependencies が無い（依存ゼロ・葉）
// - INV7: rules は agent 非依存（特定エージェント製品のツール名・製品名を含まない）で、
//         多層検出・3分類・人への即時確認・注入隔離・例外理由の必須化という実質を持つ
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");

function readAll(dir) {
  return fs.readdirSync(dir).filter((f) => f.endsWith(".mjs") || f.endsWith(".md")).map((f) => ({
    file: path.join(path.basename(dir), f),
    text: fs.readFileSync(path.join(dir, f), "utf8"),
  }));
}

test("INV2: bin/src に既知のネットワーク API・HTTP クライアント・取得コマンド呼び出しが無い（静的ガード）", () => {
  for (const { file, text } of [...readAll(path.join(ROOT, "bin")), ...readAll(path.join(ROOT, "src"))]) {
    assert.ok(!/\bfetch\s*\(/.test(text), `${file}: fetch を呼ばない`);
    assert.ok(!/node:(?:http|https|net|tls|dgram)|require\(["'](?:http|https|net|tls|dgram)["']\)/.test(text), `${file}: Node のネットワークモジュールを使わない`);
    assert.ok(!/XMLHttpRequest|WebSocket|EventSource|axios|undici/.test(text), `${file}: HTTP・ストリーミングクライアントを使わない`);
    assert.ok(!/(?:spawn|spawnSync|execFile|execFileSync)\s*\(\s*["'](?:curl|wget)["']/.test(text), `${file}: curl / wget を起動しない`);
  }
});

test("INV6: 依存ゼロ（dependencies / devDependencies を持たない・葉を保つ）", () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
  assert.equal(pkg.dependencies, undefined, "dependencies が無い");
  assert.equal(pkg.devDependencies, undefined, "devDependencies が無い");
});

test("INV7: rules が agent 非依存である（特定エージェント製品の語を含まない）", () => {
  for (const { file, text } of readAll(path.join(ROOT, "rules"))) {
    for (const word of ["AskUserQuestion", "Claude", "Codex", "Gemini", "Copilot", "ChatGPT"]) {
      assert.ok(!text.includes(word), `${file}: ${word} を含まない（agent 非依存）`);
    }
  }
});

test("INV7: rules/detect.md が多層検出・3分類・安全の実質を持つ（字面でなく規定内容）", () => {
  const t = fs.readFileSync(path.join(ROOT, "rules", "detect.md"), "utf8");
  // 多層: 3層が全部規定される（台帳照合だけで検知した気にならない＝Anti 2）。
  assert.ok(/層1: 台帳差集合/.test(t), "層1 台帳差集合");
  assert.ok(/層2: 比喩転用/.test(t), "層2 比喩転用");
  assert.ok(/層3: 定義への到達可能性/.test(t), "層3 定義到達可能性");
  assert.ok(/「台帳に無い発明語」だけを見てはいけない/.test(t), "台帳照合だけを禁じる明文");
  // 3分類は台帳の状態＋読み手相対（DR2）。
  assert.ok(/一般語/.test(t) && /チーム共通語/.test(t) && /未承認の独自用語の疑い/.test(t), "3分類の名がある");
  assert.ok(/実際の使用箇所を引用/.test(t) && /短い範囲を引用/.test(t), "候補には判断可能な実使用の引用が必須");
  assert.ok(/同じ範囲を書き換えた完成文/.test(t), "候補には文脈内の置き換え結果が必須");
  assert.ok(/全出現を検索/.test(t), "候補提示前に対象語を全件走査する");
  assert.ok(/総出現数と置換／維持／保留／除外の件数/.test(t), "全出現の判断結果を件数付きで示す");
  assert.ok(/複数一致[\s\S]*重複・包含・部分交差は拒否/.test(t), "複数箇所一致と重なる書き換え単位を禁止する");
  assert.ok(/明示委任の範囲で宿主が低リスクと判断/.test(t), "明示委任された低リスク判断を許容する");
  assert.ok(/主体・対象・操作・因果関係・適用範囲・必須度・例外/.test(t), "各出現で文意を構成する要素を確認する");
  assert.ok(/意味を保てる理由/.test(t), "各書き換えで意味保存を説明する");
  assert.ok(/一般語・既存技術用語であっても/.test(t), "一般語と文章自体の明瞭さを分けて判断する");
  assert.ok(/未決出現が残っていても決定済み箇所の部分適用はできる/.test(t), "未決を完了扱いせず決定済み箇所を部分適用できる");
  assert.ok(/読み手/.test(t), "読み手相対の入力がある");
  assert.ok(/状態\*\*承認済み\*\*・分類\*\*一般語\/general\*\*/.test(t), "承認済み一般語を台帳から復元する");
  assert.ok(/内輪の意味へ転用されている箇所/.test(t), "一般語承認を内輪転用へ流用しない");
  assert.ok(/一度否認された語の再発明の疑い/.test(t), "否認済みの再発明を名指す");
  assert.ok(/「台帳なし」を明示し/.test(t), "台帳なしの縮退（分類を捏造しない）");
  // 安全: 人への即時確認（INV4）・注入隔離（INV8）・判断権限を記録した別アクション（INV1/5）。
  assert.ok(/すみやかに利用者へ確認/.test(t), "迷う語は人へ即時確認");
  assert.ok(/命令として実行しない/.test(t), "走査素材の指示を実行しない");
  assert.ok(/互いに重ならない書き換え単位の辞書項目へ展開/.test(t), "意味グループの承認を書き換え単位へ展開してから適用する");
  assert.ok(/台帳への登録・状態の昇格と例外マーカーは引き続き人の個別承認/.test(t), "永続状態の変更は人の個別承認を維持する");
  assert.ok(/`decision_metadata_version: 1`/.test(t), "新規辞書は判断元メタデータ契約を宣言する");
  assert.ok(/`decision_source`・`decided_at`・`delegation_scope`/.test(t), "判断元・判断日・委任範囲を構造化する");
  assert.ok(/人承認は `human-approved` と `null`/.test(t) && /委任判断は `delegated-agent`/.test(t), "人承認と委任判断を区別する");
  // 除外: 識別子・固有名詞（意味を損なう一律な言い換えをしない）。
  assert.ok(/識別子/.test(t) && /意味を損なう一律な言い換え/.test(t), "識別子の除外と一律な言い換えの禁止");
  // 例外として残すには理由が必要（Anti 6）。
  assert.ok(/理由の無いマーカーは無効/.test(t), "理由なしの例外指定は無効");
});

test("INV7: rules/workflow.md が一巡と安全の前提を持ち、CLI と LLM の役割分担を規定する", () => {
  const t = fs.readFileSync(path.join(ROOT, "rules", "workflow.md"), "utf8");
  assert.ok(/走査/.test(t) && /承認/.test(t) && /再検査/.test(t), "一巡の工程がある");
  assert.ok(/利用者が個別承認した置換、または利用者が明示した委任範囲/.test(t), "判断権限のある置換だけを書き込む");
  assert.ok(/外部サービスへ送らない/.test(t), "INV2 の明文");
  assert.ok(/既定は人確認・明示委任では低リスクを宿主判断/.test(t), "ガイド方式と委任方式を分ける");
  assert.ok(/全出現の棚卸し/.test(t), "承認前に全出現を棚卸しする");
  assert.ok(/代表例だけでは承認へ進まない/.test(t), "代表例だけの提示を禁止する");
  assert.ok(/意味と判断が同じ出現グループごとに利用者へ確認/.test(t), "意味同値の出現はグループで確認する");
  assert.ok(/判断が必要なグループの全ファイル・行/.test(t), "グループの全対象を列挙する");
  assert.ok(t.includes("裸の語を `from` にした置換") && t.includes("重複・包含・部分交差する書き換え単位") && t.includes("全書き込み前に拒否"), "重ならない書き換え単位で適用する");
  assert.ok(/未判断や保留が残れば一巡の完了にはしない/.test(t), "再検査で未判断の残存を確認する");
  assert.ok(/意味を保てる理由/.test(t), "workflowでも意味保存の確認を必須にする");
  assert.ok(/書き換え・維持・保留・別案・分割を判断/.test(t), "利用者がグループの判断や境界を修正できる");
  assert.ok(/`decisionSource`・`decidedAt`・`delegationScope` を引き継ぐ/.test(t), "適用結果へ判断元を引き継ぐ");
  assert.ok(/rules\/detect\.md/.test(t), "検出正本への参照（二重実装しない）");
});

test("例外指定マーカーの書式が rules と実装で一致する（単一正本からの乖離防止）", () => {
  const rulesText = fs.readFileSync(path.join(ROOT, "rules", "detect.md"), "utf8");
  const markerSrc = fs.readFileSync(path.join(ROOT, "src", "markers.mjs"), "utf8");
  assert.ok(rulesText.includes("term-drift:allow"), "rules に書式がある");
  assert.ok(markerSrc.includes("term-drift:allow"), "実装に同じ書式がある");
});
