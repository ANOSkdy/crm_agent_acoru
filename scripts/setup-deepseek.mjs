import { readFileSync, writeFileSync } from 'node:fs'
import { parse } from 'dotenv'

// Import only the selected provider's settings; never print secret values.
const source = process.argv[2]
if (!source) throw new Error('Usage: node scripts/setup-deepseek.mjs <credential-file>')
const values = parse(readFileSync(source))
if (!values.DEEPSEEK_API_KEY) throw new Error('DEEPSEEK_API_KEY was not found')
const base = new URL(values.DEEPSEEK_BASE_URL || 'https://api.deepseek.com')
if (base.protocol !== 'https:' || base.hostname !== 'api.deepseek.com') throw new Error('Unexpected DeepSeek endpoint')
const settings = {
  DEEPSEEK_API_KEY: values.DEEPSEEK_API_KEY,
  DEEPSEEK_BASE_URL: base.toString().replace(/\/$/, ''),
  DEEPSEEK_MODEL: values.DEEPSEEK_FAST_MODEL || 'deepseek-flash',
}
let env = readFileSync('.env.local', 'utf8')
for (const [key, value] of Object.entries(settings)) {
  env = env.replace(new RegExp(`^${key}=.*(?:\\r?\\n|$)`, 'gm'), '')
  env = `${env.trimEnd()}\n${key}=${JSON.stringify(value)}\n`
}
writeFileSync('.env.local', env, 'utf8')
console.log('Configured .env.local:', Object.keys(settings).join(', '))
