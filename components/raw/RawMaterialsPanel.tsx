'use client'
import { useCallback,useEffect,useState } from 'react'
import { rawBatches } from '@/lib/raw/batch'
import { RAW_MAX_BYTES,RAW_MAX_FILES } from '@/lib/raw/constants'
import type { RawDocument,RawRevision } from '@/lib/raw/domain'
import { rawRequest } from '@/components/raw/request'
import { ExtractionPanel } from '@/components/raw/ExtractionPanel'
import { SyncCredentials } from '@/components/raw/SyncCredentials'
import { rawStatusLabels } from '@/components/raw/labels'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'

type Flags={ingest:boolean;extraction:boolean;apply:boolean;sync:boolean}
export function RawMaterialsPanel({flags,canWrite}:{flags:Flags;canWrite:boolean}) {
 const [documents,setDocuments]=useState<RawDocument[]>([]),[page,setPage]=useState(0),[hasMore,setHasMore]=useState(false)
 const [text,setText]=useState(''),[key,setKey]=useState(()=>crypto.randomUUID()),[allowed,setAllowed]=useState(false)
 const [observed,setObserved]=useState('')
 const [editing,setEditing]=useState<RawDocument|null>(null)
 const [selected,setSelected]=useState<RawDocument|null>(null),[revisions,setRevisions]=useState<RawRevision[]>([]),[revision,setRevision]=useState<RawRevision|null>(null)
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('')
 const refresh=useCallback(async()=>{const data=await rawRequest('/api/raw/documents?page='+page);setDocuments(data.documents);setHasMore(data.hasMore)},[page])
 useEffect(()=>{let active=true;rawRequest('/api/raw/documents?page='+page).then(data=>{if(active){setDocuments(data.documents);setHasMore(data.hasMore)}}).catch(()=>{if(active)setError('保存した資料を取得できませんでした')});return()=>{active=false}},[page])
 useEffect(()=>{let active=true;const params=new URLSearchParams(window.location.search);async function load(){let revisionId=params.get('revision');const item=params.get('item');if(item){const info=await rawRequest('/api/raw/items/'+item);revisionId=info.revision_id;window.history.replaceState(null,'',window.location.pathname+'?view=materials&revision='+revisionId+'&run='+info.run_id+'#item-'+item)}if(!revisionId)return;const revisionData=await rawRequest('/api/raw/revisions/'+revisionId);const data=await rawRequest('/api/raw/documents/'+revisionData.document_id);if(active){setSelected(data.document);setRevisions(data.revisions);setRevision(revisionData)}}void load().catch(()=>{if(active)setError('出典を取得できませんでした')});return()=>{active=false}},[])
 async function open(doc:RawDocument){setError('');try{const data=await rawRequest('/api/raw/documents/'+doc.id);setSelected(doc);setRevisions(data.revisions);if(data.revisions[0])setRevision(await rawRequest('/api/raw/revisions/'+data.revisions[0].id))}catch(e){setError(e instanceof Error?e.message:'取得できませんでした')}}
 async function save(){setBusy(true);setError('');try{
  const data=await rawRequest('/api/raw/documents',{documents:[{source_type:editing?.source_type??'paste',source_key:editing?.source_key??key,document_id:editing?.id??null,original_filename:editing?.original_filename??null,content:text,observed_at:observed||null,ai_processing_allowed:allowed}]})
  const result=data.results[0];if(result.status==='rejected')throw new Error(result.error)
  setNotice(result.status==='unchanged'?'同じ本文は保存済みです':'原本を保存しました。AI処理はまだ実行していません')
  setText('');setEditing(null);setKey(crypto.randomUUID());await refresh()
  if(selected && selected.id===result.document_id)await open(selected)
 }catch(e){setError(e instanceof Error?e.message:'保存できませんでした')}finally{setBusy(false)}}
 async function upload(list:FileList|File[]){setError('');setNotice('');if(list.length>RAW_MAX_FILES){setError('一度に20ファイルまでです');return}
  setBusy(true);const docs:unknown[]=[];const failures:string[]=[]
  try{for(const file of Array.from(list)){try{
   if(!/\.(md|txt)$/i.test(file.name)||file.size===0||file.size>RAW_MAX_BYTES)throw new Error('MD/TXT・256 KiB以下のファイルを選択してください')
   const content=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(await file.arrayBuffer())
   docs.push({source_type:'upload',source_key:'upload:'+file.name,original_filename:file.name,content,observed_at:observed||null,ai_processing_allowed:allowed})
  }catch{failures.push(file.name+'：形式・サイズ・UTF-8を確認してください')}}
  if(docs.length){let saved=0,offset=0;for(const batch of rawBatches(docs)){const data=await rawRequest('/api/raw/documents',{documents:batch});saved+=data.results.filter((r:{status:string})=>r.status!=='rejected').length;for(const r of data.results)if(r.status==='rejected')failures.push('ファイル'+(offset+r.index+1)+'：'+r.error);offset+=batch.length}setNotice(saved+'件を保存／確認しました');await refresh()}
  setError(failures.join(' / '))
  }catch(e){setError(e instanceof Error?e.message:'保存できませんでした')}finally{setBusy(false)}
 }
 return <div className="p-4 sm:p-6 space-y-6 [&_button:disabled]:opacity-50 [&_button:disabled]:cursor-not-allowed">
  <header className="space-y-2"><h1 className="text-2xl font-bold text-gray-900">資料・原本</h1><p className="text-sm text-gray-500">原文を先に保存します。顧客・案件の指定は不要です。AI候補を確認するまでCRMには反映しません。</p></header>
  {canWrite&&flags.ingest?<section onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();if(!busy)void upload(e.dataTransfer.files)}}>
   <Card><CardHeader><h2 className="font-semibold">{editing?'新しい版を保存':'自由文・Markdown・TXT'}</h2></CardHeader><CardBody className="space-y-4">
    <label className="form-field"><span className="form-label">本文</span><textarea className="textarea" rows={6} placeholder="打ち合わせメモや日報を、そのまま貼り付けてください。" value={text} onChange={e=>setText(e.target.value)}/></label>
    <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,18rem)_minmax(0,1fr)] gap-4 items-end">
     <label className="form-field"><span className="form-label">原文の基準日（任意・不明なら空欄）</span><input className="input min-w-0" type="date" value={observed} onChange={e=>setObserved(e.target.value)}/></label>
     <div className="space-y-1"><label className="flex items-start gap-2 text-sm"><input className="mt-1 accent-[var(--color-primary)]" type="checkbox" checked={allowed} onChange={e=>setAllowed(e.target.checked)}/><span>この版を外部AIで処理してよい</span></label><p className="text-xs text-gray-500">AI処理を開始すると本文をDeepSeekへ送信します。</p></div>
    </div>
    <div className="flex flex-wrap gap-2"><button className="btn btn--primary" disabled={busy||!text.trim()} onClick={save}>原本を保存</button>{editing&&<button className="btn btn--secondary" onClick={()=>{setEditing(null);setText('');setKey(crypto.randomUUID())}}>新規入力に戻る</button>}</div>
    <div className="border-t border-gray-200 pt-4 space-y-2"><label className="form-field"><span className="form-label">ファイルを選択（ここにドロップも可能）</span><input className="block w-full min-w-0 text-sm text-gray-600 file:mr-3 file:rounded file:border file:border-gray-300 file:bg-white file:px-3 file:py-2 file:text-sm file:text-gray-700 file:cursor-pointer" type="file" accept=".md,.txt" multiple disabled={busy} onChange={e=>{if(e.target.files)void upload(e.target.files);e.target.value=''}}/></label><p className="text-xs text-gray-500">UTF-8、各256 KiB以下、一度に20件まで。同名のアップロードは同じ文書の版として扱います。</p></div>
   </CardBody></Card>
  </section>:<Card><CardBody><p className="text-sm text-gray-500">原本の登録は停止中、または閲覧権限のみです。</p></CardBody></Card>}
  {error&&<p role="alert" className="text-sm text-red-700">{error}</p>}{notice&&<p role="status" className="rounded-md border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">{notice}</p>}
  <Card className="min-w-0 overflow-hidden"><CardHeader><h2 className="font-semibold">保存した原本</h2></CardHeader>
   {documents.length===0?<CardBody><p className="py-6 text-center text-sm text-gray-500">原本はまだありません。本文の貼り付け、またはファイルのアップロードで保存できます。</p></CardBody>:<ul className="divide-y divide-gray-100">{documents.map(doc=><li className={'px-6 py-4 flex flex-wrap items-center justify-between gap-3 '+(selected?.id===doc.id?'bg-[var(--color-primary-soft)]':'hover:bg-gray-50')} key={doc.id}>
    <div className="min-w-0 flex-1"><button className="crm-grid__link text-sm font-medium text-left break-all hover:underline" aria-pressed={selected?.id===doc.id} onClick={()=>open(doc)}>{doc.relative_path??doc.original_filename??'貼り付けた業務ログ'}</button><p className="text-xs text-gray-500 mt-1">第{doc.revision_no}版 · 確認待ち{doc.pending_count??0}件</p></div>
    <Badge variant={doc.status==='succeeded'?'success':doc.status==='failed'?'danger':'gray'}>{rawStatusLabels[doc.status??'']??'未抽出'}</Badge>
   </li>)}</ul>}
   <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-200 px-6 py-3"><span className="text-xs text-gray-500">{page+1}ページ</span><div className="flex gap-2"><button className="btn btn--secondary btn--sm" disabled={page===0} onClick={()=>setPage(page-1)}>前へ</button><button className="btn btn--secondary btn--sm" disabled={!hasMore} onClick={()=>setPage(page+1)}>次へ</button></div></div>
  </Card>
  {selected&&<Card className="min-w-0"><CardHeader><h2 className="font-semibold">版の履歴と原文</h2><p className="mt-1 text-xs text-gray-500 break-all">{selected.relative_path??selected.original_filename??'貼り付けた業務ログ'}</p></CardHeader><CardBody className="space-y-4">
   <label className="form-field max-w-xs"><span className="form-label">保存版</span><select className="select" value={revision?.id??''} onChange={e=>rawRequest('/api/raw/revisions/'+e.target.value).then(setRevision).catch(()=>setError('本文を取得できませんでした'))}>{revisions.map(r=><option value={r.id} key={r.id}>第{r.revision_no}版</option>)}</select></label>
   {revision&&<><pre className="whitespace-pre-wrap break-all max-h-96 overflow-auto rounded-md border border-gray-200 bg-gray-50 p-4 text-sm leading-relaxed text-gray-700">{revision.content}</pre>
    <div className="flex flex-wrap items-center gap-2"><Badge variant={revision.ai_processing_allowed?'success':'gray'}>外部AI処理：{revision.ai_processing_allowed?'許可':'不許可'}</Badge>
     {canWrite&&<button className="btn btn--secondary btn--sm" onClick={async()=>{try{await rawRequest('/api/raw/revisions/'+revision.id,{allowed:!revision.ai_processing_allowed},'PATCH');setRevision({...revision,ai_processing_allowed:!revision.ai_processing_allowed})}catch(e){setError(e instanceof Error?e.message:'変更できませんでした')}}}>AI処理の許可を切り替える</button>}
     {canWrite&&flags.ingest&&selected.source_type!=='local_sync'&&<button className="btn btn--secondary btn--sm" onClick={()=>{setEditing(selected);setText(revision.content??'');setAllowed(revision.ai_processing_allowed);setObserved(revision.observed_at??'')}}>本文を編集して新しい版を作る</button>}
    </div>
    <ExtractionPanel key={revision.id} revisionId={revision.id} allowed={revision.ai_processing_allowed} canWrite={canWrite} flags={flags}/>
   </>}
  </CardBody></Card>}
  {canWrite&&flags.sync&&<SyncCredentials/>}
 </div>
}
