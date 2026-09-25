# 請求管理の移行と検証

既存CRMの `/billing` に管理者向け請求管理を追加。既存ログインとPostgreSQL接続を利用し、請求専用の `billing` スキーマに保存する。

## 現在の送信制限

- `BILLING_LIVE_SEND_ENABLED` は未設定または `false`。外部メールAPIを呼び出さない。
- `BILLING_ALLOW_REAL_RECIPIENTS` は未設定または `false`。登録可能なのは `@example.invalid` のみ。
- 移行ツールは実メールアドレスを出力せず、取り込み時にもダミー限定を再検証する。
- 本番送信の設定は管理画面から変更できない。ユーザーの明示承認後にのみ環境変数と実送付先を設定する。
- 検証ボタンはPDFと送付内容をDBに保存し、外部へ送らない。顧客・請求データとPDFの閲覧・変更はCRMの有効な管理者のみ。

## 初期設定

1. 対象：`acrou-pro/crm-agent-acoru`。既存DBのバックアップ／分岐先を確認し、環境変数を設定する。
2. `pnpm db:migrate` で `004_billing.sql` を適用。既存CRMのテーブルは変更しない。
3. 請求元情報（name, registration, address, tel, bank, from）を `.local-test/issuer.json` に設定。原本・宛先・振込情報をGitに登録しない。`python scripts/billing/extract-legacy.py <元xlsx> .local-test/billing-import.json .local-test/issuer.json`
4. `pnpm exec tsx scripts/billing/import.ts .local-test/billing-import.json` で件数とダミー宛先を確認。
5. 同じコマンドに `--apply` を付けて取り込み。既存の顧客・請求IDは更新せずスキップする。
6. Vercelに十分な長さのランダムな `CRON_SECRET` を設定。値をログに出さない。
7. 毎時UTC 0分に呼び出し、アプリ内で日本時間の条件を判定する。既定は25日9時作成、翌月1日9時送信。障害時は以後の毎時実行で未処理のみ追いつく。過去の未対応を一括送信しない。
8. 初期移行は自動処理ON、外部送信OFF。Vercel Cronはproductionのみ動作する。

## 検証

- `pnpm exec tsx --test tests/billing.test.ts` は独立したPGliteで検証し、本番DB・外部メールには接続しない。
- `pnpm typecheck`、`pnpm lint`、`pnpm build`。
- 検証はダミー宛先で作成、編集、PDF、検証記録、重複作成・重複実行、非管理者拒否を確認する。
- 元xlsx/docxをWebのpublicディレクトリやデプロイ対象に含めない。

## 本番移行はユーザー承認後

1. Resendで `acoru.jp` を認証し `support@acoru.jp` から送信できるAPIキーを設定。
2. 旧GASの月次作成・送信トリガーを停止。二重稼働しない。
3. 承認後に `BILLING_ALLOW_REAL_RECIPIENTS=true` とし、管理画面で実宛先を登録。既存請求は宛先を固定保存しているため、顧客更新だけでは既存請求の宛先は変わらない。未送信の請求書も個別に正しい宛先へ更新する。
4. 対象月・金額・PDF・支払期日・宛先を確認。`BILLING_LIVE_SEND_ENABLED=true`、`RESEND_API_KEY` をproductionに設定して再デプロイ。
5. ダミー宛先のままの請求は本番送信を拒否する。送信済み移行記録は再送しない。

## 送信障害の扱い

送信前にPDF・宛先・本文・一意な送信IDを保存。同じ請求の本番送信レコードは永久に1件に制限。Resendの24時間の冪等期限を超えても勝手に再送しない。

通信タイムアウト／受付後のDB更新失敗／プロセス停止では「確認待ち」または「処理中」に残す。Resendダッシュボードで一意キー・宛先・日時を照合してから管理者がDBの記録を修復する。送信済みはサービス受付を表し、受信箱への到達保証ではない。自動再送・配信Webhookはこの版にはない。

## 移行上の注意

旧顧客IDと現在の会社名が不一致の履歴は、現行顧客との関連を外し、旧宛名を保持して保存する。送信済みは再送せず、未送信は保留にする。

過去のPDFはxlsxに含まれない。画面から生成する過去分PDFは現在のテンプレートからの再生成であり、旧送付原本ではない。原本のDriveアーカイブは保持する。

税率10%、円整数、数量は正整数。小計の税額は切り捨て。送信時に顧客マスタから宛先や金額を読み直さず、請求作成時のスナップショットを使用する。
