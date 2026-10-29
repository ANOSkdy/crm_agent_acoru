'use client'
import { useState } from 'react'
import { rawRequest } from './request'
import { Card, CardBody } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { formatDisplayDateTime } from '@/lib/utils/date'
type Credential={id:string;label:string;expires_at:string;revoked_at:string|null}
export function SyncCredentials(){
 const [rows,setRows]=useState<Credential[]>([]),[label,setLabel]=useState('業務PC'),[token,setToken]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false)
 async function act(action:'list'|'issue'|'revoke',id?:string){setBusy(true);setError('');setToken('');try{if(action!=='list'){const data=await rawRequest('/api/raw/credentials',action==='issue'?{action,label}:{action,id});if(data.token)setToken(data.token)}setRows((await rawRequest('/api/raw/credentials')).credentials)}catch(e){setError(e instanceof Error?e.message:'処理できませんでした')}finally{setBusy(false)}}
 return <Card><details><summary className="cursor-pointer px-6 py-4 font-semibold">ローカルフォルダ同期の認証</summary><CardBody className="border-t border-gray-200 space-y-4">
  <p className="text-sm text-gray-500">このトークンは原本の追加だけに使用できます。30日で失効します。AI処理・CRM反映には利用できません。</p>
  <div className="flex flex-wrap items-end gap-3"><label className="form-field w-full sm:w-64"><span className="form-label">PCなどの名称</span><input className="input" value={label} maxLength={100} onChange={e=>setLabel(e.target.value)}/></label><div className="flex flex-wrap gap-2"><button className="btn btn--secondary" disabled={busy||!label.trim()} onClick={()=>act('issue')}>同期トークンを発行</button><button className="btn btn--secondary" disabled={busy} onClick={()=>act('list')}>発行履歴</button></div></div>
  {token&&<div className="rounded-md border border-[var(--color-primary-border)] bg-[var(--color-primary-soft)] p-4 space-y-3"><p className="text-sm text-gray-600">この表示時だけ取得できます。PCのRAW_SYNC_TOKEN環境変数へ設定してください。</p><input aria-label="発行した同期トークン" className="input font-mono text-xs" readOnly value={token} onFocus={e=>e.target.select()}/><button className="btn btn--secondary btn--sm" onClick={()=>setToken('')}>表示を消す</button></div>}
  {error&&<p role="alert" className="text-sm text-red-700">{error}</p>}
  {rows.length>0&&<ul className="divide-y divide-gray-100">{rows.map(r=><li className="flex flex-wrap items-center justify-between gap-3 py-3" key={r.id}><div className="min-w-0"><p className="text-sm text-gray-900 break-all">{r.label}</p><p className="text-xs text-gray-500 mt-1">期限 {formatDisplayDateTime(r.expires_at)}</p></div>{r.revoked_at?<Badge variant="gray">失効済み</Badge>:<button className="btn btn--secondary btn--sm" disabled={busy} onClick={()=>act('revoke',r.id)}>失効させる</button>}</li>)}</ul>}
 </CardBody></details></Card>
}
