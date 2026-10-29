import Link from 'next/link'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { rawUser,rawDatabase,rawFlags } from '@/lib/raw/server'
import { getWorkReport,workFiltersSchema } from '@/lib/raw/work-report'
export default async function WorkAnalysis({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){
 await rawUser()
 if(!Object.values(rawFlags()).some(Boolean))return <div className="p-4 sm:p-6 space-y-6"><h1 className="text-2xl font-bold text-gray-900">工数分析</h1><Card><CardBody><p className="text-sm text-gray-500">工数集計の公開は停止しています。</p></CardBody></Card></div>
 const params=await searchParams
 const parsed=workFiltersSchema.safeParse({from:params.from||null,to:params.to||null,company_id:params.company_id||null,deal_id:params.deal_id||null})
 if(!parsed.success||(parsed.data.from&&parsed.data.to&&parsed.data.from>parsed.data.to))return <div className="p-4 sm:p-6 space-y-6"><h1 className="text-2xl font-bold text-gray-900">工数分析</h1><Card><CardBody className="space-y-3"><p role="alert" className="text-sm text-red-600">検索条件を確認してください。開始日は終了日以前の日付を指定してください。</p><Link className="btn btn--secondary" href={'/work-logs'}>条件をリセット</Link></CardBody></Card></div>
 const report=await getWorkReport(rawDatabase,parsed.data)
 const metrics=[
  {label:'合計工数',value:report.total_minutes,unit:'分',description:`${(report.total_minutes/60).toFixed(2)}時間 · 承認・反映済みの実績`},
  {label:'案件に配賦済み',value:report.total_minutes-report.unallocated_minutes,unit:'分',description:'案件が指定されている実績工数'},
  {label:'案件未配賦',value:report.unallocated_minutes,unit:'分',description:'案件が指定されていない実績工数'},
  {label:'工数明細',value:report.total_records,unit:'件',description:'選択した条件に該当する記録数'},
 ]
 return <div className="p-4 sm:p-6 space-y-6">
  <header className="space-y-2"><h1 className="text-2xl font-bold text-gray-900">工数分析</h1><p className="text-sm text-gray-500">承認・反映した工数のみを集計します。業務日は日本時間です。</p></header>
  <Card><CardHeader><h2 className="font-semibold">集計期間</h2></CardHeader><CardBody>
   <form className="flex flex-wrap items-end gap-4"><input type="hidden" name="view" value="work"/>
    {parsed.data.company_id&&<input type="hidden" name="company_id" value={parsed.data.company_id}/>}
    {parsed.data.deal_id&&<input type="hidden" name="deal_id" value={parsed.data.deal_id}/>}
    <label className="form-field w-full sm:w-48"><span className="form-label">開始</span><input className="input min-w-0" type="date" name="from" defaultValue={parsed.data.from??''}/></label>
    <label className="form-field w-full sm:w-48"><span className="form-label">終了</span><input className="input min-w-0" type="date" name="to" defaultValue={parsed.data.to??''}/></label>
    <div className="flex flex-wrap gap-2"><button className="btn btn--primary" type="submit">集計</button><Link className="btn btn--secondary" href={'/work-logs'}>条件をリセット</Link></div>
   </form>
  </CardBody></Card>
  <section aria-label="工数サマリー" className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
   {metrics.map(metric=><Card key={metric.label}><CardBody><p className="text-xs text-gray-500">{metric.label}</p><p className="text-xl font-bold text-gray-900 tabular-nums">{metric.value.toLocaleString()}<span className="ml-1 text-sm font-normal text-gray-500">{metric.unit}</span></p><p className="text-xs text-gray-500 mt-1">{metric.description}</p></CardBody></Card>)}
  </section>
  <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
   <WorkBreakdown title="日別" label="業務日" rows={report.daily.map(r=>({id:r.worked_on,label:r.worked_on,minutes:r.minutes}))}/>
   <WorkBreakdown title="顧客別" label="顧客" rows={report.companies.map(r=>({id:r.company_id??'none',label:r.company_name??'顧客未特定',minutes:r.minutes}))}/>
   <WorkBreakdown title="案件別" label="案件" rows={report.deals.map(r=>({id:r.deal_id??'none',label:r.deal_title??'案件未配賦',minutes:r.minutes}))}/>
  </div>
  <Card className="min-w-0 overflow-hidden"><CardHeader className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-semibold">工数明細</h2><p className="text-xs text-gray-500">{report.total_records.toLocaleString()}件中、最新100件まで</p></CardHeader>
   <div className="overflow-x-auto" role="region" aria-label="工数明細一覧" tabIndex={0}>
    <table className="w-full min-w-[760px] text-sm"><thead><tr className="bg-gray-50 border-b border-gray-200">
     {['業務日','内容','顧客・案件','担当','工数（分）','出典'].map(label=><th key={label} scope="col" className={'px-6 py-3 text-xs font-medium text-gray-500 whitespace-nowrap '+(label==='工数（分）'?'text-right':'text-left')}>{label}</th>)}
    </tr></thead><tbody className="divide-y divide-gray-100">
     {report.records.length===0?<tr><td colSpan={6} className="px-6 py-10 text-center text-gray-500">この条件の実績工数はありません。期間を変更するか、業務ログの工数候補を承認・反映してください。</td></tr>:report.records.map(r=><tr key={r.id} id={'work-log-'+r.id} className="hover:bg-gray-50 target:bg-purple-50">
      <td className="px-6 py-3 text-gray-500 whitespace-nowrap">{r.worked_on}</td><td className="px-6 py-3 text-gray-900 max-w-xs break-words">{r.description}</td>
      <td className="px-6 py-3 max-w-xs break-words"><p className="text-gray-900">{r.company_name??'顧客未特定'}</p><p className="text-xs text-gray-500 mt-1">{r.deal_title??'案件未配賦'}</p></td>
      <td className="px-6 py-3 text-gray-600 whitespace-nowrap">{r.worker_name??'未特定'}</td><td className="px-6 py-3 text-right text-gray-900 tabular-nums">{r.duration_minutes.toLocaleString()}</td>
      <td className="px-6 py-3 whitespace-nowrap">{r.extraction_item_id?<Link className="crm-grid__link hover:underline" href={'/raw?item='+r.extraction_item_id}>原本・候補</Link>:<span className="text-gray-400">—</span>}</td>
     </tr>)}
    </tbody></table>
   </div>
  </Card>
 </div>
}

function WorkBreakdown({title,label,rows}:{title:string;label:string;rows:{id:string;label:string;minutes:number}[]}){
 return <Card className="min-w-0 overflow-hidden"><CardHeader><h2 className="font-semibold">{title}</h2></CardHeader>
  <table className="w-full text-sm"><thead><tr className="bg-gray-50"><th scope="col" className="px-6 py-2 text-left text-xs font-medium text-gray-500">{label}</th><th scope="col" className="px-6 py-2 text-right text-xs font-medium text-gray-500 whitespace-nowrap">工数（分）</th></tr></thead>
   <tbody className="divide-y divide-gray-100">{rows.length===0?<tr><td colSpan={2} className="px-6 py-8 text-center text-gray-500">該当する工数はありません</td></tr>:rows.map(row=><tr key={row.id} className="hover:bg-gray-50"><td className="px-6 py-3 text-gray-900 break-all">{row.label}</td><td className="px-6 py-3 text-right text-gray-700 tabular-nums whitespace-nowrap">{row.minutes.toLocaleString()}</td></tr>)}</tbody>
  </table>
 </Card>
}
