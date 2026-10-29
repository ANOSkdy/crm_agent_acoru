'use client'

import { useEffect, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { ManualTestPanel } from './ManualTestPanel'
import type { TestSettings } from '@/lib/bulk-mail/manual-test'
import { campaignLabels, deliveryLabels, renderMail, reviewRecipients, signature, type Campaign, type CustomerChoice, type DraftInput, type ReviewRecipient } from '@/lib/bulk-mail/domain'

type TestPreview = { to: string; sampleCompanyName: string; subject: string; text: string }
type Event = { action: string; detail: { actorName?: string }; created_at: string }
type Result = { campaign?: Campaign; campaigns?: Campaign[]; choices?: CustomerChoice[]; preview?: TestPreview; events?: Event[] }
type Tab = 'compose' | 'addresses' | 'history' | 'test'
const blank: DraftInput = { subject: '', body: '{{会社名}}\nご担当者様\n\nいつもお世話になっております。\nAcoru合同会社の角谷です。\n\n', companyIds: [] }
const date = (s: string) => new Intl.DateTimeFormat('ja-JP', { timeZone: 'Asia/Tokyo', dateStyle: 'short', timeStyle: 'short' }).format(new Date(s))
const eventLabels: Record<string, string> = { draft_saved: '下書き保存', test_simulated: '本文・署名の確認', reviewed: '宛先・本文の最終確認', simulation_started: '模擬送信開始', manual_send_started: '手動で実送信を開始', manual_send_resumed: '未送信分を手動で継続', failed_retried: '失敗分を再実行' }
const mailable = (c: CustomerChoice) => c.eligible && !!c.email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.email) && !c.stopped

