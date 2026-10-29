'use client'

import { useActionState } from 'react'
import { verifyLocalKeyAction } from '@/lib/actions/local-auth'

export function LocalKeyForm({ returnTo }: { returnTo: string }) {
  const [state, action, pending] = useActionState(verifyLocalKeyAction, {} as { error?: string })
  return <form action={action} className="login-form">
    <input type="hidden" name="next" value={returnTo} />
    {state.error ? <div className="login-form__error" role="alert">{state.error}</div> : null}
    <div className="form-field"><label htmlFor="local-key" className="form-label">ローカル仮認証キー</label><input id="local-key" name="local_key" type="password" autoComplete="off" maxLength={128} required className="input" autoFocus /></div>
    <button type="submit" disabled={pending} className="btn btn--primary login-form__submit">{pending ? '認証中...' : '仮認証でログイン'}</button>
    <p className="login-card__description">このPC上での試用に使用します。1Passwordの認証コードは不要です。</p>
    <p className="login-card__description">有効期間は8時間です。サーバーを再起動するとログアウトします。</p>
  </form>
}
