# L1-a 照合結果: rules/detect.md 全文検出の実走 vs 手動調査34件（2026-07-12）

> 派生成果物（実走の記録）。正解データは同ディレクトリの `opencode-expected.md`（18件）・`hermes-agent-expected.md`（16件）。
> 実走の形: `term-drift scan` の収集結果（opencode: 文書786・コミット200・秘密除外13 / hermes-agent: 文書1029・コミット200・秘密除外25）を素材に、rules/detect.md を正本として読む検出エージェント9本（正解リスト非開示・台帳なし縮退・読み手=初見の開発者）が独立に検出。
> 検査範囲（有界・宣言）: 両リポの p1（計画文書/specs）・p2（ルート文書）・コミット200件は全量。hermes の p3 は `website/docs/user-guide/features/`（43ファイル）のみ。opencode の p3/p4（747ファイル・大半が生成された多言語複製）と hermes の残り p3/p4（skills/messaging 等 977ファイル）は今回対象外。

## 総括

| | opencode (18) | hermes-agent (16) | 計 (34) |
|---|---|---|---|
| 検出一致 | 12 | 5 | **17** |
| 見落とし（到達可能・判定不一致含む） | 3 | 4 | **7** |
| 構造的対象外（素材不達 or 識別子除外の設計どおり） | 3 | 7 | **10** |

- rules の検出が対象とする範囲（34 − 対象外10 ＝ 24件）に対する一致率: **17/24（約71%）**。
- 正解リスト外の新規検出: opencode 約25語・hermes 約26語（過検出候補。手動調査は網羅ではないため、真の過検出かは人の合否判定に委ねる）。
- 免除マーカー: 両リポとも 有効0・無効0（`ascii-guard-ignore` を term-drift マーカーと誤認しなかったことを確認）。

## opencode（18件）

| # | 語 | 結果 | 備考 |
|---|---|---|---|
| 1 | zen:（コミット接頭辞） | ✅ 一致 | 9件・要確認として検出 |
| 2 | V1-to-V2 shadow bridge | ✅ 一致 | 要確認 |
| 3 | New Data Mode | ❌ 見落とし | specs/v2/todo.md の見出しに現存。担当エージェントが素通し |
| 4 | advisory wake / prompt wakeups | ✅ 一致 | 定義がどこにも無いことまで特定 |
| 5 | tool settlement / settled | ✅ 一致 | 2系統（p2・specs）で独立検出 |
| 6 | drain（動詞転用） | ✅ 一致 | drain-chain の派生まで検出 |
| 7 | slice | ❌ 見落とし（判定不一致） | 2エージェントとも「アジャイルの vertical slice 慣用」として一般語判定。読み手相対の割れ目 |
| 8 | lowers to | ✅ 一致 | コンパイラ用語転用として検出 |
| 9 | Location（大文字） | ✅ 一致 | 全ファイル未定義まで特定 |
| 10 | Catalog（大文字） | ✅ 一致 | |
| 11 | steer（配送モード） | ✅ 一致 | CLAUDE.md の Kiro「Steering」との二重負荷まで検出（手動調査に無い知見） |
| 12 | promote/promotion | ✅ 一致 | admit/admission の対まで検出 |
| 13 | muse / meta muse | ✅ 一致 | コード由来だがコミットメッセージ経由で到達・検出（従来「構造的対象外」とした4件のうち1件が実は拾える） |
| 14 | PROMPT_BEAST / beast | ⬜ 対象外 | 走査素材（文書・コミット200）に出現ゼロ・不達 |
| 15 | revert dock | ⬜ 対象外 | コミット1件に出現するが UI コンポーネント名＝識別子除外（rules 設計どおり） |
| 16 | composer | ⬜ 対象外 | コミット3件に出現するが UI コンポーネント名＝識別子/一般語判定 |
| 17 | chore: generate（裸） | ✅ 一致 | 35件・儀式的略記として検出 |
| 18 | Hey API source compatibility | ❌ 見落とし（判定不一致） | 「実在の外部固有名詞」として除外された。手動調査の型は「実在だが無説明＝要人確認」。実在確信時に迷う語へ倒れない |

