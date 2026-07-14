// 対象リポへの導入（目印 `.term-drift/` と台帳の雛形の配置）。
// 非破壊: 既存ファイルを上書きしない（同名があればスキップして報告する）。
// 台帳は `.intent/glossary.md` があればそちらが正本なので、雛形を作らない（二重台帳を作らない・DR4）。

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveLedgerPath } from "./ledger.mjs";
import { isContainedRegularFile, isExistingPathInside } from "./path-safety.mjs";

// 配布物に同梱された検出 rules（正本）の在り処。
const PACKAGED_RULES_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "rules");

const LEDGER_TEMPLATE = `# Glossary（用語の台帳）

> このプロジェクトで合意した用語と、一般語として確認済みの判断をまとめた表です。term-drift はこの台帳を正本として読み、
> 台帳に無い語・暫定のままの語を「未承認の独自用語の疑い」として名指しします。
> **編集の主体は人です。** 人が1語ずつ内容を確かめて承認した登録・置換に限り、ツールが代わりに書き足せます。
> 承認なしの自動改変はしません。

## この台帳の使い方

- **一行説明は、初見の人に通じる普通の言葉で書きます。** 普通の言葉で説明できない語は、その語を登録すること自体を見直してください。
- **登録・昇格は1語ずつです。** 複数語をまとめた一括登録・確認を省いた流れ作業の承認・承認なしの状態の昇格は、登録として成立しません。
- **否認済みの語は削除せず残します。** 行を消さずに状態を「否認済み」にすると、同じ語が後からまた発明されたときに「一度否認された語の再発明」として気づけます。
- **一般語として承認した判断も残せます。** 状態を「承認済み」、分類を「一般語」にすると、既定の読み手に対する同じ分類を次回のレビューで復元できます。文章自体の曖昧さや、別の内輪の意味への転用は引き続き検査します。

## 記入スキーマ（最小3項目＋任意3項目）

先頭3項目（正規語・別表記・一行説明）が最小の記入単位です。後ろ3項目（状態・言い換え例・分類）は任意で、旧3列・5列の行もそのまま有効です。

- **状態**は3値です — \`承認済み\`（チームで合意済みの共通語）／\`暫定\`（登録した人の暫定の語）／\`否認済み\`（採用しないと決めた語。行は残します）。**状態が書かれていない行は「暫定」として読みます。**
- **言い換え例**は、その語を知らない読み手に向けて開くときの言い方の例です。
- **分類**は \`一般語\` / \`general\` または \`チーム共通語\` / \`team\` です。一般語の分類は状態が「承認済み」の行だけ有効です。空欄なら従来どおり状態から扱いを決めます。

| 正規語 | 別表記・同義語 | 一行説明 | 状態 | 言い換え例 | 分類 |
|---|---|---|---|---|---|
`;

/**
 * 対象リポへ目印と台帳の雛形を置く（非破壊）。
 * @returns {{ created: string[], skipped: string[], ledger: string | null, notes: string[] }}
 */
export function initTermDrift(dir) {
  const created = [];
  const skipped = [];
  const notes = [];

  const markerDir = path.join(dir, ".term-drift");
  if (fs.existsSync(markerDir)) {
    const stat = fs.lstatSync(markerDir);
    if (stat.isSymbolicLink() || !stat.isDirectory() || !isExistingPathInside(dir, markerDir)) {
      throw new Error("安全のため init を拒否しました: .term-drift は対象リポ内の通常ディレクトリである必要があります");
    }
    skipped.push(".term-drift/");
  } else {
    fs.mkdirSync(markerDir, { recursive: true });
    created.push(".term-drift/");
  }

  // 台帳: .intent/glossary.md があればそれが正本（雛形を作らない＝二重台帳を作らない）。
  const existing = resolveLedgerPath(dir);
  let ledger = existing ? path.relative(dir, existing) : null;
  if (existing) {
    skipped.push(ledger);
    notes.push(`台帳は既存の ${ledger} を正本として使います（新しい台帳は作りませんでした）。`);
  } else {
    const own = path.join(markerDir, "glossary.md");
    fs.writeFileSync(own, LEDGER_TEMPLATE);
    ledger = path.relative(dir, own);
    created.push(ledger);
    notes.push(`台帳の雛形を ${ledger} に置きました。正規語を1語ずつ登録して育ててください。`);
  }

  // 検出 rules を対象リポへ配置する（非破壊）。
  //
  // 「対象リポに配置された実体」として置くことが要点: 他のツール（intent-planner の造語検査など）は
  // この場所を読んで検出を実行し、node_modules・npx キャッシュのコピーは見ない（そこには過去に
  // publish された古い版が落ちてくるため）。ここに置いてあるものが、そのリポでの正本になる。
  const rulesDir = path.join(markerDir, "rules");
  if (fs.existsSync(rulesDir)) {
    const stat = fs.lstatSync(rulesDir);
    if (stat.isSymbolicLink() || !stat.isDirectory() || !isExistingPathInside(dir, rulesDir)) {
      throw new Error("安全のため init を拒否しました: .term-drift/rules は対象リポ内の通常ディレクトリである必要があります");
    }
  } else {
    fs.mkdirSync(rulesDir, { recursive: true });
  }
  for (const name of ["detect.md", "workflow.md"]) {
    const dest = path.join(rulesDir, name);
    const rel = path.relative(dir, dest);
    if (fs.existsSync(dest)) {
      if (!isContainedRegularFile(dir, dest)) {
        throw new Error(`安全のため init を拒否しました: ${rel} は対象リポ内の通常ファイルである必要があります`);
      }
      skipped.push(rel);
      continue;
    }
    fs.copyFileSync(path.join(PACKAGED_RULES_DIR, name), dest);
    created.push(rel);
  }

  notes.push("次にやること: インストールした skill から term-drift を起動してください（進め方は .term-drift/rules/workflow.md にあります）。");
  return { created, skipped, ledger, notes };
}

/** 対象リポ固有の rules が安全に配置済みなら返す。なければ null。 */
export function resolveLocalRules(dir) {
  const paths = ["detect.md", "workflow.md"].map((name) => path.join(dir, ".term-drift", "rules", name));
  return paths.every((p) => isContainedRegularFile(dir, p)) ? paths : null;
}
