import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { createBusinessDocumentPdf } from '../../lib/billing/pdf'
import {
  ACORU_TEMPLATE,
  templateInputSchema,
  templateDocument,
} from '../../lib/billing/template'
import { issuerSchema } from '../../lib/billing/domain'

const destination = path.resolve(
  `../output/templates/Acoru-template-v${ACORU_TEMPLATE.version}`,
)
const files = [
  ['lib/billing/pdf.ts', 'src/pdf.ts'],
  ['lib/billing/domain.ts', 'src/domain.ts'],
  ['lib/billing/template.ts', 'src/template.ts'],
  ...[
    'README.md',
    'DESIGN.md',
    'CHANGELOG.md',
    'package.json',
    'package-lock.json',
  ].map((p) => [`templates/acoru-v1/${p}`, p]),
  ['templates/acoru-v1/scripts/render.mts.txt', 'scripts/render.mts'],
  ...[
    'assets/brand/acoru-logo.png',
    'assets/fonts/NotoSansJP-Regular.ttf',
    'assets/fonts/OFL.txt',
    'assets/fonts/README.md',
  ].map((p) => [p, p]),
]
for (const [source, target] of files) {
  const dest = path.join(destination, target)
  await mkdir(path.dirname(dest), { recursive: true })
  await copyFile(source, dest)
}
const issuerIndex = process.argv.indexOf('--issuer')
const issuer = issuerSchema.parse(
  issuerIndex >= 0
    ? JSON.parse(await readFile(process.argv[issuerIndex + 1], 'utf8'))
    : {
        name: 'Acoru合同会社',
        address: '住所を設定してください',
        tel: '電話番号を設定してください',
        bank: '振込先を設定してください',
        registration: 'T0000000000000',
        from: 'support@acoru.jp',
      },
)
await mkdir(path.join(destination, 'examples'), { recursive: true })
const example = {
  name: 'サンプル株式会社',
  honorific: '御中',
  subject: 'システム保守・Webサイト運用費',
  issueDate: '2026-09-30',
  sample: true,
  lines: [
    {
      name: 'システム保守・運用支援',
      quantity: 1,
      unit: '月',
      unitPrice: 50000,
    },
    { name: 'Webサイト更新', quantity: 1, unit: '式', unitPrice: 20000 },
  ],
}
for (const data of [
  { ...example, kind: 'invoice', dueDate: '2026-10-31' },
  {
    ...example,
    kind: 'quotation',
    validUntil: '2026-10-30',
    delivery: 'ご発注から約2週間（見本）',
    conditions: '作業範囲：システム保守およびWebサイト更新（見本）',
  },
]) {
  const input = templateInputSchema.parse(data)
  for (const [suffix, contents] of [
    ['json', JSON.stringify({ ...input, issuer }, null, 2) + '\n'],
    [
      'pdf',
      await createBusinessDocumentPdf(templateDocument(input, issuer), input),
    ],
  ] as const) {
    const file = `examples/${input.kind}.${suffix}`
    await writeFile(path.join(destination, file), contents)
    files.push(['', file])
  }
}
const entries = await Promise.all(
  files.map(async ([, file]) => ({
    file,
    sha256: createHash('sha256')
      .update(await readFile(path.join(destination, file)))
      .digest('hex'),
  })),
)
let commit = 'unavailable'
try {
  commit = execFileSync('git', ['rev-parse', 'HEAD'], {
    encoding: 'utf8',
  }).trim()
} catch {
  /* Files remain individually verifiable. */
}
await writeFile(
  path.join(destination, 'MANIFEST.json'),
  JSON.stringify(
    {
      template: ACORU_TEMPLATE.name,
      version: ACORU_TEMPLATE.version,
      sourceCommit: commit,
      files: entries,
    },
    null,
    2,
  ) + '\n',
)
console.log(`Exported ${destination}`)
