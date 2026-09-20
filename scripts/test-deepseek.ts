import { config } from 'dotenv'
import { z } from 'zod'
import { proposalSchema } from '../lib/agent/schema'

config({ path: '.env.local', quiet: true })
async function main() {
  if (!process.env.DEEPSEEK_API_KEY) throw new Error('DeepSeek key missing')
  const response = await fetch(`${process.env.DEEPSEEK_BASE_URL}/chat/completions`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}` },
    body: JSON.stringify({ model: process.env.DEEPSEEK_MODEL, thinking: { type: 'disabled' }, max_tokens: 300,
      messages: [{ role: 'user', content: '接続テストです。OKとのみ回答してください。' }],
      tools: [{ type: 'function', function: { name: 'propose_deal_changes', description: '更新案', parameters: z.toJSONSchema(proposalSchema) } }],
    }), signal: AbortSignal.timeout(60000),
  })
  if (!response.ok) throw new Error(`DeepSeek HTTP ${response.status}`)
  const result = await response.json()
  console.log(JSON.stringify({ status: response.status, model: result.model, answerReceived: Boolean(result.choices?.[0]?.message?.content), toolSchemaAccepted: true }))
}
main().catch((error) => { console.error(error instanceof Error ? error.message : 'DeepSeek test failed'); process.exitCode = 1 })
