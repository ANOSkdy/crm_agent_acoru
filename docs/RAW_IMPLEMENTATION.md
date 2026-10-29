> 2026-10-29: AIアシスタント・活動履歴・ファイル管理・レポートは廃止しました。この文書のアシスタント連携は旧仕様です。現行の構成と移行は [課題管理](ISSUE_MANAGEMENT.md) を参照してください。

# RAW業務データ基盤 v2.0 実装結果

2026-09-30。指定仕様に沿ってPhase 1〜6を実装。既存Next.js / Neon SQL / Zod / DeepSeekを利用。新しい依存関係は追加していない。

## Phase別の変更

| Phase | 内容 |
| --- | --- |
| 1 | CSV認証、顧客/連絡先/ファイル/グリッド更新の権限・関連先検証、作成者/監査記録、活動種別の共有 |
| 2 | 本文貼り付け、MD/TXTアップロード、原本固定版、SHA-256重複排除、版一覧・本文表示、20件ページング |
| 3 | 版付き実行・分割処理、出典付き候補、曖昧な関連先の手動解決、編集/承認/却下/適用、競合・再解析・監査 |
| 4 | 指定フォルダ同期CLI、dry-run、安定UUID、移動/再送/削除時の保全、専用hash保存トークン |
| 5 | 明記された実績時間の正規化、レビュー/工数適用、出典一意FK、日/顧客/案件/未配賦集計 |
| 6 | 工数を既存AI検索・集計へ接続、削除済み親の除外とJST統一、運用/境界/制限を文書化 |

## データモデルとmigration

007〜011を追加。文書/固定版、抽出実行/部分/候補、同期認証、工数の各テーブルを追加。原本本文の更新/削除禁止、文書+hashの一意性、候補の安定キー/適用一意性、工数の出典一意FKを実装。

旧migrationファイルは不変。既存agent_change_requestsにはRAW候補FKを追加し、会話runかRAW候補の一方を必須にした。activity/task/decisionは既存apply関数を利用。案件なし工数のみ同じRAW適用関数の専用分岐で保存する。

運用手順・制限は[RAW_DATA.md](RAW_DATA.md)を参照。007〜011を適用後、必要なRAW_*_ENABLEDをtrueにする。全て既定false。

## 検証結果

| 実行したcommand/check | 結果 |
| --- | --- |
| pnpm typecheck | PASS |
| pnpm lint | PASS、警告なし |
| pnpm test:agent | PASS、7件 |
| pnpm test:billing | PASS、20件 |
| pnpm test:auth | PASS、8件 |
| pnpm test:crm-security | PASS、2件 |
| pnpm test:raw | PASS、21件 |
| pnpm build | PASS、ダミーDATABASE_URLを指定 |
| pnpm test:raw:browser | PASS、最終ビルドを隔離DB・AIモックで実ブラウザー操作 |
| pnpm raw:sync --root C:\dev\crm_agent\.local-test\raw-sync-smoke --dry-run | PASS、sample.mdだけを列挙、隠しファイル除外、state作成なし |
| git diff --check | PASS |
| 作業開始時SHA-256との比較 | 本件と無関係な既存変更21ファイルを保持 |

Nodeの子プロセスがサンドボックス内でEPERMとなったチェックは、同じ隔離データ条件で再実行して成功。ブラウザー検証では起動パス、Neon HTTPテスト変換、アプリの同一オリジン判定の問題を修正して再実行した。未成功のチェックを成功として扱っていない。

58件の自動テストに加えて、ブラウザーで認証→原本保存→AI許可→activity/task/decision/work_log抽出→個別承認/適用→再解析の重複防止→出典→90分集計を確認。アップロード再送/追記版、モバイルでのナビゲーション折りたたみも確認。console/page errorなし。DBとAIは隔離環境/モックであり、実DeepSeek品質・実Neon接続は未検証。

## 受入要件への対応

