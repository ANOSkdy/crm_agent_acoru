'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { AssistantEvent, AssistantState, AssistantThread } from '@/lib/assistant/types'
import { ChangeProposalCard } from '@/components/agent/ChangeProposalCard'
import { AssistantAnswer } from './AssistantAnswer'
import { AssistantIcon, type IconName } from './AssistantIcon'

type History={threads:AssistantThread[];hasMore:boolean}
const suggestions:{icon:IconName;title:string;description:string;prompt:string}[]=[
  {icon:'check',title:'今日の優先事項',description:'対応すべき案件とタスクを整理',prompt:'CRM全体を確認し、今日優先して対応すべき案件・タスクを、期限と根拠を添えて整理してください。'},
  {icon:'chart',title:'案件の見通し',description:'パイプラインとリスクを見渡す',prompt:'進行中案件の件数・金額・ステージ別の状況を集計し、注意したい案件と次のアクションを教えてください。'},
  {icon:'briefcase',title:'次のアクション',description:'接点が空いている顧客を確認',prompt:'最近14日間、活動記録がない進行中案件を調べ、優先して状況を確認したい案件と確認事項を提案してください。'},
  {icon:'spark',title:'進め方を相談',description:'記録をもとに、次の一手を考える',prompt:'今ある案件を見渡して、営業活動をどう進めるとよいか相談したいです。まず現状と判断に必要な情報を整理してください。'},
]
async function jsonRequest(url:string,init?:RequestInit) {
  const response=await fetch(url,init)
  const data=await response.json()
  if(!response.ok) throw new Error(data.error||'読み込めませんでした。再度お試しください。')
  return data
}
export function AssistantWorkspace({userName,initialHistory,initialState,initialMessage}:{userName:string;initialHistory:History;initialState:AssistantState|null;initialMessage:string}) {
  const router=useRouter()
  const [state,setState]=useState(initialState)
  const [history,setHistory]=useState(initialHistory)
  const [query,setQuery]=useState('')
  const [historyLoading,setHistoryLoading]=useState(false)
  const [message,setMessage]=useState(initialMessage)
  const [sending,setSending]=useState(false)
  const [optimistic,setOptimistic]=useState<{id:string;content:string}|null>(null)
  const [progress,setProgress]=useState('')
  const [error,setError]=useState('')
  const [mobileOpen,setMobileOpen]=useState(false)
  const [sidebarCollapsed,setSidebarCollapsed]=useState(false)
  const [renaming,setRenaming]=useState(false)
  const [title,setTitle]=useState(initialState?.thread.title??'')
  const [loadingOlder,setLoadingOlder]=useState(false)
  const threadId=state?.thread.id
  const readOnly=Boolean(state?.thread.deal_id)
  const running=sending||Boolean(state?.runs.some(run=>run.status==='running'))
  const sendLock=useRef(false)
  const inputRef=useRef<HTMLTextAreaElement>(null)
  const scrollRef=useRef<HTMLDivElement>(null)
  const stickToBottom=useRef(true)
  const optimisticVisible=optimistic&&!state?.messages.some(item=>item.run_id===optimistic.id)
  const hasMessages=Boolean(state?.messages.length||optimistic)
  const refresh=useCallback(async(id:string)=>{
    const next:AssistantState=await jsonRequest(`/api/assistant/threads/${id}`)
    setState(next)
    return next
  },[])
  const refreshHistory=useCallback(async()=>{
    const next:History=await jsonRequest(`/api/assistant/threads?q=${encodeURIComponent(query)}`)
    setHistory(next)
  },[query])
  useEffect(()=>{
    const controller=new AbortController()
    const timer=setTimeout(()=>{
      setHistoryLoading(true)
      jsonRequest(`/api/assistant/threads?q=${encodeURIComponent(query)}`,{signal:controller.signal})
        .then(setHistory).catch(err=>{if(!controller.signal.aborted)setError(err.message)}).finally(()=>{if(!controller.signal.aborted)setHistoryLoading(false)})
    },250)
    return ()=>{clearTimeout(timer);controller.abort()}
  },[query])
  useEffect(()=>{
    if(!threadId||!running||sending) return
    let active=true
    const timer=setInterval(()=>{
      jsonRequest(`/api/assistant/threads/${threadId}`).then((next:AssistantState)=>{if(active)setState(next)}).catch(err=>{if(active)setError(err.message)})
    },3000)
    return ()=>{active=false;clearInterval(timer)}
  },[threadId,running,sending])
  useEffect(()=>{
    if(scrollRef.current) {
      if(!hasMessages) scrollRef.current.scrollTop=0
      else if(stickToBottom.current) scrollRef.current.scrollTop=scrollRef.current.scrollHeight
    }
  },[state?.messages.length,optimistic,running,progress,hasMessages])
  useEffect(()=>{
    if(inputRef.current) {inputRef.current.style.height='auto';inputRef.current.style.height=Math.min(180,inputRef.current.scrollHeight)+'px'}
  },[message])
  useEffect(()=>{
    function close(event:KeyboardEvent) {if(event.key==='Escape')setMobileOpen(false)}
    const media=window.matchMedia('(max-width: 760px)')
    function resize() {if(!media.matches)setMobileOpen(false)}
    window.addEventListener('keydown',close)
    media.addEventListener('change',resize)
    return ()=>{window.removeEventListener('keydown',close);media.removeEventListener('change',resize)}
  },[])
  async function send(input=message) {
    input=input.trim()
    if(!input||running||readOnly||sendLock.current) return
    sendLock.current=true;setSending(true);setError('');setProgress('相談内容を確認しています');stickToBottom.current=true
    const requestId=crypto.randomUUID()
    setOptimistic({id:requestId,content:input});setMessage('')
    let id=threadId
    let createdNew=false
    try {
      if(!id) {
        const {thread}:{thread:AssistantThread}=await jsonRequest('/api/assistant/threads',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({title:input.slice(0,60)})})
        id=thread.id
        setState({thread,messages:[],proposals:[],runs:[],hasOlder:false});setTitle(thread.title)
        setHistory(current=>({...current,threads:[thread,...current.threads]}))
        createdNew=true
      }
      const response=await fetch(`/api/assistant/threads/${id}/messages`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({requestId,message:input})})
      if(!response.ok) {const data=await response.json();throw new Error(data.error||'送信できませんでした')}
      // Navigate only after the run and user message are saved. The destination can resume from DB.
      if(createdNew) router.replace(`/assistant/${id}`)
      if(response.headers.get('content-type')?.includes('application/json')) setState(await response.json())
      else {
        const reader=response.body?.getReader()
        if(!reader) throw new Error('接続が切れました。再読み込みして結果を確認してください。')
        const decoder=new TextDecoder()
        let buffer='',complete=false
        while(true) {
          const {value,done}=await reader.read()
          buffer+=decoder.decode(value,{stream:!done})
          let newline:number
          while((newline=buffer.indexOf('\n'))>=0) {
            const line=buffer.slice(0,newline);buffer=buffer.slice(newline+1)
            if(!line.trim())continue
            const event:AssistantEvent=JSON.parse(line)
            if(event.type==='progress') setProgress(event.message)
            if(event.type==='complete') {setState(event.state);complete=true}
            if(event.type==='error') throw new Error(event.message)
          }
          if(done)break
        }
        if(!complete)throw new Error('接続が切れました。保存済みの結果を確認しています。')
      }
      setOptimistic(null)
      await refreshHistory()
    } catch(err) {
      setError(err instanceof Error?err.message:'送信できませんでした')
      if(id) {
        try {const next=await refresh(id);if(!next.messages.some(item=>item.run_id===requestId))setMessage(input);setOptimistic(null)} catch {/* Preserve the unsaved message on screen. */setMessage(input)}
      } else {setMessage(input);setOptimistic(null)}
    } finally {sendLock.current=false;setSending(false);inputRef.current?.focus()}
  }
  async function rename(event:React.FormEvent) {
    event.preventDefault()
    if(!threadId||!title.trim())return
    try {
      await jsonRequest(`/api/assistant/threads/${threadId}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({title:title.trim()})})
      setState(current=>current?{...current,thread:{...current.thread,title:title.trim()}}:current);setRenaming(false);await refreshHistory()
    } catch(err){setError(err instanceof Error?err.message:'名前を変更できませんでした')}
  }
  async function older() {
    if(!threadId||!state?.messages[0]||loadingOlder)return
    setLoadingOlder(true);stickToBottom.current=false
    const height=scrollRef.current?.scrollHeight??0
    try {
      const previous:AssistantState=await jsonRequest(`/api/assistant/threads/${threadId}?before=${state.messages[0].id}`)
      setState(current=>current?{...current,messages:[...previous.messages,...current.messages],proposals:[...new Map([...previous.proposals,...current.proposals].map(proposal=>[proposal.id,proposal])).values()],hasOlder:previous.hasOlder}:current)
      requestAnimationFrame(()=>{if(scrollRef.current)scrollRef.current.scrollTop+=scrollRef.current.scrollHeight-height})
    } catch(err){setError(err instanceof Error?err.message:'履歴を読み込めませんでした')}
    finally{setLoadingOlder(false)}
  }
  const composer=<div className="ai-composer-wrap">
    {error&&<div className="ai-error" role="alert"><span>{error}</span><button className="ai-icon-button" onClick={()=>setError('')} aria-label="エラーを閉じる"><AssistantIcon name="close"/></button></div>}
    {readOnly?<div className="ai-legacy-note">以前の案件会話です。この履歴は社内で共有されています。<Link href={`/assistant?deal=${state!.thread.deal_id}`}>新しいチャットで相談する <span aria-hidden="true">↗</span></Link></div>:
      <form className="ai-composer" onSubmit={event=>{event.preventDefault();void send()}}>
        <label className="ai-sr-only" htmlFor="assistant-message">AIへの相談内容</label>
        <textarea ref={inputRef} id="assistant-message" value={message} onChange={event=>setMessage(event.target.value)} rows={1} maxLength={6000} placeholder="顧客や案件について、何でも相談してください" disabled={running}
          onKeyDown={event=>{if(event.key==='Enter'&&!event.shiftKey&&!event.nativeEvent.isComposing&&event.keyCode!==229){event.preventDefault();void send()}}}/>
        <div className="ai-composer__bottom"><span className="ai-scope"><AssistantIcon name="database"/>CRM全体を参照</span><button className="ai-send" type="submit" disabled={running||!message.trim()} aria-label={running?'回答を作成中':'送信'}>{running?<span className="ai-loader"/>:<AssistantIcon name="arrow"/>}</button></div>
      </form>}
    <p className="ai-composer-note">DeepSeek · データの変更は確認後に反映します</p>
  </div>
  return <div className={`ai-shell${sidebarCollapsed?' ai-shell--collapsed':''}`}>
    {mobileOpen&&<button className="ai-sidebar-backdrop" aria-label="会話履歴を閉じる" onClick={()=>setMobileOpen(false)}/>}
    <aside className={`ai-sidebar${mobileOpen?' ai-sidebar--open':''}`} aria-label="AIの会話履歴">
      <div className="ai-sidebar__brand"><Link href="/assistant" className="ai-wordmark"><span className="ai-logo"><AssistantIcon name="spark"/></span>Acoru <span>AI</span></Link><button className="ai-icon-button ai-mobile-close" aria-label="会話履歴を閉じる" onClick={()=>setMobileOpen(false)}><AssistantIcon name="close"/></button></div>
      <Link href="/assistant" className="ai-new-chat"><AssistantIcon name="new"/>新しいチャット<span>↗</span></Link>
      <div className="ai-history-search"><AssistantIcon name="search"/><label className="ai-sr-only" htmlFor="history-search">会話を検索</label><input id="history-search" value={query} maxLength={160} onChange={event=>setQuery(event.target.value)} placeholder="会話を検索"/></div>
      <div className="ai-history-heading">チャット履歴{historyLoading&&<span aria-label="検索中" className="ai-small-loader"/>}</div>
      <nav className="ai-history" aria-label="保存したチャット">{history.threads.map(thread=><Link key={thread.id} className={`ai-history-item${thread.id===threadId?' ai-history-item--active':''}`} href={`/assistant/${thread.id}`} title={thread.title} aria-current={thread.id===threadId?'page':undefined}><span>{thread.title}</span>{thread.deal_id&&<small>旧・共有</small>}</Link>)}
        {!history.threads.length&&<p className="ai-history-empty">{query?'一致する会話がありません':'ここに会話が保存されます'}</p>}
        {history.hasMore&&<button className="ai-text-button" disabled={historyLoading} onClick={async()=>{setHistoryLoading(true);try{const next:History=await jsonRequest(`/api/assistant/threads?q=${encodeURIComponent(query)}&offset=${history.threads.length}`);setHistory(current=>({threads:[...current.threads,...next.threads],hasMore:next.hasMore}))}catch{setError('会話履歴を読み込めませんでした')}finally{setHistoryLoading(false)}}}>もっと見る</button>}
      </nav>
      <div className="ai-sidebar__footer"><Link href="/dashboard" className="ai-back-link"><AssistantIcon name="back"/>CRMに戻る</Link><div className="ai-user"><span className="ai-avatar">{userName.slice(0,1)}</span><div><strong>{userName}</strong><span>Acoru ワークスペース</span></div></div></div>
    </aside>
    <main className="ai-main" inert={mobileOpen}>
      <header className="ai-topbar"><button className="ai-icon-button" aria-label="会話履歴の表示を切り替える" onClick={()=>{if(window.matchMedia('(max-width: 760px)').matches)setMobileOpen(value=>!value);else setSidebarCollapsed(value=>!value)}}><AssistantIcon name="panel"/></button>
        <div className="ai-topbar__name">Acoru AI<span>CRMアシスタント</span></div>
        <div className="ai-topbar__spacer"/>
        {state&&!readOnly&&<button className="ai-icon-button" aria-label="会話の名前を変更" title="会話の名前を変更" onClick={()=>{setTitle(state.thread.title);setRenaming(value=>!value)}}><AssistantIcon name="edit"/></button>}
        <Link href="/assistant" className="ai-icon-button" aria-label="新しいチャット" title="新しいチャット"><AssistantIcon name="new"/></Link>
      </header>
      {renaming&&<form className="ai-rename" onSubmit={rename}><label htmlFor="chat-title">会話の名前</label><input id="chat-title" value={title} maxLength={80} onChange={event=>setTitle(event.target.value)} autoFocus/><button type="submit">保存</button><button type="button" onClick={()=>setRenaming(false)}>キャンセル</button></form>}
      <div className={`ai-scroll${!hasMessages?' ai-scroll--welcome':''}`} ref={scrollRef} onScroll={event=>{const element=event.currentTarget;stickToBottom.current=element.scrollHeight-element.scrollTop-element.clientHeight<100}}>
        {!hasMessages?<div className="ai-welcome"><span className="ai-welcome__mark"><AssistantIcon name="spark"/></span><p className="ai-welcome__eyebrow">ACORU AI</p><h1>今日は、何を進めましょう？</h1><p className="ai-welcome__description">顧客・案件・活動をつなげて、次の一手を一緒に。</p>{composer}<div className="ai-suggestions">{suggestions.map(suggestion=><button key={suggestion.title} type="button" onClick={()=>{setMessage(suggestion.prompt);inputRef.current?.focus()}}><AssistantIcon name={suggestion.icon}/><strong>{suggestion.title}</strong><span>{suggestion.description}</span><span className="ai-suggestion-arrow" aria-hidden="true">↗</span></button>)}</div></div>:
          <div className="ai-conversation" aria-label="会話">
            {state?.hasOlder&&<button className="ai-older" disabled={loadingOlder} onClick={older}>{loadingOlder?'読み込み中…':'以前のメッセージを表示'}</button>}
            {state?.messages.map(item=><article key={item.id} className={`ai-message ai-message--${item.role}`} aria-label={item.role==='user'?'あなたのメッセージ':'AIの回答'}>
              {item.role==='user'?<div className="ai-user-bubble">{item.content}</div>:<><div className="ai-assistant-label"><AssistantIcon name="spark"/>Acoru AI</div><AssistantAnswer message={item}/>{state.proposals.filter(proposal=>proposal.run_id===item.run_id).map(proposal=><details className="ai-change" key={`${proposal.id}-${proposal.status}`}><summary><AssistantIcon name="edit"/><div><strong>{proposal.status==='applied'?'反映済みの更新':proposal.status==='rejected'?'却下した更新案':'更新案を確認'}</strong><span>{proposal.deal_title} · {proposal.operations.length}件の変更</span></div><AssistantIcon name="chevron"/></summary><ChangeProposalCard proposal={proposal} canEdit={proposal.canEdit} onChanged={async()=>{if(threadId)await refresh(threadId)}}/></details>)}</>}
            </article>)}
            {optimisticVisible&&<article className="ai-message ai-message--user"><div className="ai-user-bubble">{optimistic.content}</div></article>}
            {running&&<div className="ai-thinking" role="status"><AssistantIcon name="spark"/><span>{sending?progress:state?.runs.find(run=>run.status==='running')?.progress||'CRMの情報を確認しています'}</span><span className="ai-thinking-dots"><i/><i/><i/></span></div>}
            {!running&&state?.runs[0]?.status==='failed'&&<div className="ai-run-error" role="status">{state.runs[0].error_message}<button type="button" className="ai-text-button" onClick={()=>{const last=[...state.messages].reverse().find(item=>item.role==='user');if(last){setMessage(last.content);inputRef.current?.focus()}}}>内容を入力欄に戻す</button></div>}
          </div>}
      </div>
      {hasMessages&&<div className="ai-bottom-composer">{composer}</div>}
    </main>
  </div>
}
