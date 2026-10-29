# 単一UIDのOTPログイン

開発サーバーにはローカル試用向け固定キー認証を追加した。`.env.development.local` の `LOCAL_AUTH_ENABLED=true` と `LOCAL_AUTH_KEY` を使い、`NODE_ENV=development`、ループバックのHost、Vercel環境変数なしの条件がすべて成立したときだけ提供する。接続先の有効管理者が1名の場合にそのユーザーとして試用し、OTP登録・DBセッション・認証監査レコードは変更しない。固定キーはサーバー側で照合し、別のランダムCookieとプロセス内セッションを使用する。8時間・ログアウト・サーバー再起動で失効する。本番・プレビューの認証方式は以下のOTPのまま。

2026-10-23検証：仮認証テスト5件・既存OTPテスト8件・型チェック・lint・Webpackビルドに成功。隔離DBのブラウザー検証で、固定キーの誤入力／ログイン、元の画面への遷移、模擬送信、ログアウト、認証テーブルの更新0件を確認。通常の本番用ビルドでも従来の認証セッションで一斉メールの操作を確認した。

ログイン画面では1Passwordの6桁OTPのみを入力する。ID・パスワードは求めない。これはOTP単独認証であり、多要素認証ではない。`OTP_USER_ID` に指定した既存CRM利用者の権限・操作履歴を引き継ぐ。利用者を増やす場合は方式を再検討する。

RFC 6238 / SHA-1 / 6桁 / 30秒 / 前後1ステップ。1Password APIは不要。プレビューで登録済みのキーは再登録せずそのまま利用する。公開画面にはQR・秘密鍵の登録・再表示機能を置かず、未設定時もパスワード認証に戻さない。

## 環境設定と初期登録

`MFA_ENCRYPTION_KEY` は32バイトの暗号学的乱数をbase64化した値。既存値を上書きしない。local / preview / productionは別の暗号鍵と環境別の暗号化レコードを使う。`OTP_USER_ID` は利用する既存管理者のUUID。両方ともサーバー側だけに設定する。

プレビューURLが変わってもOTPの再登録は不要。TOTPの検証対象は登録済み秘密鍵と時刻であり、URLではない。専用プレビューDBへ移す際は、既存previewのUID・暗号化登録（version、confirmed_at、last_used_stepを含む）を保持し、Vercelに保存済みのpreview暗号鍵を継承する。暗号鍵がsensitiveで再取得できない場合も新しいOTPを発行し直さない。production用の暗号化レコードをpreviewへ直接流用すると、環境を含む追加認証データが一致しない。

2026-09-30: RAW Previewは専用DBに既存preview登録を引き継いだ。Vercelの既存preview認証変数は特定ブランチ限定から全previewへ適用範囲を変更し、秘密値は保持した。DB接続変数はproductionとpreviewで分離し、productionの値を保持した。デプロイごとに認証変数を上書きしない。以前作成した「RAW Preview 20260930」の新規OTPは利用しない。

`scripts/auth/check-preview-otp.ts` は運用者向けのPreviewビルド検査。専用DBホストと暗号化登録の期待ハッシュを渡し、既存UID・登録・Vercel内の暗号鍵の整合を秘密値の出力なしで検証する。任意のHTTP検査モードは指定した当プロジェクトのプレビューで通常のOTPログインを実行し、RAW画面/APIとCookie保護を確認後、自身の検証セッションだけを失効させる。公開の診断APIは設けない。

初めて設定する環境、または本人確認後の復旧に限り、対象環境のDB・暗号鍵・UIDを安全な運用端末の環境変数へ設定し、`node --conditions=react-server --import tsx scripts/auth/setup-otp.ts <環境>` を実行する。既存登録は上書きしない。生成された `.local-test/otp-enrollment-<環境>.html` をローカルで開き、1Passwordの「ワンタイムパスワード」に登録。ログイン確認後にこの初期登録ファイルを削除する。Git・Web公開フォルダに保存しない。

1Passwordでの登録手順: https://support.1password.com/one-time-passwords/

## 保護と復旧

OTP秘密鍵はAES-256-GCMで暗号化し、環境とUIDを追加認証データとして結び付ける。使用済みの時間ステップはDBの原子的更新で再利用を拒否。IPとUIDごとに5分10回のDB共有制限。設定・DBの障害時はログイン不可。セッションは固定8時間・HttpOnly・Secure・SameSite=Strictで、指定UID以外のセッションや旧パスワード単独セッションは使えない。

紛失時は本人確認した管理者が `pnpm exec tsx scripts/auth/reset-mfa.ts <環境> <ログインID>` で対象を確認し、`--apply` を付けてリセット。既存セッションが失効し監査記録が残る。その後、上記のオフライン初期登録を行う。公開画面から本人確認を省略して再登録する経路は提供しない。

本番切替と本番用鍵の設定は別途承認後。請求メールの送信可否は認証とは独立した環境設定で管理する。