- T01〜03: crm-security.test.ts。未認証の直接Action呼び出し、CSV、所属・権限違反。
- T04〜07: raw-storage.test.ts。原文保持/同一hash/版追加/文字コード・バイナリ。
- T08〜15: raw-extraction.test.ts。AI失敗、引用偽造、曖昧関連先、重複/並列適用、版変更/追記/手動編集/競合。
- T16: schemaとprovider toolの制限、引用検証、実ブラウザーの候補経路。実モデルが常に正しいという保証ではない。
- T17〜20: raw-sync.test.ts。応答喪失後の再送、未変更、移動、削除後のサーバー保持。
- T21〜22: raw-worklog.test.ts。1.5h/1時間30分/30m、予定からの推測拒否、引用から予定語だけを落とす出力も拒否。
- T23: raw-http.test.ts / raw-sync.test.ts / browser。例外内容の秘匿、state/token分離、サーバーログに原文/セッションを出さない。
- T24: 既存agent/billing/authテスト。
- 長文・複数案件: 全範囲の分割、部分失敗再試行、12候補/2案件を各1操作提案へ分離するテスト。
- 集計: raw-analytics.test.ts / raw-worklog.test.ts。取消・削除済み親除外、日/会社/案件/未配賦、JST。
- 輸送上限: 最大20ファイルを本文を欠落させず2 MiB単位に分割するテスト。

## 制限・未実行事項

初回実装時は本番DBへの書き込み・本番migration・本番デプロイを行っていない。その後、独立したプレビューDBの作成・migration・合成データ検証を経て、2026-09-30のユーザー承認に基づく本番反映を下記に記録した。commit/push/merge/PR作成、設定済みDBへ触れる旧test:agent:dbと旧fixture/browserスクリプトは実行していない。

外部AI契約/保持条件、実業務データに対する抽出精度、実Postgresの複数接続負荷は別途確認。実モデルとの互換性・合成データの抽出・Vercelでの実行は下記追加検証で確認。UIを閉じた後の抽出は手動再開。意味的同一性が不確かな候補は人の判断を要する。初期版はcreateだけで、AIによる既存事実の自動更新/削除はしない。工数から利益・LTVを推測する処理は追加していない。

## Vercelプレビュー追加作業（2026-09-30）

- プレビュー（UI統一・既存OTP対応）: https://crm-agent-acoru-8pcaxi5lb-acrou-pro.vercel.app
- Vercel project: `crm-agent-acoru`、target: **preview**。既存のDeployment Protectionを維持。
- 既存の共有preview DBはproductionと同じ接続先だったため使用しない。既存Neon連携から無料プランの専用DB `crm-raw-preview-20260930` を新設し、`RAWPREVIEW_` 変数をpreviewだけに追加した。
- 新DBに000〜011を既存runnerで適用。再実行は全12件がchecksum一致・適用済みスキップ。
- 顧客・案件・業務ログは合成データ。既存業務データをコピーしていない。
- OTPは従来の1Password項目をそのまま使う。既存previewのUID・暗号化登録・version・確認日時を専用DBへ引き継ぎ、Vercelの既存sensitive認証値を継承した。認証変数の適用範囲を全previewへ変更し、値は保持。本番の認証情報は不変。当初作成した別OTPは利用停止し、専用の再登録は不要になった。ローカルQRは利用停止の案内へ置換済み。
- 実モデル一覧ではローカル設定の `deepseek-v4-flash` がなかったため、プレビューには利用可能な `deepseek-flash` を指定。実APIで4種の抽出・スキーマ検証・承認・反映を確認した。
- 4つのRAWフラグを有効化。請求の実送信フラグはfalse、Resend/cron secretは空値。プレビューの本番送信条件は成立しない。
- DB接続設定はproductionとpreviewで分離した。productionの値は保持し、previewには専用DBを設定。認証はVercelに保存済みの値を継承し、deploymentで上書きしない。AI/機能フラグ/送信無効化はdeploymentへの明示設定を継続。ローカル再実行用 `.local-test/raw-preview-ops.mjs`（非公開・非追跡）は新規OTP生成を廃止し、専用DBのruntime/build設定と認証事前検査を行う。単独の `vercel deploy` ではAI/RAWフラグまで同じ設定を再現しない。

### 既存OTPへの復旧確認

認証処理本体は変更せず、登録・環境設定の不一致を修正した。`scripts/auth/check-preview-otp.ts` をVercel Previewビルド内で実行し、専用DB、既存UID・暗号化登録の一致、既存暗号鍵での復号を検証。認証修正版 `crm-agent-acoru-7hl6g9x57-acrou-pro.vercel.app` への実HTTP検証で未認証時のログイン誘導、既存OTPによる303、Secure/HttpOnly/SameSite=Strict Cookie、RAW画面とAPIの200を確認し、検証セッションのみ失効させた。秘密鍵はVercel外へ取り出していない。`pnpm run typecheck`、`pnpm run lint`、`pnpm run test:auth`（8件）、Vercel buildはPASS。本番DBは認証登録の読み取りのみで、業務データ・認証情報の更新や本番デプロイは行っていない。

