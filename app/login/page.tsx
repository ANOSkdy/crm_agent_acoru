import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth/session'
import { LoginForm } from './LoginForm'

export const dynamic = 'force-dynamic'

export default async function LoginPage() {
  const user = await getCurrentUser()
  if (user) redirect('/dashboard')

  return (
    <main className="login-page" aria-labelledby="login-title">
      <section className="login-card">
        <div className="login-card__brand" aria-hidden="true">A</div>
        <div className="login-card__header">
          <p className="login-card__eyebrow">営業ワークスペース</p>
          <h1 id="login-title" className="login-card__title">Acoru CRM</h1>
          <p className="login-card__description">社内システムログイン</p>
        </div>
        <LoginForm />
      </section>
    </main>
  )
}
