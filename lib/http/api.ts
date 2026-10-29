import 'server-only'
import { z } from 'zod'
import { AppError } from './errors'

export function checkMutationRequest(req: Request) {
  if (!req.headers.get('content-type')?.includes('application/json')) throw new AppError(415, 'JSON形式で送信してください')
  const target = new URL(req.url)
  const origin = req.headers.get('origin')
  const host = req.headers.get('host') ?? target.host
  // Next may reconstruct a loopback URL while keeping the browser's actual Host.
  // Do not use x-forwarded-host as a CSRF allowlist.
  if (!origin || origin !== `${target.protocol}//${host}` || req.headers.get('sec-fetch-site') === 'cross-site') throw new AppError(403, '送信元を確認できません')
}
export async function readBody(req: Request) {
  if (Number(req.headers.get('content-length') || 0) > 40000) throw new AppError(413, '入力が長すぎます')
  const reader = req.body?.getReader()
  if (!reader) throw new AppError(400, '入力がありません')
  let size = 0
  const chunks: Uint8Array[] = []
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.length
    if (size > 40000) { await reader.cancel(); throw new AppError(413, '入力が長すぎます') }
    chunks.push(value)
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown } catch { throw new AppError(400, '入力形式が不正です') }
}
export function apiError(error: unknown) {
  if (error instanceof AppError) return Response.json({ error: error.message }, { status: error.status })
  if (error instanceof z.ZodError) return Response.json({ error: '入力内容を確認してください', details: error.issues.map((i) => i.message).slice(0, 3) }, { status: 400 })
  // Database/provider errors can contain connection strings or CRM data.
  console.error('Request failed', { kind: error instanceof Error ? error.name : 'unknown' })
  return Response.json({ error: '処理に失敗しました。しばらくしてから再度お試しください。' }, { status: 500 })
}