### 追加確認

最終プレビューでもOTPログイン、複数行本文欄、既存候補、90分集計、出典リンク、モバイルナビゲーションとページの横はみ出しがないことを確認。同期CLIの実検証は同一サーバーコードの `crm-agent-acoru-4i5reaori-acrou-pro.vercel.app` で実施。同期CLIはdry-run（state作成なし）→新規送信→変更なし→追記版の順で実行し、実Neonの2版保存・AI許可falseを確認。検証用同期トークンは全て失効させ、以後401になることを確認した。両ブラウザー検証はpage error・RAW API失敗なし。デプロイの478パスを検査し、環境ファイル、OTP登録ファイル、`.local-test`、同期stateの混入なし。検証記録・画像は `.local-test/raw-preview-browser/` に非公開で保存。

保護されたプレビューに対する同期検証では、localhostだけで待ち受ける一時中継を使い、Vercel短期OIDCを添付した。中継は検証後に終了。CLI自体はアプリの同期トークンだけを送るため、Vercelの追加保護を通す運用経路は別途必要（UIのアップロードはそのまま利用可能）。検証のためにDeployment Protectionを無効化していない。

実Neon・実DeepSeekで、未認証拒否、OTPログイン、原文の完全保存、AI許可の強制、activity/task/decision/work_logの抽出、個別承認/適用、同一候補の再適用、再解析時の自動重複作成防止、90分集計、出典への往復、MD再送/追記版を確認。実AI検証URLは初回プレビュー `crm-agent-acoru-om4b1yuwe-acrou-pro.vercel.app`。最終版とのサーバーコード差分はなく、最終版では本文欄を既存 `.textarea` スタイルに修正し、モバイルのファイル選択欄に幅制約を追加した。

デプロイ対象からローカル同期stateと、除外済みtestsをimportするブラウザー検証スクリプトも除外した。今回の追加コード差分は `.vercelignore` と `components/raw/RawInbox.tsx` のみ。作業開始時のhashと比較し、本件と無関係な既存変更26ファイルが不変であることも確認。ローカル `pnpm typecheck` / `pnpm lint` を再実行してPASS。Vercel側でもNext.js buildが成功。

ブラウザーの初回操作はhydration前の入力で待機失敗したため、初期RAW一覧APIの完了を待つ検証へ修正して成功した。agent-browserのEdge起動がこのWindows環境で失敗したため、既存のPlaywright/Edgeで検証した。アプリの認証バイパスは追加していない。Vercelアクセスは公式CLIの短期OIDCを利用し、トークンは表示・保存していない。

## 既存画面とのUI統一（2026-09-30）

実績工数・業務ログ受信箱の表示を、既存レポート／活動履歴と同じ `Card` / `CardHeader` / `CardBody`、フォーム・ボタンの共通クラス、状態表示の `Badge` に合わせた。共通部品本体や既存画面のスタイルは変更していない。

- 実績工数: 集計期間、サマリー4枚、日別・顧客別・案件別、明細をカードに整理。表の見出し背景・セル余白・数値右寄せ・行区切りを統一。明細内のみ横スクロールし、空データ／不正な期間も同じカードで案内する。期間変更時も顧客・案件の絞り込みを保持する。
- 受信箱: 入力・保存原本・版の履歴を共通カードへ統一。選択行、状態バッジ、保存通知、無効ボタン、ファイル選択を整理。抽出候補の本文・理由は複数行textareaに修正し、フォーム間隔・2列配置・モバイル折り返しを揃えた。同期設定と既存画面内の出典表示にも共通カードを使用する。
- 変更対象: `app/(crm)/work-logs/page.tsx`、`components/raw/{RawInbox,ExtractionPanel,SyncCredentials,SourceLinks}.tsx`、`scripts/raw/verify-browser.mts`。認証・DBスキーマ・AI抽出／承認ロジックは不変。
- 検証: `pnpm run typecheck`、`pnpm run lint`、`pnpm run build`、`pnpm run test:raw:browser` に成功。ブラウザー検証は隔離PGlite・AIモックで、保存→抽出→承認／反映→再解析→出典→90分集計、期間指定／条件保持／空データ／不正期間、アップロード再送・版追加、同期履歴、390px画面の横はみ出しを確認。Next.jsの読み上げ領域とテストのalert指定が重複したため、main内に限定して再実行し成功した。
- スクリーンショット: `.local-test/raw-browser/` の `work-logs-desktop.png`、`work-logs-mobile.png`、`inbox-empty-desktop.png`、`review-desktop.png`、`mobile.png`、`sync-mobile.png`。`reports-reference.png` と共通カードの外観を比較した。これらは合成データのみで、Git・デプロイ対象外。

