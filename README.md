# term-drift

[English](README_en.md) | 日本語

term-drift detects terminology introduced or distorted during AI-assisted development and helps keep project documents aligned with the project's ubiquitous language.

AI 支援開発の中で持ち込まれたり意味が歪められたりした用語を見つけ出し、ガイド付き確認または明示委任された低リスク判断でプロジェクトの文書を正規語彙（ubiquitous language）へ揃え直す、エージェント向けスキルと決定的な CLI の組み合わせです。

## Installation

必要なものは Node.js 18.17 以降と git だけです。対象プロジェクトのルートで、利用するエージェントに合わせてインストーラーを実行します。

```bash
# Claude Code（既定）
npx term-drift@latest

# 明示的に選ぶ場合
npx term-drift@latest --claude
npx term-drift@latest --codex
npx term-drift@latest --gemini
```

インストーラーは `.term-drift/` と、選択したエージェントのプロジェクトローカルなskillを配置します。`.term-drift/version.json` にインストールしたterm-driftのバージョンを記録し、skillは `@latest` ではなく、その固定バージョンのCLIを `npx` で実行します。対象プロジェクトの `package.json`・lockfile・`node_modules` は変更しません。

- Claude Code: `.claude/skills/term-drift/`
- Codex: `.agents/skills/term-drift/`
- Gemini CLI: `.gemini/skills/term-drift/`

既存の台帳・rules・同内容のskillは上書きしません。内容が異なる同名skillがあれば、勝手に置き換えずインストール未完了として停止します。

既存導入を更新する場合は、利用中のエージェントを指定して安全な更新コマンドを実行します。

```bash
npx term-drift@latest update --claude
npx term-drift@latest update --codex
npx term-drift@latest update --gemini
```

`update`は既知の公式配布版と一致するrules・skillだけを一括更新します。利用者が変更した可能性がある資産は上書きせず停止し、途中で失敗した場合は変更を元に戻します。全資産の検証に成功した後だけ`.term-drift/version.json`を更新するため、versionだけが新しくrulesが古い状態を完了として記録しません。

## Quick start（推奨: スキルから使う）

インストール後、対象リポジトリでterm-driftを起動します。Claude Codeでは明示的に起動できます。

```text
/term-drift
```

CodexとGemini CLIでは、次のように依頼できます。

```text
term-drift で用語を点検して
```

人が `term-drift init /path/to/repository` を組み立てることは想定していません。インストーラーが台帳・rules・skillの配置先を決定し、必要な資産をすべて検証した後だけインストール完了を表示します。

term-drift 自身はLLM APIを呼びません。意味の読解と、明示委任された低リスク判断は利用者が選んだエージェント、重要な判断と台帳変更は人、走査・適用・再検査は決定的なCLIが担います。

候補は単語の一覧ではありません。全出現を個別に読み、意味と修正内容が同じ箇所だけをグループにまとめます。既定のガイド方式では、対象となる全ファイル・行、引用、置き換え後の文を人が確認します。利用者がリポジトリ・現在のレビュー・特定語など明確な範囲を委任した場合、エージェントは低リスク箇所を自分で判断して進め、意味不明、重要な代案、義務・法務・セキュリティ・公開API・実行時挙動へ影響する箇所だけを人へ戻します。包括委任は推奨せず、全出現の個別検査と適用箇所の記録はどちらの方式でも省略しません。

レビューの途中で「造語チェックの続き」と依頼した場合、skillは会話と承認済み記録から既決事項を復元し、操作手順を聞き直さず、全出現を内部棚卸しした次の未決グループから再開します。一般語として承認した語は、台帳の任意の「分類」列へ状態「承認済み」・分類「一般語」と記録できるため、別セッションで同じ分類を聞き直しません。この記録は語の分類だけに効き、内輪の意味への転用や曖昧な文章は引き続き検査します。再開位置を証拠から確定できない場合だけ、復元内容と不足を短く示して安全な再開点を確認します。

CLIはスキルの実行基盤です。開発・デバッグや別のエージェント統合から直接利用する場合は、下記のCommandsを参照してください。

## 何をするか（最小の一巡）

