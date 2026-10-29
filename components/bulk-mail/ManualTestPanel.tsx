'use client'

import { useState } from 'react'
import { signature } from '@/lib/bulk-mail/domain'
import type { PreparedTest, TestSettings } from '@/lib/bulk-mail/manual-test'

export function ManualTestPanel({ settings: initialSettings }: { settings: TestSettings }) {
  const [settings, setSettings] = useState(initialSettings)
  const [subject, setSubject] = useState('業務連絡メールの送信確認')
  const [body, setBody] = useState('テスト送信です。\n\nメールの受信と、本文・署名の表示をご確認ください。')
  const [prepared, setPrepared] = useState<PreparedTest | null>(null)
  const [confirmed, setConfirmed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function action(action: 'prepare' | 'send') {
    if (busy || (action === 'send' && (!confirmed || !prepared || !settings.canSend))) return
    setBusy(true); setError('')
    try {
      const response = await fetch('/api/bulk-mail/test', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(action === 'prepare' ? { action, data: { subject, body } } : { action, id: prepared!.id, confirmed: true }) })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error ?? 'テスト処理に失敗しました')
      setPrepared(result.prepared); setSettings(result.settings); setConfirmed(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'テスト処理に失敗しました')
      // A send may already have reached the provider. Read its durable state
      // through preparation before permitting another action.
      if (action === 'send') { setPrepared(null); setConfirmed(false) }
    } finally { setBusy(false) }
  }
  function changed() { setPrepared(null); setConfirmed(false); setError('') }

  return <section className="mail-panel" aria-labelledby="manual-test-title">
    <h2 id="manual-test-title">実メールの手動テスト</h2>
    <p>送信先：<strong>{settings.to || '未設定'}</strong> ／ 送信元：{settings.from || '未設定'}</p>
    <p>「テストメールを準備」で宛先・件名・本文を確認し、最後の送信ボタンを押すと1通送ります。</p>
    {settings.reason ? <p className="mail-notice">{settings.reason}</p> : null}
    {error ? <p role="alert" className="mail-error">{error}</p> : null}
    <fieldset className="mail-fieldset mail-editor" disabled={busy}>
      <label>テスト件名<input aria-label="テスト件名" value={subject} maxLength={200} onChange={e => { setSubject(e.target.value); changed() }} /></label>
      <label>テスト本文<textarea aria-label="テスト本文" value={body} maxLength={20000} rows={7} onChange={e => { setBody(e.target.value); changed() }} /></label>
    </fieldset>
    <p className="mail-muted">件名の先頭に「【テスト】」、本文の末尾に指定の署名を付けます。会社名などの差し込みは使わず、確認したい文面を直接入力してください。</p>
    <details><summary>固定署名</summary><pre className="mail-signature">{signature}</pre></details>
    <div className="mail-actions"><button className="btn" disabled={busy || !subject.trim() || !body.trim() || !settings.to || !settings.from} onClick={() => void action('prepare')}>テストメールを準備</button></div>
    {prepared ? <div className="mail-review" aria-label="手動テストの送信確認">
      <h3>{prepared.status === 'prepared' ? '送信前の確認（未送信）' : prepared.status === 'sent' ? 'メールサービス受付済み' : '送信結果の確認が必要です'}</h3>
      <p>宛先：<strong>{prepared.payload.to[0]}</strong><br />送信元：{prepared.payload.from}</p>
      <div className="mail-body"><strong>{prepared.payload.subject}</strong><pre>{prepared.payload.text}</pre></div>
      {prepared.status === 'prepared' ? <>
        <label className="mail-confirm"><input type="checkbox" checked={confirmed} disabled={busy} onChange={e => setConfirmed(e.target.checked)} />この宛先・件名・本文でテストメールを1通送信します。</label>
        <button className="btn btn--primary" disabled={busy || !confirmed || !settings.canSend} onClick={() => void action('send')}>{busy ? '処理中…' : '確認した宛先に1通送信'}</button>
      </> : <p role="status">{prepared.status === 'sent' ? `送信先の受信箱・迷惑メールをご確認ください。受付ID：${prepared.providerId}` : '処理中または結果が不明です。Resendの送信履歴をご確認ください。'} 同じ内容は再送しません。</p>}
      <p className="mail-muted">再テストする場合は件名か本文を変更して準備してください。</p>
    </div> : null}
  </section>
}
