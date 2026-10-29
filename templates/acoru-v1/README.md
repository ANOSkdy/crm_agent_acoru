# Acoru帳票テンプレート v1.0.0

請求書と見積書を共通の原本から生成する、Acoru合同会社の標準帳票パッケージです。PDFは完成見本、`src` と `assets` が再生成用の原本です。

## 保管するもの

- `src/pdf.ts`：配置・描画を管理する共通レンダラー
- `src/template.ts`：バージョン、色、入力形式、帳票種別
- `src/domain.ts`：明細・金額計算などの共通処理
- `assets/brand`：ロゴ画像
- `assets/fonts`：日本語フォントとOFLライセンス
- `DESIGN.md`：承認された表示項目とレイアウト仕様
- `examples`：架空顧客によるJSON入力例と完成見本PDF
- `package.json` / `package-lock.json`：実行環境の固定
- `MANIFEST.json`：全ファイルのSHA-256と元のGitコミット

環境変数、APIキー、CRM顧客一覧、送付先リストは含めません。見本JSONの請求元情報・振込先は保管先のアクセス権を適切に設定してください。

## CRMから使う

「請求管理 → 請求書・見積書テンプレート」で帳票種別を選び、CRM顧客から宛名・明細を仮入力できます。入力後にPDFを作成してダウンロードします。この作成画面はPDF出力専用で、入力内容をDB保存せず、メール送信・請求履歴登録も行いません。既存の月次請求は同じ原本を使用します。

## このパッケージ単体で再生成する

Node.js 22以上を用意し、解凍先フォルダを作業ディレクトリにします。

```powershell
npm ci
npm run render -- examples/invoice.json output/invoice.pdf
npm run render -- examples/quotation.json output/quotation.pdf
```

見本JSONをコピーして宛名・件名・明細・日付を編集してください。`sample: true` は「仮作成・内容確認用」を表示します。完成版を出力する際は内容を確認して `false` にします。見積条件は契約条件そのものなので、見本の内容をそのまま流用せず案件に合わせて変更してください。

日付は `YYYY-MM-DD`。数量と単価は整数、金額は円。税率10%、税額は小計から切り捨てで計算します。請求書は `dueDate`、見積書は `validUntil`・`delivery`・`conditions` を使います。請求元の `registration` は互換性のため入力形式に含まれますがPDFには表示しません。

## 原本の更新

運用中の原本はCRMリポジトリの `lib/billing/pdf.ts`、`lib/billing/template.ts`、`assets` です。このパッケージはv1.0.0時点の保存版として保持し、改修版は別バージョンで書き出します。保存版を直接改変した場合は元の `MANIFEST.json` と一致しなくなります。

CRM側の再出力コマンド：`pnpm exec tsx scripts/billing/export-template.mts`。必要に応じて `--issuer <請求元JSON>` を指定します。公開Gitへの反映と本番デプロイは現在の承認範囲に従ってください。

バックアップはこのフォルダ全体とZIPを組織管理の保管先に複製してください。現時点でクラウドへの追加アップロードは行っていません。
