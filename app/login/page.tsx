import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth/session'
import { OtpForm } from './verify/OtpForm'
import { safeReturnTo } from '@/lib/auth/mfa-crypto'
import { localAuthAvailable } from '@/lib/auth/local-session'
import { LocalKeyForm } from './LocalKeyForm'

export const dynamic = 'force-dynamic'

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>
}) {
  const returnTo = safeReturnTo((await searchParams).next)
  const user = await getCurrentUser()
  if (user) redirect(returnTo)
  const localAuth = await localAuthAvailable()

  return (
    <main className="login-page" aria-labelledby="login-title">
      <section className="login-card">
        <div className="login-card__brand" aria-hidden="true">
          A
        </div>
        <div className="login-card__header">
          <p className="login-card__eyebrow">営業ワークスペース</p>
          <h1 id="login-title" className="login-card__title">
            Acoru CRM
          </h1>
          <p className="login-card__description">
            {localAuth ? 'ローカル試用用の固定キーを入力してください。' : '1Passwordの認証コードを入力してください。'}
          </p>
        </div>
        {localAuth ? <LocalKeyForm returnTo={returnTo} /> : <OtpForm returnTo={returnTo} />}
      </section>
    </main>
  )
}