## hermes-agent（16件）

| # | 語 | 結果 | 備考 |
|---|---|---|---|
| 1 | salvage | ✅ 一致 | 3系統（コミット約27件・CONTRIBUTING・AGENTS）で独立検出。共起語 map（約31件）も新規検出 |
| 2 | footgun / windows-footguns | ⬜ 対象外 | スクリプト名＝識別子除外（rules 設計どおり）。散文中の「a latent footgun」は一般スラング判定 |
| 3 | landmines | ⬜ 対象外 | 直近コミット200件に出現せず・不達（scan の収集深度の限界） |
| 4 | sticky blocks | ⬜ 対象外 | テスト由来（走査対象外）。コミット中の sticky は一般用法判定 |
| 5 | system lobby / root lobby | ✅ 一致 | 3系統（コミット・telegram plan・cron.md）で独立検出 |
| 6 | session lane | ✅ 一致 | 定義の置き場所ズレとして検出 |
| 7 | kanban kernel | ✅ 一致 | p3 有界スライス内で検出 |
| 8 | grace call | ✅ 一致 | 要確認 |
| 9 | moa | ⬜ 対象外 | 設定キー＝識別子除外（rules 設計どおり） |
| 10 | dialectic user modeling | ❌ 見落とし | README の使用箇所に説明なし（Honcho へのリンクのみ）。担当エージェントが素通し |
| 11 | KawaiiSpinner / kawaii faces | ⬜ 対象外 | クラス名＝識別子除外（rules 設計どおり） |
| 12 | HARDLINE | ❌ 見落とし（判定不一致） | 「直後の文で意味確定」と判断され除外。手動調査の型は内輪ラベル |
| 13 | Mini Shai-Hulud worm campaign | ❌ 見落とし（判定不一致） | 「外部事件の引用」として除外。手動調査の型は「出典なし＝要人確認」 |
| 14 | ghost-duplication | ❌ 見落とし（境界例） | AGENTS.md で「rendering bugs in tmux/iTerm2」と文脈説明ありだが命名自体は未定義 |
| 15 | sleep tax | ⬜ 対象外 | コードコメント由来・不達 |
| 16 | strike-freedom-cockpit | ⬜ 対象外 | plugin ディレクトリ名＝識別子除外（rules 設計どおり） |

## 見落とし7件の型分析（rules 改善の種）

1. **実在確信による除外（3件: Hey API・Shai-Hulud・footgun 散文用法も同型）** — rules は「実在と内製の区別がつかないとき迷う語」とするが、エージェントは実在と確信すると**無説明でも**除外する。手動調査の意図は「実在でも出典・説明が無ければ要人確認」。rules の除外規定に「実在の外部固有名詞でも、初出に説明・リンクが無く読み手が確かめられない場合は要確認」の一文が必要。
2. **業界慣用への吸収（2件: slice・HARDLINE）** — 読み手相対の判定が「開発者なら通じる」側へ倒れる。既定の読み手の定義（今日参加した初見の開発者）だけでは割れる境界で、迷う語として人へ出す閾値が手動調査より高い。
3. **単純な素通し（2件: New Data Mode・dialectic user modeling）** — 到達可能・説明なしの語を担当エージェントが挙げなかった。複数エージェントの重複走査（同一素材を2視点で）か、見出し語・リンク付き専門語への明示的な注意書きで拾える型。

## 新規検出（正解リスト外・人の合否待ち）の代表例

- opencode: admit/admission（promote の対）・inbox・provider-turn allowance・leaf/leaves・lower/lowering（specs 全域）・fence/fencing・CONTEXT.md 定義語群への参照欠落（定義の置き場所ズレの面としての指摘）・effectify・裸の「chore: artifacts」「zen: new inference」
- hermes: map（動詞・AUTHOR_MAP 操作、コミット約31件）・LHF・nudge・fleet farming・gateway の二重負荷・MEDIA: タグ・SOM・CDP supervisor・anti-temptation rules・home channel・tap

手動調査が「儀式の略記」1型で拾った領域（裸 chore: generate）に対し、実走は同型を3語（generate/artifacts/new inference）拾っており、コミット系はむしろ実走が厚い。
