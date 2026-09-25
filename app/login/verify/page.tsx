import Link from 'next/link'
import { redirect } from 'next/navigation'
import QRCode from 'qrcode'
import { pendingChallenge } from '@/lib/auth/mfa'
import {
  authEnvironment,
  authenticator,
  decryptSecret,
} from '@/lib/auth/mfa-crypto'
import { OtpForm } from './OtpForm'

export const dynamic = 'force-dynamic'
export const metadata = {
  title: 'OTP認証 | Acoru CRM',
  robots: { index: false, follow: false },
}

export default async function VerifyPage() {
  let challenge
  let secret: string | undefined
  let qr: string | undefined
  try {
    challenge = await pendingChallenge()
    if (challenge?.purpose === 'enroll') {
      secret = decryptSecret(
        challenge.secret_encrypted,
        `${authEnvironment()}:${challenge.user_id}`,
      )
      qr = await QRCode.toDataURL(
        authenticator(
          secret,
          `${challenge.login_id} (${authEnvironment()})`,
        ).toString(),
        { width: 256, margin: 2 },
      )
    }
  } catch {
    return (
      <main className="login-page">
        <section className="login-card">
          <h1>現在認証できません</h1>
          <p>時間をおいて再度お試しいただくか、管理者にご確認ください。</p>
          <Link href="/login">ログインに戻る</Link>
        </section>
      </main>
    )
  }
  if (!challenge) redirect('/login')
  return (
    <main className="login-page" aria-labelledby="otp-title">
      <section className="login-card">
        <div className="login-card__header">
          <p className="login-card__eyebrow">Acoru CRM · 2段階認証</p>
          <h1 id="otp-title" className="login-card__title">
            {qr ? '1Passwordに登録' : '認証コードを確認'}
          </h1>
        </div>
        {qr && (
          <div className="login-form">
            <p>
              1PasswordでこのCRMのログイン項目を編集し、「ワンタイムパスワード」に下のQRコードを登録してください。
            </p>
            {/* Initial enrollment only; never display a confirmed credential. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={qr}
              alt="1Passwordへの初回登録用QRコード"
              width={256}
              height={256}
              style={{ margin: '0 auto', maxWidth: '100%' }}
            />
            <details>
              <summary>QRを読み取れない場合</summary>
              <p>
                1Passwordの「ワンタイムパスワード」欄にこのキーを保存してください。
              </p>
              <code style={{ overflowWrap: 'anywhere' }}>{secret}</code>
            </details>
            <p>
              保存した1Passwordに表示されるコードを入力すると登録が完了します。この画面は5分で失効します。
            </p>
          </div>
        )}
        <OtpForm />
      </section>
    </main>
  )
}
