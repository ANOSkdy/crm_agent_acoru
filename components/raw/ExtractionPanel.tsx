'use client'
import { useEffect,useRef,useState } from 'react'
import { rawRequest } from './request'
import { rawStatusLabels,comparisonLabels } from './labels'
import { ProposalActions } from './ProposalActions'
import type { RawItem,ReviewedPayload } from '@/lib/raw/extraction-domain'
import { Badge } from '@/components/ui/Badge'
import { formatDisplayDateTime } from '@/lib/utils/date'
type Run={id:string;status:string;model:string;created_at:string;pending_count:number}
type RunDetail={run:Run;chunks:{id:string;ordinal:number;status:string;error_code:string|null}[];items:RawItem[]}
type Target={id:string;title:string;company_id:string;company_name:string}
export function ExtractionPanel({revisionId,allowed,canWrite,flags}:{revisionId:string;allowed:boolean;canWrite:boolean;flags:{extraction:boolean;apply:boolean}}){
 const [runs,setRuns]=useState<Run[]>([]),[detail,setDetail]=useState<RunDetail|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('')
 const mounted=useRef(true)
 useEffect(()=>{mounted.current=true;let active=true;rawRequest('/api/raw/extractions?revision='+revisionId).then(async data=>{if(!active)return;setRuns(data.runs);const requested=new URLSearchParams(window.location.search).get('run');const id=data.runs.find((r:Run)=>r.id===requested)?.id??data.runs[0]?.id;if(id){const d=await rawRequest('/api/raw/extractions/'+id);if(active)setDetail(d)}}).catch(()=>{if(active)setError('抽出履歴を取得できませんでした')});return()=>{active=false;mounted.current=false}},[revisionId])
 async function refresh(id:string){const d=await rawRequest('/api/raw/extractions/'+id);if(mounted.current)setDetail(d);const data=await rawRequest('/api/raw/extractions?revision='+revisionId);if(mounted.current)setRuns(data.runs)}
 async function process(id:string,retry=false){
  setBusy(true);setError('')
  try{let first=true;while(mounted.current){const data:RunDetail=await rawRequest('/api/raw/extractions/'+id,{retry:first&&retry});first=false;if(!mounted.current)break;setDetail(data);if(data.chunks.some(c=>c.status==='failed')||!data.chunks.some(c=>c.status==='queued'))break}if(mounted.current)await refresh(id)}
  catch(e){if(mounted.current)setError(e instanceof Error?e.message:'抽出できませんでした')}finally{if(mounted.current)setBusy(false)}
 }
 async function start(force=false){setError('');setBusy(true);try{const result=await rawRequest('/api/raw/extractions',{revision_id:revisionId,force});await process(result.id,true)}catch(e){setError(e instanceof Error?e.message:'抽出できませんでした');setBusy(false)}}
 return <section className="space-y-4 border-t border-gray-200 pt-5"><h3 className="font-semibold">AI抽出と確認</h3>
  <p className="text-sm leading-relaxed text-gray-500">長い原文は分割して処理します。画面を閉じても原本・完了済み部分は残り、後から再開できます。抽出だけではCRMに反映されません。</p>
  {canWrite&&flags.extraction&&<div className="flex flex-wrap gap-2"><button className="btn btn--primary" disabled={busy||!allowed} onClick={()=>start()}>抽出を開始／再開</button><button className="btn btn--secondary" disabled={busy||!allowed} onClick={()=>start(true)}>新しい実行として再解析</button></div>}
  {!allowed&&<p className="rounded-md bg-gray-50 p-3 text-sm text-gray-500">外部AI処理を許可すると抽出できます。</p>}
  {runs.length>0&&<label className="form-field"><span className="form-label">抽出履歴</span><select className="select min-w-0" disabled={busy} value={detail?.run.id??''} onChange={e=>refresh(e.target.value).catch(()=>setError('取得できませんでした'))}>{runs.map(r=><option key={r.id} value={r.id}>{formatDisplayDateTime(r.created_at)} / {rawStatusLabels[r.status]??r.status} / 確認待ち{r.pending_count}件</option>)}</select></label>}
  {error&&<p className="text-sm text-red-700" role="alert">{error}</p>}
  {detail&&<><div role="status" className="flex flex-wrap items-center gap-3 text-xs text-gray-500"><Badge variant={detail.run.status==='succeeded'?'success':'info'}>{busy?'抽出中…':rawStatusLabels[detail.run.status]}</Badge><span>{detail.chunks.filter(c=>c.status==='succeeded').length} / {detail.chunks.length}部分完了</span></div>
   <ul className="text-sm text-gray-500 space-y-1">{detail.chunks.filter(c=>c.status!=='succeeded').map(c=><li key={c.id}>部分{c.ordinal+1}：{rawStatusLabels[c.status]}{c.error_code?'（再試行できます）':''}</li>)}</ul>
   {canWrite&&flags.extraction&&detail.run.status!=='succeeded'&&<button className="btn btn--secondary" disabled={busy||!allowed} onClick={()=>process(detail.run.id,true)}>未完了部分だけ再試行</button>}
   {detail.run.status==='succeeded'&&detail.items.length===0&&<p className="py-6 text-center text-sm text-gray-500">出典を伴う候補はありませんでした。</p>}
   {detail.items.filter(item=>item.item_type!=='activity').map(item=><RawReviewCard key={item.id+'-'+item.review_status+'-'+item.base_revision} item={item} canWrite={canWrite&&!busy} canApply={flags.apply} onChanged={()=>refresh(detail.run.id)}/>)}
  </>}
 </section>
}
function RawReviewCard({item,canWrite,canApply,onChanged}:{item:RawItem;canWrite:boolean;canApply:boolean;onChanged:()=>Promise<void>}){
 const initial=item.reviewed_payload??item.proposed_payload
 const [payload,setPayload]=useState<ReviewedPayload>({title:initial.title,body:initial.body,date:initial.date,due_date:initial.due_date,activity_type:initial.activity_type,rationale:initial.rationale,duration_minutes:initial.duration_minutes??null,worker_user_id:initial.worker_user_id??null})
 const [deal,setDeal]=useState(item.deal_id??''),[company,setCompany]=useState(item.company_id??''),[query,setQuery]=useState(''),[targets,setTargets]=useState<Target[]>([])
 const [companies,setCompanies]=useState<{id:string;name:string}[]>([]),[workers,setWorkers]=useState<{id:string;name:string}[]>([])
 const [confirm,setConfirm]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('')
 const editable=canWrite&&!busy&&item.review_status!=='applied'&&item.comparison!=='same'
 async function search(){try{const data=await rawRequest('/api/raw/targets?q='+encodeURIComponent(query));setTargets(data.targets);setCompanies(data.companies);setWorkers(data.workers)}catch{setError('案件候補を取得できませんでした')}}
 async function submit(action:'approve'|'apply'|'reject'){setBusy(true);setError('');try{const result=await rawRequest('/api/raw/items/'+item.id,action==='approve'?{action,payload,company_id:company||null,deal_id:deal||null,confirm_new:confirm}:{action});await onChanged();if(result.status==='conflict')setError('案件が更新されています。最新の状態を確認して再承認してください')}catch(e){setError(e instanceof Error?e.message:'処理できませんでした')}finally{setBusy(false)}}
 const labels={activity:'活動',task:'課題',decision:'意思決定',work_log:'実績工数'}
 return <section id={'item-'+item.id} className="rounded-lg border border-gray-200 p-4 bg-white space-y-4">
  <div className="flex flex-wrap items-center justify-between gap-2"><strong className="text-sm">{labels[item.item_type]}</strong><div className="flex flex-wrap items-center gap-2"><Badge variant={item.review_status==='applied'?'success':item.review_status==='conflict'?'warning':'gray'}>{rawStatusLabels[item.review_status]}</Badge><span className="text-xs text-gray-500">{comparisonLabels[item.comparison]}</span></div></div>
  <div className="space-y-2"><p className="text-xs text-gray-500">原文 {item.source_start_line}–{item.source_end_line}行</p><blockquote className="border-l-4 border-[var(--color-primary-border)] bg-gray-50 px-3 py-2 text-sm text-gray-700 whitespace-pre-wrap break-all">{item.source_quote}</blockquote></div>
  <p className="text-xs leading-relaxed text-gray-500 break-all">顧客候補：{item.proposed_payload.company_name??'未特定'} / 案件候補：{item.proposed_payload.deal_name??'未特定'} / {rawStatusLabels[item.resolution_status]}</p>
  {item.comparison==='same'&&<p className="rounded-md bg-gray-50 p-3 text-sm text-gray-600">以前の同じ候補です。新しいレコードは作成しません。<a className="crm-grid__link hover:underline" href={'/raw?item='+item.previous_item_id}>以前の候補を開く</a></p>}
  {item.previous_item&&item.comparison!=='same'&&<details className="rounded-md border border-gray-200 p-3 text-sm space-y-3"><summary className="cursor-pointer font-medium">以前の候補と現在のCRM状態</summary><p className="font-medium">以前の候補</p><BusinessValues value={item.previous_item.payload}/><p className="font-medium">現在のCRM</p><BusinessValues value={item.previous_item.current_record}/></details>}
  {item.current_deal&&<p className="text-sm text-gray-600 break-all">現在の案件：<a className="crm-grid__link hover:underline" href={'/deals/'+item.deal_id}>{String(item.current_deal.title)}を開く</a></p>}
  {item.review_status==='conflict'&&<p role="alert" className="text-sm text-red-700">承認後に案件が更新されました。現在の案件と候補を比較し、必要なら内容を修正して再承認してください。</p>}
  <fieldset disabled={!editable} className="rounded-md border border-gray-200 p-4 grid grid-cols-1 sm:grid-cols-2 gap-4 [&_.input]:min-w-0 [&_.select]:min-w-0 disabled:bg-gray-50">
   <legend>候補の確認・編集</legend>
   <label className="form-field sm:col-span-2"><span className="form-label">概要</span><input className="input" maxLength={200} value={payload.title} onChange={e=>setPayload({...payload,title:e.target.value})}/></label>
   <label className="form-field sm:col-span-2"><span className="form-label">内容</span><textarea className="textarea" rows={3} value={payload.body} maxLength={4000} onChange={e=>setPayload({...payload,body:e.target.value})}/></label>
   {item.item_type==='task'?<label className="form-field"><span className="form-label">期限（記述がなければ未設定）</span><input type="date" className="input" value={payload.due_date??''} onChange={e=>setPayload({...payload,due_date:e.target.value||null})}/></label>:<label className="form-field"><span className="form-label">業務日{item.item_type==='activity'?'（反映前に確認）':''}</span><input className="input" type="date" value={payload.date??''} onChange={e=>setPayload({...payload,date:e.target.value||null})}/></label>}
   {item.item_type==='work_log'&&<div className="space-y-1"><label className="form-field"><span className="form-label">実績工数（分）</span><input type="number" min={1} max={1440} step={1} className="input" value={payload.duration_minutes??''} onChange={e=>setPayload({...payload,duration_minutes:e.target.value?Number(e.target.value):null})}/></label><p className="text-xs text-gray-500">予定時間は含めません。案件なしでも未配賦として承認できます。</p></div>}
   {item.item_type==='decision'&&<label className="form-field sm:col-span-2"><span className="form-label">理由</span><textarea className="textarea" rows={3} maxLength={4000} value={payload.rationale} onChange={e=>setPayload({...payload,rationale:e.target.value})}/></label>}
   <div className="sm:col-span-2 flex items-end gap-2"><label className="form-field min-w-0 flex-1"><span className="form-label">関連案件を検索</span><input className="input" value={query} onChange={e=>setQuery(e.target.value)}/></label><button type="button" className="btn btn--secondary shrink-0" onClick={search}>検索</button></div>
   <label className="form-field sm:col-span-2"><span className="form-label">関連案件</span><select className="select" value={deal} onChange={e=>{setDeal(e.target.value);setCompany(targets.find(t=>t.id===e.target.value)?.company_id??(item.item_type==='work_log'?company:''))}}>
    <option value="">{item.item_type==='work_log'?'案件未配賦':'案件を指定してください'}</option>{deal&&!targets.some(t=>t.id===deal)&&<option value={deal}>{String(item.current_deal?.title??item.proposed_payload.deal_name??'選択済み案件')}</option>}
    {targets.map(t=><option value={t.id} key={t.id}>{t.company_name} / {t.title}</option>)}</select></label>
   {item.item_type==='work_log'&&<><label className="form-field"><span className="form-label">顧客（案件を選ばない場合も指定可能）</span><select className="select" value={company} onChange={e=>{setCompany(e.target.value);setDeal('')}}><option value="">顧客未特定</option>{company&&!companies.some(c=>c.id===company)&&<option value={company}>{item.proposed_payload.company_name??'選択済み顧客'}</option>}{companies.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label><label className="form-field"><span className="form-label">作業者</span><select className="select" value={payload.worker_user_id??''} onChange={e=>setPayload({...payload,worker_user_id:e.target.value||null})}><option value="">未特定（推測しない）</option>{workers.map(w=><option key={w.id} value={w.id}>{w.name}</option>)}</select></label><p className="sm:col-span-2 text-xs text-gray-500">上の検索ボタンで顧客・作業者の候補を取得できます。</p></>}
   {['changed','ambiguous'].includes(item.comparison)&&<label className="sm:col-span-2 flex items-start gap-2 text-sm"><input className="mt-1 accent-[var(--color-primary)]" type="checkbox" checked={confirm} onChange={e=>setConfirm(e.target.checked)}/><span>既存レコードとは別の事実として新規作成することを確認しました（既存内容は上書きしません）</span></label>}
  </fieldset>
  {error&&<p role="alert" className="text-sm text-red-700">{error}</p>}
  {editable&&<ProposalActions busy={busy} onPrimary={()=>submit('approve')} onReject={()=>submit('reject')} label={item.review_status==='approved'?'編集内容で再承認':'内容を確認して承認'}/>}
  {canWrite&&canApply&&item.review_status==='approved'&&<button disabled={busy} className="btn btn--primary" onClick={()=>submit('apply')}>承認済みの内容をCRMへ反映</button>}
  {item.applied_id&&<a className="crm-grid__link inline-block text-sm hover:underline" href={item.item_type==='work_log'?'/work-logs#work-log-'+item.applied_id:item.item_type==='decision'?'/deals/'+item.deal_id:item.item_type==='task'?'/tasks/'+item.applied_id+'/edit':'/tasks'}>反映したレコードを開く</a>}
 </section>
}

function BusinessValues({value}:{value:unknown}){
 if(!value||typeof value!=='object')return <p>未登録</p>
 const labels:Record<string,string>={title:'概要',summary:'概要',content:'内容',body:'詳細',description:'詳細',rationale:'理由',date:'業務日',activity_date:'活動日',occurred_on:'決定日',due_date:'期限',duration_minutes:'実績工数（分）',status:'状態',priority:'優先度'}
 return <dl className="detail-list text-sm">{Object.entries(value).filter(([k,v])=>labels[k]&&v!==null&&v!=='').map(([k,v])=><div className="detail-list__row" key={k}><dt className="detail-list__label">{labels[k]}</dt><dd className="detail-list__value whitespace-pre-wrap">{String(v)}</dd></div>)}</dl>
}