## 今回追加・変更したファイル

### アシスタント統合（2026-09-30、UI統一後の追加依頼）

独立した「業務ログ受信箱」「実績工数」の画面とCRMメニューを廃止し、既存AIアシスタントの拡張へ変更した。上記の独立画面の記述・プレビューURLは統合前の検証履歴。

- チャット入力から業務メモ保存・MD/TXT添付。保存原文とAI許可を維持し、「資料・原本」で版・抽出・レビュー・再解析・同期を扱う。
- アシスタントに本人の原本一覧・許可済み固定版の読取ツールを追加。原本についての相談から実際に本文を参照する。未許可・他人の原本は拒否。読取済み実行では通常提案を作らず、出典付き候補の承認・反映へ誘導する。
- 「工数分析」と同じSQL集計を会話から利用。原本・集計の出典リンク、期間リセット、相談への復帰で会話URLを保持する。
- 旧 `/raw` と `/work-logs` はパラメーター付き転送だけを残し、保存済みの出典を維持。原本・工数・会話・APIを削除せず、追加migrationもない。
- ブラウザー検証で判明した、Next.jsの再構築URLと実際のHostの違いによるアシスタントAPIの403を修正。実HostとOriginを比較し、cross-site・Origin欠落・偽装forwarded hostを拒否する回帰テストを追加。
- 検証: `pnpm run typecheck`、`pnpm run lint`、`pnpm run build`、`pnpm run test:agent`（7件）、`pnpm run test:crm-security`（2件）、`pnpm run test:raw`（24件）、`pnpm run test:raw:browser`、`git diff --check` は成功。ブラウザーは隔離PGlite・AIモックで、会話保存／再読込、原本相談、4種の候補反映、再解析の重複防止、工数相談、出典往復、添付の原文完全保持、旧URL転送、390px表示を確認。コンソールエラーなし。
- 画像: `.local-test/raw-browser/assistant-welcome.png`、`assistant-analysis.png`、`assistant-chat-mobile.png`、`work-logs-desktop.png`、`mobile.png`。合成データのみ、公開対象外。
- 作業開始時のSHA-256と照合し、OTP／セッションの認証実装、請求関連、既存migrationの対象28ファイルが不変であることを確認。
- 統合版のPreview更新は当初、環境情報の再送に対する自動承認レビューで停止した。DB・OTPは保存済み設定を継承する方式に変更し、その後ユーザーがPreviewと本番へのデプロイを明示承認。以下のリリースを実施した。

統合の主な変更箇所:

- `app/(ai)/assistant/[[...thread]]/page.tsx`
- `app/assistant.css`
- `components/assistant/{AssistantWorkspace,AssistantAnswer,AssistantMaterialsPanel,WorkAnalysis}.tsx`
- `lib/assistant/{materials,navigation,runtime}.ts`
- `components/layout/AppNavigation.tsx`
- `app/(crm)/{raw,work-logs}/page.tsx`
- `components/raw/{ExtractionPanel,SourceLinks}.tsx`
- `lib/db/queries/crm-search.ts`
- `lib/agent/http.ts`
- `scripts/auth/check-preview-otp.ts`
- `scripts/raw/verify-browser.mts`
- `tests/{raw-assistant,raw-http}.test.ts`
- `docs/{RAW_DATA,WORKSPACE_AI,RAW_IMPLEMENTATION}.md`

### RAW基盤の初回追加・変更一覧

以下は作業開始時点との差分。既存の請求機能等の未コミット変更は含めない。

