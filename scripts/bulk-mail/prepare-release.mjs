import { readFile, writeFile, mkdir, copyFile, readdir } from 'node:fs/promises'
import { resolve, relative, dirname, sep } from 'node:path'
import { createHash } from 'node:crypto'

const root = process.cwd()
const output = resolve(root, '.local-test', 'bulk-mail-release')
if (relative(root, output) !== ['.local-test', 'bulk-mail-release'].join(sep)) throw new Error('Invalid release directory')
await mkdir(output) // Never replace an earlier release snapshot.
const previous = JSON.parse(await readFile('.local-test/production-source-full-manifest.json', 'utf8'))
const files = new Set(previous.map(f => f.path).filter(p => p !== 'scripts/billing/run-approved-registration-resend.mjs'))
for (const path of ['app/mail.css', 'instrumentation.ts', 'app/login/LocalKeyForm.tsx', 'lib/actions/local-auth.ts', 'lib/auth/local-auth.ts', 'lib/auth/local-policy.ts', 'lib/auth/local-session.ts', 'scripts/db/migrations/012_bulk_mail.sql']) files.add(path)
async function collect(path) {
  for (const entry of await readdir(path, { withFileTypes: true })) {
    const next = path + '/' + entry.name
    if (entry.isDirectory()) await collect(next)
    else if (entry.isFile() && !next.endsWith('/verify-browser.mts')) files.add(next)
  }
}
for (const path of ['lib/bulk-mail', 'components/bulk-mail', 'app/api/bulk-mail', 'app/(crm)/bulk-mail', 'scripts/bulk-mail']) await collect(path)
const manifest = []
for (const file of [...files].sort()) {
  if (file.startsWith('.') && file !== '.vercelignore' && !file.startsWith('.claude/')) throw new Error('Unexpected hidden source file')
  const source = resolve(root, file), target = resolve(output, file)
  if (!source.startsWith(root + sep) || !target.startsWith(output + sep)) throw new Error('Source path outside workspace')
  const bytes = await readFile(source)
  await mkdir(dirname(target), { recursive: true }); await copyFile(source, target)
  manifest.push({ file, sha256: createHash('sha256').update(bytes).digest('hex') })
}
await mkdir(resolve(output, '.vercel'))
await copyFile('.vercel/project.json', resolve(output, '.vercel/project.json'))
const digest = createHash('sha256').update(JSON.stringify(manifest)).digest('hex')
await writeFile('.local-test/bulk-mail-release-manifest.json', JSON.stringify({ baseDeployment: 'dpl_DUoPdHWK5pw84Ks58EZi9cDEmxey', digest, files: manifest }, null, 2))
console.log(JSON.stringify({ directory: output, digest, files: manifest.length, baseDeployment: 'dpl_DUoPdHWK5pw84Ks58EZi9cDEmxey' }))
