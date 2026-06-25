import { neon } from '@neondatabase/serverless'
import { join } from 'path'
import { config } from 'dotenv'

config({ path: join(process.cwd(), '.env.local') })

const DATABASE_URL = process.env.DATABASE_URL
if (!DATABASE_URL) {
  throw new Error('DATABASE_URL is not set')
}

const sql = neon(DATABASE_URL)

async function seed() {
  console.log('Seeding deal stages...')
  await sql`
    insert into deal_stages (name, sort_order, default_probability, is_closed, is_won)
    values
      ('リード', 1, 10, false, false),
      ('商談中', 2, 30, false, false),
      ('提案済み', 3, 50, false, false),
      ('交渉中', 4, 70, false, false),
      ('受注', 5, 100, true, true),
      ('失注', 6, 0, true, false)
    on conflict do nothing
  `

  console.log('Seeding sample companies...')
  await sql`
    insert into companies (name, industry, status, source)
    values
      ('株式会社サンプル', 'IT', 'active', '展示会'),
      ('テスト商事', '製造業', 'active', 'Web問い合わせ'),
      ('デモ株式会社', '小売業', 'active', '紹介')
    on conflict do nothing
  `

  console.log('Seed complete.')
}

seed().catch((err) => {
  console.error('Seed failed:', err)
  process.exit(1)
})