- `.env.example`
- `.gitignore`
- `README.md`
- `app/(crm)/activities/[activityId]/edit/page.tsx`
- `app/(crm)/activities/page.tsx`
- `app/(crm)/companies/[companyId]/page.tsx`
- `app/(crm)/deals/[dealId]/page.tsx`
- `app/(crm)/raw/page.tsx`
- `app/(crm)/tasks/[taskId]/edit/page.tsx`
- `app/(crm)/work-logs/page.tsx`
- `app/api/export/companies/route.ts`
- `app/api/export/deals/route.ts`
- `app/api/raw/credentials/route.ts`
- `app/api/raw/documents/[documentId]/route.ts`
- `app/api/raw/documents/route.ts`
- `app/api/raw/extractions/[runId]/route.ts`
- `app/api/raw/extractions/route.ts`
- `app/api/raw/items/[itemId]/route.ts`
- `app/api/raw/revisions/[revisionId]/route.ts`
- `app/api/raw/sync/route.ts`
- `app/api/raw/targets/route.ts`
- `app/api/raw/work-logs/route.ts`
- `components/agent/ChangeProposalCard.tsx`
- `components/agent/ProposalActions.tsx`
- `components/assistant/DealProgressCard.tsx`
- `components/layout/AppNavigation.tsx`
- `components/raw/ExtractionPanel.tsx`
- `components/assistant/AssistantMaterialsPanel.tsx`（旧 `components/raw/RawInbox.tsx` を移動）
- `components/raw/SourceLinks.tsx`
- `components/raw/SyncCredentials.tsx`
- `components/raw/labels.ts`
- `components/raw/request.ts`
- `docs/RAW_DATA.md`
- `docs/RAW_IMPLEMENTATION.md`
- `docs/WORKSPACE_AI.md`
- `lib/actions/activities.ts`
- `lib/actions/companies.ts`
- `lib/actions/contacts.ts`
- `lib/actions/deals.ts`
- `lib/actions/files.ts`
- `lib/actions/grid-updates.ts`
- `lib/actions/tasks.ts`
- `lib/agent/schema.ts`
- `lib/assistant/runtime.ts`
- `lib/assistant/schema.ts`
- `lib/auth/crm-permissions.ts`
- `lib/auth/crm-policy.ts`
- `lib/db/queries/activities.ts`
- `lib/db/queries/companies.ts`
- `lib/db/queries/contacts.ts`
- `lib/db/queries/crm-search.ts`
- `lib/db/queries/dashboard.ts`
- `lib/db/queries/deals.ts`
- `lib/db/queries/files.ts`
- `lib/db/queries/reports.ts`
- `lib/db/queries/tasks.ts`
- `lib/raw/batch.ts`
- `lib/raw/constants.ts`
- `lib/raw/credentials.ts`
- `lib/raw/domain.ts`
- `lib/raw/duration.ts`
- `lib/raw/extraction-domain.ts`
- `lib/raw/extraction.ts`
- `lib/raw/http.ts`
- `lib/raw/local-sync.ts`
- `lib/raw/provider.ts`
- `lib/raw/repository.ts`
- `lib/raw/server.ts`
- `lib/raw/work-report.ts`
- `lib/utils/date.ts`
- `lib/validation/activity-types.ts`
- `lib/validation/activity.ts`
- `package.json`
- `scripts/db/migrations/007_raw_documents.sql`
- `scripts/db/migrations/008_raw_extraction.sql`
- `scripts/db/migrations/009_raw_sync.sql`
- `scripts/db/migrations/010_work_logs.sql`
- `scripts/db/migrations/011_business_analytics.sql`
- `scripts/raw/sync.ts`
- `scripts/raw/verify-browser.mts`
- `tests/crm-security.test.ts`
- `tests/helpers/database.ts`
- `tests/helpers/empty.mjs`
- `tests/helpers/raw-browser-runtime.mjs`
- `tests/helpers/server-only.mjs`
- `tests/raw-analytics.test.ts`
- `tests/raw-extraction.test.ts`
- `tests/raw-http.test.ts`
- `tests/raw-storage.test.ts`
- `tests/raw-sync.test.ts`
- `tests/raw-worklog.test.ts`

## 統合版のPreview・本番リリース（2026-09-30）

ユーザーの「previewと本番にデプロイしていいよ」に基づいて実施。両環境ともREADY。

