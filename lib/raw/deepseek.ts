import 'server-only'
import { AppError } from '@/lib/http/errors'

export interface ToolCall { id: string; type: 'function'; function: { name: string; arguments: string } }
export interface ChatMessage { role: 'system' | 'user' | 'assistant' | 'tool'; content: string | null; tool_calls?: ToolCall[]; tool_call_id?: string }
export interface ChatTool { type: 'function'; function: { name: string; description: string; parameters: Record<string, unknown> } }
export interface ChatResult { choices: { finish_reason: string; message: ChatMessage }[]; usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } }

export function deepseekModel() { return process.env.DEEPSEEK_MODEL || 'deepseek-flash' }
export async function deepseekChat(messages: ChatMessage[], tools?: ChatTool[], signal?: AbortSignal): Promise<ChatResult> {
  const key = process.env.DEEPSEEK_API_KEY
  if (!key) throw new AppError(503, 'AI接続が設定されていません。管理者にご連絡ください。')
  const base = new URL(process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com')
  if (base.protocol !== 'https:' || base.hostname !== 'api.deepseek.com') throw new AppError(503, 'AI接続先の設定を確認してください')
  let response: Response
  try {
    response = await fetch(`${base.toString().replace(/\/$/, '')}/chat/completions`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({ model: deepseekModel(), messages, tools, tool_choice: tools?.length ? 'required' : undefined, thinking: { type: 'disabled' }, temperature: 0.3, max_tokens: 4096, stream: false }),
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(60000)]) : AbortSignal.timeout(60000),
    })
  } catch { throw new AppError(504, 'AIの応答を取得できませんでした。時間をおいて再送してください。') }
  if (!response.ok) throw new AppError(response.status === 429 ? 429 : 502, response.status === 429 ? 'AIが混み合っています。時間をおいて再送してください。' : 'AI接続に失敗しました。管理者に接続設定をご確認ください。')
  const result = await response.json() as ChatResult
  if (!result.choices?.[0]?.message || result.choices[0].finish_reason === 'length') throw new AppError(502, 'AIの回答を完成できませんでした。内容を短くして再送してください。')
  return result
}
