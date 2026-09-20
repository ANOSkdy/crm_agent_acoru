import type { Source } from '@/lib/agent/types'

export function resolveEvidence(answer: string, ids: string[], available: Map<string, Source>) {
  const unique=[...new Set(ids)]
  if(unique.some(id=>!available.has(id))) throw new Error('取得していない参照元が含まれています')
  const cited=[...answer.matchAll(/\[(S\d+)\]/g)].map(match=>match[1])
  if(cited.some(id=>!unique.includes(id))) throw new Error('本文の出典と参照元が一致しません')
  if(available.size && !unique.length) throw new Error('回答の根拠にした参照元を指定してください')
  return unique.map(id=>available.get(id)!)
}