| 環境 | URL | Deployment |
| --- | --- | --- |
| Preview | https://crm-agent-acoru-1qipjln3d-acrou-pro.vercel.app/assistant | dpl_ABiekJR3QcTdfwU6XoPpJbZHzEqc |
| Production | https://crm-agent-acoru.vercel.app/assistant | dpl_55BQZX2twFMwSdXWQuynkst9Vopk |

本番の固定デプロイURLは `https://crm-agent-acoru-45a55b1yr-acrou-pro.vercel.app`。本番設定で `--prod --skip-domain` を使って作成し、事前検証・画面検証後にpromoteした。専用DBを使うPreviewそのものを本番へ昇格していない。アプリ本体は検証済みの作業ツリーを使用し、Git commit/pushは行っていない。

### DB・設定の保全

- 本番000〜006の適用checksumを照合し、未適用の007〜011だけを既存migration runnerで適用。旧migrationの書換え、既存業務行の削除／上書きは行わない。既存15テーブルの件数・内容ハッシュを適用前後と画面確認後で比較し、不変を確認した。
- 変更前の既存関数・ビュー定義、移行履歴、保全ハッシュ、旧本番デプロイを `.local-test/raw-production-*` に保存。旧本番は `dpl_48gPDgy4wdDZPeMmv5JWuDNJMdFk`（`crm-agent-acoru-17l25jc72-acrou-pro.vercel.app`）。通常の切り戻しでは旧コードを戻し、追加テーブルをDROPしない。
- 本番DB・OTP・DeepSeek APIキー・請求設定はVercelの保存済み設定を継承。Previewには既存DeepSeek APIキーを設定し、DB・OTPは保存済みPreview設定を継承。鍵・OTPの再発行なし。
- 本番の既存モデル名が実APIの利用可能一覧に存在せず、最初のビルドを事前検証で停止した。秘密情報を出さない段階名診断で原因を確定し、Previewで実動確認済みの `deepseek-flash` を本番にも指定して成功。失敗版は本番URLへ公開していない。
- 4つのRAWフラグtrueと `DEEPSEEK_MODEL=deepseek-flash` をProduction設定へ保存。これ以外の環境設定の値・適用範囲が不変であることも確認。Previewの請求送信停止設定は本番へ持ち込まない。

### 検証結果と範囲

- `pnpm run typecheck` / `pnpm run lint`、Vercel Preview build、本番build成功。本番に `scripts/raw/check-release.ts` を追加し、DBの識別、全migrationのchecksum、集計ビュー、既存OTP登録と復号、RAWフラグ、AI接続とモデル存在を公開前に検証した。検証は読取のみで、秘密値・業務本文をログに出さない。
- 本番反映前に `pnpm run test:billing`（20件）と `pnpm run test:auth`（8件）を再実行し成功。前段の統合テスト33件・隔離ブラウザー検証も成功済み。
- Preview: 実DeepSeekがAI許可済みの合成原本を `read_business_material` で読み、17分という記述を根拠付きで回答したことをDBの実行状態・tool traceでも確認。候補のCRM反映は行わない。原本・工数・既存レポート／請求画面、旧URL転送、モバイル表示に成功。
- 本番: 既存認証登録に紐付く15分限定の検証セッションを使い、アシスタント／原本／工数・ダッシュボード・レポート・請求画面を読み取り確認。業務レコード作成、AIへの業務本文送信、メール送信は行わない。確認後は検証セッションだけを失効。今回のブラウザー検証ではOTPコード入力を再実行しておらず、鍵・登録の一致と復号はVercel build内で検証した。
- 切替前の本番URLではPreview用OIDCが403となったため、公式 `vercel curl` の認証と文書化されたブラウザーテストCookieを使用して成功。Cookieはメモリ内のみで扱い、アクセス保護は無効にしていない。
- 正式本番URLで `/login` 200、未認証 `/assistant` 307、未認証RAW API 401を確認。2026-09-30 17:34 JST時点で、新Preview・新本番の直近15分のruntime errorと5xxは双方0件。常時監視を追加したという意味ではない。
- リリース検証記録は `.local-test/raw-release-final-report.json`、ブラウザー記録は `.local-test/raw-release-browser-{preview,production}/`。環境ファイル、認証情報、`.local-test`、docs、testsはデプロイ対象外。