async function api(url: string, body?: unknown): Promise<Result> {
  const response = await fetch(url, body === undefined ? { cache: 'no-store' } : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const result = await response.json()
  if (!response.ok) throw new Error(result.error ?? '処理に失敗しました')
  return result
}

export function MailWorkspace({ initialChoices, initialCampaigns, initialCompany, initialView, userEmail, testSettings, live = false }: {
  initialChoices: CustomerChoice[]; initialCampaigns: Campaign[]; initialCompany?: string; initialView?: string; userEmail: string; testSettings: TestSettings; live?: boolean
}) {
  const [choices, setChoices] = useState(initialChoices)
  const [campaigns, setCampaigns] = useState(initialCampaigns)
  const [campaign, setCampaign] = useState<Campaign | null>(null)
  const [draft, setDraft] = useState<DraftInput>(blank)
  const [tab, setTab] = useState<Tab>(initialView === 'addresses' || initialView === 'test' ? initialView : 'compose')
  const [company, setCompany] = useState(initialCompany ?? '')
  const [industry, setIndustry] = useState('')
  const [search, setSearch] = useState('')
  const [historyCompany, setHistoryCompany] = useState(initialCompany ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [testPreview, setTestPreview] = useState<TestPreview | null>(null)
  const [preview, setPreview] = useState<Pick<ReviewRecipient, 'subject' | 'text'> | null>(null)
  const [checked, setChecked] = useState(false)
  const [reviewStale, setReviewStale] = useState(false)
  const [events, setEvents] = useState<Event[]>([])

  const locked = !!campaign && (campaign.recipientMode !== 'company' || !['draft', 'reviewed'].includes(campaign.status))
  const dirty = !campaign || JSON.stringify({ subject: draft.subject.trim(), body: draft.body.trim(), companyIds: draft.companyIds }) !== JSON.stringify({ subject: campaign.subject, body: campaign.body, companyIds: campaign.companyIds })
  const selected = new Set(draft.companyIds)
  const review = reviewRecipients(draft, choices)
  const sendable = review.filter(r => !r.exclusion)
  const filtered = choices.filter(c => (!company || c.id === company) && (!industry || c.industry === industry) && `${c.companyName} ${c.email ?? ''}`.toLowerCase().includes(search.toLowerCase()))
  const visible = filtered.filter(c => c.eligible)
  const selectable = visible.filter(mailable)
  const allSelected = selectable.length > 0 && selectable.every(c => selected.has(c.id))
  const canReview = !dirty && !!campaign && campaign.testedVersion === campaign.version && !locked
  const finalReview = !dirty && !reviewStale && campaign?.status === 'reviewed' && campaign.recipientMode === 'company' ? campaign.review : null
  const history = campaigns.filter(c => !historyCompany || c.review?.some(r => r.companyId === historyCompany))
  const campaignId = campaign?.id
  const campaignStatus = campaign?.status

  useEffect(() => {
    if (!campaignId || !campaignStatus || !['queued', 'running'].includes(campaignStatus)) return
    let active = true
    const timer = setInterval(async () => {
      try {
        const result = await api(`/api/bulk-mail?id=${campaignId}`)
        if (active && result.campaign) {
          setCampaign(result.campaign); setEvents(result.events ?? [])
          if (result.campaign.status === 'completed') {
            const list = await api('/api/bulk-mail')
            if (active) setCampaigns(list.campaigns ?? [])
          }
        }
      } catch (e) { if (active) setError(e instanceof Error ? e.message : '進捗を取得できません') }
    }, 1000)
    return () => { active = false; clearInterval(timer) }
  }, [campaignId, campaignStatus])

  async function perform(fn: () => Promise<void>) {
    if (busy) return
    setBusy(true); setError(''); setMessage('')
    try { await fn() } catch (e) { setError(e instanceof Error ? e.message : '処理に失敗しました') } finally { setBusy(false) }
  }
  function change(next: DraftInput) { setDraft(next); setChecked(false); setTestPreview(null) }
  function toggle(id: string) { change({ ...draft, companyIds: selected.has(id) ? draft.companyIds.filter(c => c !== id) : [...draft.companyIds, id] }) }
  function discardAllowed() { return !dirty || (draft.subject === '' && draft.companyIds.length === 0) || window.confirm('未保存の変更を破棄しますか？') }
  async function refresh() {
    const result = await api('/api/bulk-mail')
    setCampaigns(result.campaigns ?? []); setChoices(result.choices ?? [])
  }
  function open(id: string) {
    if (!discardAllowed()) return
    void perform(async () => {
      const result = await api(`/api/bulk-mail?id=${id}`)
      const c = result.campaign!
      setCampaign(c); setDraft({ subject: c.subject, body: c.body, companyIds: c.companyIds }); setEvents(result.events ?? [])
      setChecked(false); setReviewStale(false); setTestPreview(null)
      setTab(c.recipientMode === 'company' && ['draft', 'reviewed'].includes(c.status) ? 'compose' : 'history')
    })
  }
  function fresh() {
    if (!discardAllowed()) return
    setCampaign(null); setDraft(blank); setEvents([]); setChecked(false); setReviewStale(false); setTestPreview(null); setError(''); setMessage(''); setTab('compose')
  }
  async function action(name: 'test' | 'review' | 'start' | 'retry' | 'resume') {
    if (!campaign) return
    const result = await api('/api/bulk-mail', { action: name, id: campaign.id, version: campaign.version, ...(['start', 'resume'].includes(name) ? { confirmed: true } : {}) })
    if (result.campaign) { setCampaign(result.campaign); setChecked(false) }
    if (name === 'review') setReviewStale(false)
    if (result.preview) { setTestPreview(result.preview); setCampaign({ ...campaign, testedVersion: campaign.version }); setMessage('本文と署名の確認を記録しました。ここではメールを送信していません。') }
    if (name === 'start' || name === 'retry' || name === 'resume') { setTab('history'); setMessage(result.campaign?.deliveryMode === 'live' ? '実送信を開始しました。画面を閉じても今回の処理は続きます。未送信分が残った場合は履歴から継続できます。' : '模擬送信を開始しました。画面を閉じてもサーバーで処理を続けます。') }
    await refresh()
  }
  function settings(id?: string) { if (id) setCompany(id); setTab('addresses') }
  function stop(c: CustomerChoice) {
    void perform(async () => {
      const result = await api('/api/bulk-mail', { action: 'stop', email: c.email, stopped: !c.stopped })
      setChoices(result.choices ?? []); setChecked(false); setReviewStale(true)
      setMessage(c.stopped ? '送信停止を解除しました。最終確認をやり直してください。' : 'この代表メールへの送信を停止しました。')
    })
  }

  return <div className="mail-workspace">
    <header className="mail-heading"><div><p className="mail-eyebrow">顧客への業務連絡</p><h1>一斉メール</h1><p>選択した顧客の代表メールへ、1社につき1通ずつ連絡します。</p></div><button className="btn btn--primary" onClick={fresh} disabled={busy}>新規作成</button></header>
    <div className="mail-notice"><strong>{live ? '手動で実メールを送信' : '模擬送信モード'}</strong><p>業務連絡用の代表メールは請求とは別に管理します。{live ? '最終確認後に送信ボタンを押すと、選択した代表メールへ送信します。' : '一斉送信は模擬処理です。'}「実メールのテスト」では指定の1宛先へ手動で送信できます。</p></div>
    <div className="mail-tabs" role="group" aria-label="一斉メールの表示">
      <button className={tab === 'compose' ? 'is-active' : ''} onClick={() => setTab('compose')}>作成・確認</button>
      <button className={tab === 'addresses' ? 'is-active' : ''} onClick={() => setTab('addresses')}>代表メール設定</button>
      <button className={tab === 'history' ? 'is-active' : ''} onClick={() => setTab('history')}>下書き・送信履歴 <span>{campaigns.length}</span></button>
      <button className={tab === 'test' ? 'is-active' : ''} onClick={() => setTab('test')}>実メールのテスト</button>
    </div>
    {error ? <p role="alert" className="mail-error">{error}</p> : null}
    {message ? <p role="status" className="mail-success">{message}</p> : null}
    {tab === 'test' ? <ManualTestPanel settings={testSettings} /> : tab === 'addresses' ? <section className="mail-panel">
      <h2>顧客ごとの代表メール設定</h2><p>各顧客の業務連絡用メールを1件登録します。請求用メールや担当者メールからの自動補完は行いません。</p>
      <Filters choices={choices} company={company} industry={industry} search={search} onCompany={setCompany} onIndustry={setIndustry} onSearch={setSearch} />
      <AddressBook choices={filtered} busy={busy} onStop={stop} onSave={(c, email) => void perform(async () => {
        const result = await api('/api/bulk-mail', { action: 'address', data: { companyId: c.id, email, version: c.addressVersion } })
        setChoices(result.choices ?? []); setChecked(false); setReviewStale(true)
        setMessage('代表メールを保存しました。送信前に宛先・本文を最終確認してください。')
      })} />
    </section> : tab === 'compose' ? <>
      {locked ? <p className="mail-notice">この内容は編集できません。旧方式の担当者宛て下書きは、新規作成から代表メールを選択してください。</p> : null}
      <div className="mail-compose">
        <section className="mail-panel" aria-labelledby="mail-targets">
          <div className="mail-section-heading"><h2 id="mail-targets">1. 顧客を選択</h2><button className="mail-link" onClick={() => settings()}>代表メールを設定</button></div>
          <p className="mail-muted">対象：受注済み案件がある有効な顧客。代表メール未登録・送信停止中の顧客は選択できません。</p>
          <fieldset disabled={busy || locked} className="mail-fieldset">
            <Filters choices={choices.filter(c => c.eligible)} company={company} industry={industry} search={search} onCompany={setCompany} onIndustry={setIndustry} onSearch={setSearch} />
            <div className="mail-selection"><label><input type="checkbox" checked={allSelected} disabled={!selectable.length} onChange={() => change({ ...draft, companyIds: allSelected ? draft.companyIds.filter(id => !selectable.some(c => c.id === id)) : [...new Set([...draft.companyIds, ...selectable.map(c => c.id)])] })} />表示中を全選択</label><strong>選択 {selected.size}社 ／ 送信予定 {sendable.length}件</strong><button type="button" className="mail-link" onClick={() => change({ ...draft, companyIds: [] })}>選択を解除</button></div>
            <div className="mail-table-wrap"><table className="mail-table"><thead><tr><th>選択</th><th>顧客</th><th>代表メール</th><th>状態</th></tr></thead><tbody>{visible.map(c => <tr key={c.id}>
              <td><input type="checkbox" aria-label={`${c.companyName}を選択`} checked={selected.has(c.id)} disabled={!mailable(c) && !selected.has(c.id)} onChange={() => toggle(c.id)} /></td>
              <td>{c.companyName}<small>{c.industry}</small></td><td>{c.email || <span className="mail-muted">未登録</span>}</td>
              <td>{c.email ? <button className="mail-link" onClick={() => stop(c)}>{c.stopped ? '停止中（解除）' : '送信可（停止する）'}</button> : <button className="mail-link" onClick={() => settings(c.id)}>代表メールを登録</button>}</td>
            </tr>)}</tbody></table>{!visible.length ? <p className="mail-empty">条件に一致する顧客はいません。</p> : null}</div>
          </fieldset>
          {review.some(r => r.exclusion) ? <details className="mail-exclusions"><summary>対象外・重複 {review.filter(r => r.exclusion).length}件</summary><ul>{review.filter(r => r.exclusion).map(r => <li key={r.companyId}>{r.companyName}：{r.exclusion}</li>)}</ul></details> : null}
          <p className="mail-muted">絞り込みを変えても選択は保持します。同じ代表メールは1通にまとめます。1回あたり最大500社です。</p>
        </section>
        <section className="mail-panel" aria-labelledby="mail-content"><h2 id="mail-content">2. 件名・本文を作成</h2>
          <fieldset disabled={busy || locked} className="mail-fieldset mail-editor">
            <label>件名<input aria-label="件名" maxLength={200} value={draft.subject} onChange={e => change({ ...draft, subject: e.target.value })} placeholder="例：サービスメンテナンスのお知らせ" /></label>
            <label>本文<textarea aria-label="本文" rows={13} maxLength={20000} value={draft.body} onChange={e => change({ ...draft, body: e.target.value })} /></label>
            <p className="mail-muted">差し込み：{'{{会社名}}'}。宛名は「ご担当者様」などを本文に記入してください。署名は末尾に付きます。</p>
            <details open><summary>固定署名</summary><pre className="mail-signature">{signature}</pre></details>
          </fieldset>
          <div className="mail-actions"><button className="btn btn--primary" disabled={busy || locked || !draft.subject.trim() || !draft.body.trim() || !selected.size || selected.size > 500} onClick={() => void perform(async () => {
            const result = await api('/api/bulk-mail', { action: 'save', data: draft, ...(campaign ? { id: campaign.id, version: campaign.version } : {}) })
            const c = result.campaign!; setCampaign(c); setDraft({ subject: c.subject, body: c.body, companyIds: c.companyIds }); setTestPreview(null); setChecked(false); setReviewStale(false); setMessage('下書きを保存しました。'); await refresh()
          })}>下書きを保存</button><button className="btn" disabled={!sendable.length} onClick={() => setPreview(renderMail(draft, { companyName: sendable[0].companyName }))}>本文プレビュー</button></div>
          {dirty && !locked ? <p className="mail-muted">内容を保存してからテスト・最終確認へ進んでください。</p> : null}
        </section>
      </div>
      <section className="mail-panel"><h2>3. テスト・最終確認</h2><p>{live ? '保存した本文と署名を確認してから、送信先一覧を最終確認します。この確認操作ではメールを送信しません。' : <>保存した内容を <strong>{userEmail}</strong> 宛てとしてテストします（実送信なし）。</>}</p>
        <div className="mail-actions"><button className="btn" disabled={busy || dirty || locked || !sendable.length} onClick={() => void perform(() => action('test'))}>{live ? '本文・署名を確認' : '自分宛てにテスト（模擬）'}</button><button className="btn btn--primary" disabled={busy || !canReview} onClick={() => void perform(() => action('review'))}>宛先・本文を最終確認</button></div>
        {testPreview ? <details open className="mail-test"><summary>テスト結果：{testPreview.to} ／ {testPreview.sampleCompanyName} の差し込み例</summary><MailBody subject={testPreview.subject} text={testPreview.text} /></details> : null}
        {finalReview ? <div className="mail-review"><h3>最終宛先一覧</h3><p>送信予定 {finalReview.filter(r => !r.exclusion).length}件 ／ 対象外 {finalReview.filter(r => r.exclusion).length}件</p>{finalReview[0]?.from ? <p>送信元：{finalReview[0].from}</p> : null}<RecipientTable recipients={finalReview} onPreview={setPreview} /><label className="mail-confirm"><input type="checkbox" checked={checked} onChange={e => setChecked(e.target.checked)} disabled={busy} />宛先・件名・本文・署名を確認しました。</label><button className="btn btn--primary" disabled={busy || !checked} onClick={() => void perform(() => action('start'))}>{finalReview.filter(r => !r.exclusion).length}件に今すぐ{live ? '送信' : '模擬送信'}</button></div> : null}
      </section>
    </> : <div className="mail-history-layout">
      <section className="mail-panel"><div className="mail-section-heading"><h2>下書き・送信履歴</h2><button className="mail-link" disabled={busy} onClick={() => void perform(refresh)}>更新</button></div>
        <label>顧客で絞り込み<select aria-label="顧客で絞り込み" value={historyCompany} onChange={e => setHistoryCompany(e.target.value)}><option value="">すべての顧客</option>{[...new Map([...choices.map(c => [c.id, c.companyName] as const), ...campaigns.flatMap(c => (c.review ?? []).map(r => [r.companyId, r.companyName] as const))]).entries()].filter(([id]) => id).map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>
        <p className="mail-muted">更新順で直近100件を表示します。</p><div className="mail-history-list">{history.map(c => <button key={c.id} className={`mail-history-item${campaign?.id === c.id ? ' is-active' : ''}`} disabled={busy} onClick={() => open(c.id)}><strong>{c.subject}</strong><span>{campaignLabels[c.status]} · {date(c.updatedAt)}</span><span>選択 {c.selectedCount}{c.recipientMode === 'company' ? '社' : '名（旧方式）'} · {c.actorName}</span></button>)}{!history.length ? <p className="mail-empty">履歴はまだありません。</p> : null}</div>
      </section>
      <section className="mail-panel">{campaign ? <>
        <div className="mail-section-heading"><h2>{campaign.subject}</h2><span className="mail-pill">{campaignLabels[campaign.status]}</span></div>
        {campaign.recipientMode === 'contacts' ? <p className="mail-notice">担当者宛ての旧方式の履歴です。この下書き・履歴からの送信や再実行はできません。</p> : null}
        <p className="mail-muted">最終操作：{campaign.actorName} ／ {date(campaign.updatedAt)}（日本時間）</p>
        <div className="mail-counts">{(['pending', 'sending', ...(campaign.deliveryMode === 'live' ? ['sent' as const] : ['simulated' as const]), 'failed', 'uncertain', 'excluded'] as const).map(s => <div key={s}><strong>{campaign.deliveries.filter(d => d.status === s).length}</strong><span>{deliveryLabels[s]}</span></div>)}</div>
        <p className="mail-muted">{campaign.deliveryMode === 'live' ? 'メール受付済みはメールサービスの受付結果です。受信箱への到達とは異なります。結果確認待ちは自動再送しません。' : '模擬送信完了は模擬処理の完了です。実際のメール受付・到達は発生しません。'}</p><RecipientTable recipients={campaign.deliveries} onPreview={setPreview} />
        {campaign.deliveryMode === 'live' && ['queued', 'running'].includes(campaign.status) && campaign.deliveries.some(d => d.status === 'pending' || d.status === 'sending') ? <><p className="mail-muted">処理が中断した場合は、未送信分だけを手動で継続できます。メールサービス受付済み・結果確認待ちの宛先は再送しません。</p><button className="btn btn--primary" disabled={busy || !!campaign.processingUntil} onClick={() => void perform(() => action('resume'))}>未送信分の送信を継続</button></> : null}
        {!campaign.deliveries.length ? <MailBody subject={campaign.subject} text={campaign.body} /> : null}
        {campaign.deliveryMode !== 'live' && campaign.recipientMode === 'company' && campaign.deliveries.some(d => d.status === 'failed') ? <button className="btn" disabled={busy || campaign.status !== 'completed'} onClick={() => void perform(() => action('retry'))}>失敗した宛先のみ再実行</button> : null}
        <details className="mail-audit"><summary>操作履歴</summary><ul>{events.map((e, index) => <li key={index}>{date(e.created_at)} · {e.detail.actorName} · {eventLabels[e.action] ?? e.action}</li>)}</ul></details>
      </> : <p className="mail-empty">履歴を選択すると、顧客ごとの本文と結果を確認できます。</p>}</section>
    </div>}
    {preview ? <Modal title="顧客ごとのメール本文" onClose={() => setPreview(null)}><MailBody subject={preview.subject} text={preview.text} /></Modal> : null}
  </div>
}

function Filters({ choices, company, industry, search, onCompany, onIndustry, onSearch }: {
  choices: CustomerChoice[]; company: string; industry: string; search: string; onCompany: (s: string) => void; onIndustry: (s: string) => void; onSearch: (s: string) => void
}) {
  const industries = [...new Set(choices.flatMap(c => c.industry ? [c.industry] : []))]
  return <div className="mail-filters">
    <label>顧客<select aria-label="顧客" value={company} onChange={e => onCompany(e.target.value)}><option value="">すべての顧客</option>{choices.map(c => <option key={c.id} value={c.id}>{c.companyName}</option>)}</select></label>
    <label>業種<select aria-label="業種" value={industry} onChange={e => onIndustry(e.target.value)}><option value="">すべての業種</option>{industries.map(name => <option key={name}>{name}</option>)}</select></label>
    <label className="mail-search">検索<input aria-label="検索" value={search} onChange={e => onSearch(e.target.value)} placeholder="会社名・代表メール" /></label>
  </div>
}

function AddressBook({ choices, busy, onSave, onStop }: { choices: CustomerChoice[]; busy: boolean; onSave: (c: CustomerChoice, email: string) => void; onStop: (c: CustomerChoice) => void }) {
  const [edits, setEdits] = useState<Record<string, string>>({})
  return <div className="mail-table-wrap mail-address-book"><table className="mail-table"><thead><tr><th>顧客</th><th>業務連絡用の代表メール</th><th>保存</th><th>送信状態</th></tr></thead><tbody>{choices.map(c => <tr key={c.id}>
    <td>{c.companyName}<small>{c.eligible ? '契約済み・送信対象' : '現在は送信対象外'}</small></td>
    <td><input type="email" aria-label={`${c.companyName}の代表メール`} maxLength={254} value={edits[c.id] ?? c.email ?? ''} onChange={e => setEdits({ ...edits, [c.id]: e.target.value })} placeholder="例：info@example.jp" disabled={busy} /></td>
    <td><button className="btn btn--sm" aria-label={`${c.companyName}の代表メールを保存`} disabled={busy || (edits[c.id] ?? c.email ?? '').trim() === (c.email ?? '')} onClick={() => onSave(c, edits[c.id] ?? '')}>保存</button></td>
    <td>{c.email ? <button className="mail-link" disabled={busy} onClick={() => onStop(c)}>{c.stopped ? '停止中（解除）' : '送信可（停止する）'}</button> : '未登録'}</td>
  </tr>)}</tbody></table>{!choices.length ? <p className="mail-empty">条件に一致する顧客はいません。</p> : null}</div>
}

function MailBody({ subject, text }: { subject: string; text: string }) { return <div className="mail-body"><strong>{subject}</strong><pre>{text}</pre></div> }
function RecipientTable({ recipients, onPreview }: { recipients: (ReviewRecipient & { status?: keyof typeof deliveryLabels; result?: string | null })[]; onPreview: (r: ReviewRecipient) => void }) {
  return <div className="mail-table-wrap"><table className="mail-table"><thead><tr><th>顧客</th><th>宛先</th><th>状態</th><th>本文</th></tr></thead><tbody>{recipients.map(r => <tr key={r.contactId ?? r.companyId}><td>{r.companyName}{r.name ? <small>{r.name}（旧方式）</small> : null}</td><td>{r.email || '未登録'}</td><td>{r.status ? deliveryLabels[r.status] : r.exclusion ? '対象外' : '送信予定'}{r.exclusion || r.result ? <small>{r.exclusion ?? r.result}</small> : null}</td><td><button className="mail-link" onClick={() => onPreview(r)}>本文を見る</button></td></tr>)}</tbody></table></div>
}
