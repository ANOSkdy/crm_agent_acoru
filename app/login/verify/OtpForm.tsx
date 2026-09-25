'use client'

import { useActionState } from 'react'
import Link from 'next/link'
import { verifyOtpAction, type LoginActionState } from '@/lib/actions/auth'

export function OtpForm() {
  const [state, action, pending] = useActionState(
    verifyOtpAction,
    {} as LoginActionState,
  )
  return (
    <form action={action} className="login-form">
      {state.error && (
        <div className="login-form__error" role="alert">
          {state.error}
        </div>
      )}
      <div className="form-field">
        <label htmlFor="code" className="form-label">
          認証コード（6桁）
        </label>
        <input
          id="code"
          name="code"
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]{6}"
          maxLength={6}
          required
          className="input"
          autoFocus
        />
      </div>
      <button
        type="submit"
        disabled={pending}
        className="btn btn--primary login-form__submit"
      >
        {pending ? '認証中...' : '認証してログイン'}
      </button>
      <p className="login-card__description">
        コードは30秒ごとに更新されます。ログインの有効期間は8時間です。
      </p>
      <Link href="/login" className="btn btn--secondary">
        ログインからやり直す
      </Link>
      <p className="login-card__description">
        1Passwordを利用できない場合は、管理者にOTPの再登録を依頼してください。
      </p>
    </form>
  )
}
