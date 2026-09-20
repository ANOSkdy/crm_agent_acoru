import 'server-only'
import { z } from 'zod'
import { AgentError } from './errors'

export function checkMutationRequest(req: Request) {
  if (!req.headers.get('content-type')?.includes('application/json')) throw new AgentError(415, 'JSON形式で送信してください')
  const origin = req.headers.get('origin')
  if (!origin || origin !== new URL(req.url).origin) throw new AgentError(403, '送信元を確認できません')
}
export async function readBody(req: Request) {
  if (Number(req.headers.get('content-length') || 0) > 40000) throw new AgentError(413, '入力が長すぎます')
  const reader = req.body?.getReader()
  if (!reader) throw new AgentError(400, '入力がありません')
  let size = 0
  const chunks: Uint8Array[] = []
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.length
    if (size > 40000) { await reader.cancel(); throw new AgentError(413, '入力が長すぎます') }
    chunks.push(value)
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown } catch { throw new AgentError(400, '入力形式が不正です') }
}
export function apiError(error: unknown) {
  if (error instanceof AgentError) return Response.json({ error: error.message }, { status: error.status })
  if (error instanceof z.ZodError) return Response.json({ error: '入力内容を確認してください', details: error.issues.map((i) => i.message).slice(0, 3) }, { status: 400 })
  const message = error instanceof Error ? error.message : ''
  if (message.includes('AGENT_CONFLICT')) return Response.json({ error: '提案後に案件が更新されました。最新の情報で更新案を作り直してください。' }, { status: 409 })
  if (message.includes('AGENT_FORBIDDEN')) return Response.json({ error: '更新権限がありません' }, { status: 403 })
  if (message.includes('AGENT_INVALID')) return Response.json({ error: '更新内容または対象が無効です' }, { status: 400 })
  // Database/provider errors can contain connection strings or CRM data.
  console.error('Agent request failed', { kind: error instanceof Error ? error.name : 'unknown' })
  return Response.json({ error: '処理に失敗しました。しばらくしてから再度お試しください。' }, { status: 500 })
}
