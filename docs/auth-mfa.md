# 単一UIDのOTPログイン

ログイン画面では1Passwordの6桁OTPのみを入力する。ID・パスワードは求めない。これはOTP単独認証であり、多要素認証ではない。`OTP_USER_ID` に指定した既存CRM利用者の権限・操作履歴を引き継ぐ。利用者を増やす場合は方式を再検討する。

RFC 6238 / SHA-1 / 6桁 / 30秒 / 前後1ステップ。1Password APIは不要。プレビューで登録済みのキーは再登録せずそのまま利用する。公開画面にはQR・秘密鍵の登録・再表示機能を置かず、未設定時もパスワード認証に戻さない。

## 環境設定と初期登録

`MFA_ENCRYPTION_KEY` は32バイトの暗号学的乱数をbase64化した値。既存値を上書きしない。local / preview / productionは別の鍵と登録情報を使う。`OTP_USER_ID` は利用する既存管理者のUUID。両方ともサーバー側だけに設定する。

初めて設定する環境、または本人確認後の復旧に限り、対象環境のDB・暗号鍵・UIDを安全な運用端末の環境変数へ設定し、`node --conditions=react-server --import tsx scripts/auth/setup-otp.ts <環境>` を実行する。既存登録は上書きしない。生成された `.local-test/otp-enrollment-<環境>.html` をローカルで開き、1Passwordの「ワンタイムパスワード」に登録。ログイン確認後にこの初期登録ファイルを削除する。Git・Web公開フォルダに保存しない。

1Passwordでの登録手順: https://support.1password.com/one-time-passwords/

## 保護と復旧

OTP秘密鍵はAES-256-GCMで暗号化し、環境とUIDを追加認証データとして結び付ける。使用済みの時間ステップはDBの原子的更新で再利用を拒否。IPとUIDごとに5分10回のDB共有制限。設定・DBの障害時はログイン不可。セッションは固定8時間・HttpOnly・Secure・SameSite=Strictで、指定UID以外のセッションや旧パスワード単独セッションは使えない。

紛失時は本人確認した管理者が `pnpm exec tsx scripts/auth/reset-mfa.ts <環境> <ログインID>` で対象を確認し、`--apply` を付けてリセット。既存セッションが失効し監査記録が残る。その後、上記のオフライン初期登録を行う。公開画面から本人確認を省略して再登録する経路は提供しない。

本番切替と本番用鍵の設定は別途承認後。請求メールは承認までダミー宛先・外部送信停止を維持する。