1. **走査** — 対象リポジトリの文書を read-only で集める（コミットメッセージ・計画文書を優先。秘密ファイルは集めない）
2. **検出** — 台帳に無い発明語だけでなく、普通の言葉の内輪転用（「配線」型の比喩）も含めて怪しい語を挙げる
3. **3分類** — 一般語／チーム共通語（台帳に承認済みで載る語）／未承認の独自用語の疑いに仕分ける。迷う語はすみやかに利用者へ確認する
4. **引用つき言い換え提案** — 実際の使用箇所を引用し、台帳の言い換え例を根拠に置き換え語と置き換え後の文を提案する
5. **判断権限** — 既定は人が意味グループごとに確認する。明示委任された範囲では、エージェントが低リスク箇所を判断し、高リスク箇所だけ人へ確認する
6. **機械的な適用** — 承認された置換だけを、同じ入力から同じ結果になる処理でファイルへ適用する（git 管理下でのみ・可逆）
7. **再検査** — 適用後に検出を再実行し、指摘ゼロ（または理由を添えた例外のみ）へ収束させる

## 安全上の原則

- 人が承認したか、明示委任の範囲で低リスクと判断した置換だけを書き込む
- 実行時に外部サービスへ通信しない
- 秘密ファイル（.env・鍵・認証情報）を走査対象にしない
- 判断に迷う語は黙って処理せず、すみやかに利用者へ確認する

## Commands

```text
term-drift
term-drift --claude | --codex | --gemini
term-drift update --claude|--codex|--gemini [dir]
term-drift init [dir]
term-drift scan [dir]
term-drift ledger [dir]
term-drift apply <dictionary.json> [dir]
term-drift recheck <dictionary.json> [dir]
term-drift rules [dir]
```

引数なしと3つのagentオプションは、現在のディレクトリへのproject-local installです。その他のサブコマンドはskillが使う決定的な実行基盤で、開発・デバッグ・別の統合から直接利用できます。

`apply` は判断済みの項目だけを、指定された相対path内の一意な1箇所へ適用します。新形式では判断元も検証し、適用結果の各変更へ書き換え単位の `from`・`to` と `decisionSource`・`decidedAt`・`delegationScope` を返します。pathが無い辞書や、1項目が複数箇所に一致する辞書は書き込み前に拒否します。対象はgit追跡済みのUTF-8文書です。未ステージ変更があっても、現在内容に`from`が一意に一致すれば他の差分を保持して適用し、`warningsDirty`とstderrで警告します。未追跡・非UTF-8・曖昧一致・重なる置換・コードやリンク先などの保護領域変更は引き続き拒否またはスキップします。

判断元を後から区別できる新規辞書の最小形式:

```json
{
  "decision_metadata_version": 1,
  "replacements": [
    { "term": "結線", "term_occurrences": 1, "path": "docs/setup.md", "from": "接続を結線して完了する。", "to": "接続をつなぎ込んで完了する。", "approved": true, "decision_source": "human-approved", "decided_at": "2026-07-16", "delegation_scope": null }
  ]
}
```

`decision_source` は人が個別承認した場合 `human-approved`、明示委任内でAIが低リスク判断した場合 `delegated-agent` です。後者では `delegation_scope` に委任範囲を記録します。旧辞書も適用できますが、その変更は `decisionSource: legacy-unknown` と報告されます。適用した辞書を `.term-drift/` 配下へ残すと、本文にマーカーを埋めず判断元を追跡できます。

## Documentation

- [理論的背景](docs/theory.md)（[English](docs/theory_en.md)）— なぜ台帳・多層検出・明示的な判断権限・決定的適用が必要なのか
- [検出 rules](rules/detect.md) — 多層検出・3分類・除外条件
- [一巡の進め方](rules/workflow.md) — 走査から再検査までの手順

## Status

walking skeleton 完了。安全境界と検出精度を継続して改善中。

実在2リポジトリを使った有界検証では、検出対象として到達可能だった24件中17件（約71%）が一致しました。完全な自動分類器ではなく、人が確認する候補を作るための検査手順です。

## License

MIT
