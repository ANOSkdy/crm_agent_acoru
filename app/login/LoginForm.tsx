'use client'

import { useActionState } from 'react'
import { loginAction, type LoginActionState } from '@/lib/actions/auth'

const initialState: LoginActionState = {}

export function LoginForm({ returnTo = '/dashboard' }: { returnTo?: string }) {
  const [state, formAction, pending] = useActionState(loginAction, initialState)

  return (
    <form action={formAction} className="login-form">
      <input type="hidden" name="next" value={returnTo} />
      {state.error ? (
        <div className="login-form__error" role="alert">
          {state.error}
        </div>
      ) : null}

      <div className="form-field">
        <label htmlFor="login_id" className="form-label">
          ログインID
        </label>
        <input
          id="login_id"
          name="login_id"
          type="text"
          autoComplete="username"
          required
          className="input"
        />
      </div>

      <div className="form-field">
        <label htmlFor="password" className="form-label">
          パスワード
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="input"
        />
      </div>

      <button
        type="submit"
        disabled={pending}
        className="btn btn--primary login-form__submit"
      >
        {pending ? '確認中...' : '認証コードへ進む'}
      </button>
      <p className="login-card__description">
        次に1Passwordの認証コードを確認します。
      </p>
    </form>
  )
}
