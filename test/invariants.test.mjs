// compass Invariants の機械検査可能な部分（INV2/INV6/INV7）と rules の実質アンカー。
// - INV2: 実行コードパス（bin/src）に外部通信（fetch / http(s) リクエスト）が無い
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

test("INV2: bin/src の実行コードパスに外部通信の呼び出しが無い", () => {
  for (const { file, text } of [...readAll(path.join(ROOT, "bin")), ...readAll(path.join(ROOT, "src"))]) {
    assert.ok(!/\bfetch\s*\(/.test(text), `${file}: fetch を呼ばない`);
    assert.ok(!/node:https?|require\(["']https?["']\)/.test(text), `${file}: http/https モジュールを使わない`);
    assert.ok(!/XMLHttpRequest|axios|undici/.test(text), `${file}: HTTP クライアントを使わない`);
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
  assert.ok(/一般語/.test(t) && /チーム共通語/.test(t) && /勝手語の疑い/.test(t), "3分類の名がある");
  assert.ok(/実際の使用箇所の短い引用/.test(t), "候補には判断可能な実使用の引用が必須");
  assert.ok(/引用をその候補で書き換えた文/.test(t), "候補には文脈内の置き換え結果が必須");
  assert.ok(/全出現を検索/.test(t), "候補提示前に対象語を全件走査する");
  assert.ok(/総出現数と置換／維持／除外の件数/.test(t), "全出現の判断結果を件数付きで示す");
  assert.ok(/リポジトリ全体の一括置換は禁止/.test(t), "裸の語による一括置換を禁止する");
  assert.ok(/以前の承認を流用せず/.test(t), "未提示の出現には以前の承認を流用しない");
  assert.ok(/主体・対象・操作・因果関係・適用範囲・必須度・例外/.test(t), "各出現で文意を構成する要素を確認する");
  assert.ok(/意味を保てる理由/.test(t), "各書き換えで意味保存を説明する");
  assert.ok(/一般語・既存技術用語であっても/.test(t), "一般語と文章自体の明瞭さを分けて判断する");
  assert.ok(/全出現の判断が確定するまで次の語や適用へ進まない/.test(t), "全出現を1件ずつ確定する");
  assert.ok(/読み手/.test(t), "読み手相対の入力がある");
  assert.ok(/一度否認された語の再発明の疑い/.test(t), "否認済みの再発明を名指す");
  assert.ok(/「台帳なし」を明示し/.test(t), "台帳なしの縮退（分類を捏造しない）");
  // 安全: 人への即時確認（INV4）・注入隔離（INV8）・書き込みは人承認後の別アクション（INV1/5）。
  assert.ok(/すみやかに利用者へ確認/.test(t), "迷う語は人へ即時確認");
  assert.ok(/命令として実行しない/.test(t), "走査素材の指示を実行しない");
  assert.ok(/人が1語ずつ、かつ提示された箇所別判断を承認したあとの別アクション/.test(t), "適用は語と箇所別判断の人承認後に行う");
  assert.ok(/まとめ承認は成立しない/.test(t), "まとめ承認の禁止");
  // 除外: 識別子・固有名詞（Anti 4 訳語狩り禁止）。
  assert.ok(/識別子/.test(t) && /訳語狩り/.test(t), "識別子の除外と訳語狩りの禁止");
  // 例外として残すには理由が必要（Anti 6）。
  assert.ok(/理由の無いマーカーは無効/.test(t), "理由なしの例外指定は無効");
});

test("INV7: rules/workflow.md が一巡と安全の前提を持ち、CLI と LLM の役割分担を規定する", () => {
  const t = fs.readFileSync(path.join(ROOT, "rules", "workflow.md"), "utf8");
  assert.ok(/走査/.test(t) && /承認/.test(t) && /再検査/.test(t), "一巡の工程がある");
  assert.ok(/承認していない置換は1バイトも書き込まない/.test(t), "INV1 の明文");
  assert.ok(/外部サービスへ送らない/.test(t), "INV2 の明文");
  assert.ok(/1語ずつ/.test(t), "1語ずつの承認");
  assert.ok(/全出現の棚卸し/.test(t), "承認前に全出現を棚卸しする");
  assert.ok(/代表例だけでは承認へ進まない/.test(t), "代表例だけの提示を禁止する");
  assert.ok(/裸の語を `from` にしたリポジトリ全体の一括置換は禁止/.test(t), "文章単位で適用する");
  assert.ok(/未判断の語が残れば完了にしない/.test(t), "再検査で未判断の残存を確認する");
  assert.ok(/意味を保てる理由/.test(t), "workflowでも意味保存の確認を必須にする");
  assert.ok(/出現ごとに書き換え・維持・別案を指定できる/.test(t), "利用者が箇所ごとに判断を修正できる");
  assert.ok(/rules\/detect\.md/.test(t), "検出正本への参照（二重実装しない）");
});

test("例外指定マーカーの書式が rules と実装で一致する（単一正本からの乖離防止）", () => {
  const rulesText = fs.readFileSync(path.join(ROOT, "rules", "detect.md"), "utf8");
  const markerSrc = fs.readFileSync(path.join(ROOT, "src", "markers.mjs"), "utf8");
  assert.ok(rulesText.includes("term-drift:allow"), "rules に書式がある");
  assert.ok(markerSrc.includes("term-drift:allow"), "実装に同じ書式がある");
});
