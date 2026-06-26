import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth/session'
import { LoginForm } from './LoginForm'

export const dynamic = 'force-dynamic'

export default async function LoginPage() {
  const user = await getCurrentUser()
  if (user) redirect('/dashboard')

  return (
    <main className="min-h-full bg-gradient-to-br from-gray-950 via-gray-900 to-gray-800 px-4 py-12 flex items-center justify-center">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-2xl">
        <div className="mb-8 text-center">
          <p className="mb-3 text-4xl">🔐</p>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">Acoru CRM</h1>
          <p className="mt-2 text-sm text-gray-500">社内システムログイン</p>
        </div>
        <LoginForm />
      </div>
    </main>
  )
}
