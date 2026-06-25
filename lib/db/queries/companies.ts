import 'server-only'
import { sql } from '@/lib/db'

export interface Company {
  id: string
  name: string
  corporate_number: string | null
  industry: string | null
  website_url: string | null
  postal_code: string | null
  address: string | null
  phone: string | null
  status: string
  source: string | null
  memo: string | null
  created_by: string | null
  created_at: string
  updated_at: string
  deleted_at: string | null
}

type Row = Record<string, unknown>

function emptyToNull(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function normalizeCorporateNumber(value: unknown): string | null {
  const normalized = emptyToNull(value)
  if (normalized === null) return null
  if (!/^[0-9]{13}$/.test(normalized)) {
    throw new Error('法人番号は13桁の数字で入力してください')
  }
  return normalized
}

function toCompany(r: Row): Company {
  return r as unknown as Company
}

export async function getCompanies(search?: string, status?: string): Promise<Company[]> {
  let rows: Row[]
  if (search && status) {
    rows = await sql`
      SELECT * FROM companies
      WHERE deleted_at IS NULL
        AND status = ${status}
        AND (name ILIKE ${'%' + search + '%'} OR industry ILIKE ${'%' + search + '%'})
      ORDER BY created_at DESC
    `
  } else if (search) {
    rows = await sql`
      SELECT * FROM companies
      WHERE deleted_at IS NULL
        AND (name ILIKE ${'%' + search + '%'} OR industry ILIKE ${'%' + search + '%'})
      ORDER BY created_at DESC
    `
  } else if (status) {
    rows = await sql`
      SELECT * FROM companies
      WHERE deleted_at IS NULL AND status = ${status}
      ORDER BY created_at DESC
    `
  } else {
    rows = await sql`
      SELECT * FROM companies
      WHERE deleted_at IS NULL
      ORDER BY created_at DESC
    `
  }
  return rows.map(toCompany)
}

export async function getCompanyById(id: string): Promise<Company | null> {
  const rows = await sql`
    SELECT * FROM companies WHERE id = ${id} AND deleted_at IS NULL
  `
  return rows[0] ? toCompany(rows[0]) : null
}

export async function createCompany(data: {
  name: string
  corporate_number?: string | null
  industry?: string | null
  website_url?: string | null
  postal_code?: string | null
  address?: string | null
  phone?: string | null
  status?: string
  source?: string | null
  memo?: string | null
}): Promise<Company> {
  const corporateNumber = normalizeCorporateNumber(data.corporate_number)
  const industry = emptyToNull(data.industry)
  const websiteUrl = emptyToNull(data.website_url)
  const postalCode = emptyToNull(data.postal_code)
  const address = emptyToNull(data.address)
  const phone = emptyToNull(data.phone)
  const source = emptyToNull(data.source)
  const memo = emptyToNull(data.memo)

  const rows = await sql`
    INSERT INTO companies (name, corporate_number, industry, website_url, postal_code, address, phone, status, source, memo)
    VALUES (
      ${data.name},
      ${corporateNumber},
      ${industry},
      ${websiteUrl},
      ${postalCode},
      ${address},
      ${phone},
      ${data.status ?? 'active'},
      ${source},
      ${memo}
    )
    RETURNING *
  `
  const company = toCompany(rows[0])
  await sql`
    INSERT INTO audit_logs (action, target_type, target_id, after_json)
    VALUES ('create', 'company', ${company.id}, ${JSON.stringify(company)}::jsonb)
  `
  return company
}

export async function updateCompany(
  id: string,
  data: Partial<{
    name: string
    corporate_number: string | null
    industry: string | null
    website_url: string | null
    postal_code: string | null
    address: string | null
    phone: string | null
    status: string
    source: string | null
    memo: string | null
  }>
): Promise<Company | null> {
  const before = await getCompanyById(id)
  if (!before) return null

  const name = Object.hasOwn(data, 'name') ? data.name : before.name
  const corporateNumber = Object.hasOwn(data, 'corporate_number') ? normalizeCorporateNumber(data.corporate_number) : before.corporate_number
  const industry = Object.hasOwn(data, 'industry') ? emptyToNull(data.industry) : before.industry
  const websiteUrl = Object.hasOwn(data, 'website_url') ? emptyToNull(data.website_url) : before.website_url
  const postalCode = Object.hasOwn(data, 'postal_code') ? emptyToNull(data.postal_code) : before.postal_code
  const address = Object.hasOwn(data, 'address') ? emptyToNull(data.address) : before.address
  const phone = Object.hasOwn(data, 'phone') ? emptyToNull(data.phone) : before.phone
  const status = Object.hasOwn(data, 'status') ? data.status : before.status
  const source = Object.hasOwn(data, 'source') ? emptyToNull(data.source) : before.source
  const memo = Object.hasOwn(data, 'memo') ? emptyToNull(data.memo) : before.memo

  const rows = await sql`
    UPDATE companies SET
      name = ${name},
      corporate_number = ${corporateNumber},
      industry = ${industry},
      website_url = ${websiteUrl},
      postal_code = ${postalCode},
      address = ${address},
      phone = ${phone},
      status = ${status},
      source = ${source},
      memo = ${memo},
      updated_at = now()
    WHERE id = ${id} AND deleted_at IS NULL
    RETURNING *
  `
  const after = rows[0] ? toCompany(rows[0]) : null
  if (after) {
    await sql`
      INSERT INTO audit_logs (action, target_type, target_id, before_json, after_json)
      VALUES ('update', 'company', ${id}, ${JSON.stringify(before)}::jsonb, ${JSON.stringify(after)}::jsonb)
    `
  }
  return after
}

export async function deleteCompany(id: string): Promise<void> {
  const before = await getCompanyById(id)
  await sql`
    UPDATE companies SET deleted_at = now() WHERE id = ${id}
  `
  await sql`
    INSERT INTO audit_logs (action, target_type, target_id, before_json)
    VALUES ('delete', 'company', ${id}, ${JSON.stringify(before)}::jsonb)
  `
}
