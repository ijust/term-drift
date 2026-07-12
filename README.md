# term-drift

[English](README_en.md) | 日本語

term-drift detects terminology introduced or distorted during AI-assisted development and helps keep project documents aligned with the project's ubiquitous language.

AI 支援開発の中で持ち込まれたり意味が歪められたりした用語を見つけ出し、人が承認した言い換えでプロジェクトの文書を正規語彙（ubiquitous language）へ揃え直す、エージェント向けスキルと決定的な CLI の組み合わせです。

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

term-drift 自身はLLM APIを呼びません。意味の読解は利用者が選んだエージェント、承認は人、走査・適用・再検査は決定的なCLIが担います。

候補は単語の一覧ではなく、実際に使われている箇所の短い引用、出典、置き換え語の候補、置き換え後の文を1語ずつ提示します。人は前後の意味と書き換え結果を見て、承認・否認・保留を判断できます。

CLIはスキルの実行基盤です。開発・デバッグや別のエージェント統合から直接利用する場合は、下記のCommandsを参照してください。

## 何をするか（最小の一巡）

1. **走査** — 対象リポジトリの文書を read-only で集める（コミットメッセージ・計画文書を優先。秘密ファイルは集めない）
2. **検出** — 台帳に無い発明語だけでなく、普通の言葉の内輪転用（「配線」型の比喩）も含めて怪しい語を挙げる
3. **3分類** — 一般語／チーム共通語（台帳に承認済みで載る語）／勝手語の疑い、に仕分ける。迷う語はすみやかに利用者へ確認する
4. **引用つき言い換え提案** — 実際の使用箇所を引用し、台帳の言い換え例を根拠に置き換え語と置き換え後の文を提案する
5. **人承認** — 1語ずつ個別に承認する（まとめ承認はできない）
6. **決定的適用** — 承認された置換だけをファイルへ適用する（git 管理下でのみ・可逆）
7. **再検査** — 適用後に検出を再実行し、指摘ゼロ（または理由を添えた例外のみ）へ収束させる

## 安全の約束

- 承認していない置換は1バイトも書き込まない
- 実行時に外部サービスへ通信しない
- 秘密ファイル（.env・鍵・認証情報）を走査対象にしない
- 判断に迷う語は黙って処理せず、すみやかに利用者へ確認する

## Commands

```text
term-drift
term-drift --claude | --codex | --gemini
term-drift init [dir]
term-drift scan [dir]
term-drift ledger [dir]
term-drift apply <dictionary.json> [dir]
term-drift recheck <dictionary.json> [dir]
term-drift rules [dir]
```

引数なしと3つのagentオプションは、現在のディレクトリへのproject-local installです。その他のサブコマンドはskillが使う決定的な実行基盤で、開発・デバッグ・別の統合から直接利用できます。

`apply` は承認済みの項目だけを、git追跡済みで未ステージ変更のないUTF-8文書へ適用します。Markdownのコード例・インラインコード・リンク先・例外指定のコメントは書き換えません。適用できなかった対象や再検査の残存がある場合は終了コード3を返します。

辞書の最小形式:

```json
{
  "replacements": [
    { "from": "結線", "to": "つなぎ込み", "approved": true }
  ]
}
```

## Documentation

- [理論的背景](docs/theory.md)（[English](docs/theory_en.md)）— なぜ台帳・多層検出・1語ずつの承認・決定的適用が必要なのか
- [検出 rules](rules/detect.md) — 多層検出・3分類・除外条件
- [一巡の進め方](rules/workflow.md) — 走査から再検査までの手順

## Status

walking skeleton 完了。安全境界と検出精度を継続して改善中。

実在2リポジトリを使った有界検証では、検出対象として到達可能だった24件中17件（約71%）が一致しました。完全な自動分類器ではなく、人が確認する候補を作るための検査手順です。

## License

MIT
