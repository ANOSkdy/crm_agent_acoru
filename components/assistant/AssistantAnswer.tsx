'use client'

import { useState } from 'react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { AgentMessage } from '@/lib/agent/types'
import { AssistantIcon } from './AssistantIcon'

export function AssistantAnswer({message}:{message:AgentMessage}) {
  const [copied,setCopied]=useState(false)
  const [copyError,setCopyError]=useState(false)
  const links=new Set(message.sources.map(source=>source.href))
  const markdown=message.content.replace(/\[(S\d+)\]/g,(token,id:string)=>{
    const index=message.sources.findIndex(source=>source.id===id)
    return index<0?token:`[${index+1}](${message.sources[index].href})`
  })
  async function copy() {
    try {await navigator.clipboard.writeText(message.content);setCopied(true);setCopyError(false)} catch {setCopyError(true)}
  }
  return <>
    <div className="ai-markdown"><Markdown remarkPlugins={[remarkGfm]} skipHtml
      allowedElements={['p','strong','em','del','h1','h2','h3','h4','ul','ol','li','blockquote','pre','code','table','thead','tbody','tr','th','td','a','hr','br']}
      urlTransform={url=>links.has(url)?url:''}
      components={{a:({href,children})=>href?<a href={href} target="_blank" rel="noopener noreferrer">{children}</a>:<span>{children}</span>,table:({children})=><div className="ai-table-scroll"><table>{children}</table></div>}}
    >{markdown}</Markdown></div>
    {message.sources.length>0 && <details className="ai-sources"><summary><AssistantIcon name="database"/>参照した記録 <span>{message.sources.length}</span><AssistantIcon name="chevron"/></summary><div className="ai-sources__list">{message.sources.map((source,index)=><a key={source.id} href={source.href} target="_blank" rel="noopener noreferrer"><span>{index+1}</span>{source.label}<span aria-hidden="true">↗</span></a>)}</div></details>}
    <div className="ai-answer-actions"><button type="button" className="ai-icon-button" onClick={copy} aria-label={copied?'コピーしました':'回答をコピー'} title={copied?'コピーしました':'回答をコピー'}><AssistantIcon name={copied?'check':'copy'}/></button>{copied && <span role="status">コピーしました</span>}{copyError && <span role="alert">コピーできませんでした</span>}</div>
  </>
}
