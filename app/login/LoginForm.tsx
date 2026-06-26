'use client'

import { useActionState } from 'react'
import { loginAction, type LoginActionState } from '@/lib/actions/auth'

const initialState: LoginActionState = {}

export function LoginForm() {
  const [state, formAction, pending] = useActionState(loginAction, initialState)

  return (
    <form action={formAction} className="space-y-5">
      {state.error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
          {state.error}
        </div>
      ) : null}

      <div className="space-y-2">
        <label htmlFor="login_id" className="block text-sm font-medium text-gray-700">
          ログインID
        </label>
        <input
          id="login_id"
          name="login_id"
          type="text"
          autoComplete="username"
          required
          className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 shadow-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
        />
      </div>

      <div className="space-y-2">
        <label htmlFor="password" className="block text-sm font-medium text-gray-700">
          パスワード
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 shadow-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
        />
      </div>

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-gray-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? 'ログイン中...' : 'ログイン'}
      </button>
    </form>
  )
}
