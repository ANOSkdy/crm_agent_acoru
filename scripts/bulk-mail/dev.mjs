import { spawn } from 'node:child_process'
import { resolve } from 'node:path'

if (process.env.VERCEL || process.env.VERCEL_ENV) throw new Error('Local bulk mail preview cannot run in a deployed environment')
const child = spawn(process.execPath, [resolve('node_modules/next/dist/bin/next'), 'dev', '--hostname', '127.0.0.1', ...process.argv.slice(2)], {
  windowsHide: true, stdio: 'inherit',
  env: { ...process.env, BULK_MAIL_LOCAL_ENABLED: 'true', BULK_MAIL_LOCAL_DIR: resolve('.local-test', 'bulk-mail'), VERCEL: '', VERCEL_ENV: '' },
})
child.on('exit', code => { process.exitCode = code ?? 1 })
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal))
