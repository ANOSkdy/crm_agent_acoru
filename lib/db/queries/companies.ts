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
  corporate_number?: string
  industry?: string
  website_url?: string
  postal_code?: string
  address?: string
  phone?: string
  status?: string
  source?: string
  memo?: string
}): Promise<Company> {
  const rows = await sql`
    INSERT INTO companies (name, corporate_number, industry, website_url, postal_code, address, phone, status, source, memo)
    VALUES (
      ${data.name},
      ${data.corporate_number ?? null},
      ${data.industry ?? null},
      ${data.website_url ?? null},
      ${data.postal_code ?? null},
      ${data.address ?? null},
      ${data.phone ?? null},
      ${data.status ?? 'active'},
      ${data.source ?? null},
      ${data.memo ?? null}
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
    corporate_number: string
    industry: string
    website_url: string
    postal_code: string
    address: string
    phone: string
    status: string
    source: string
    memo: string
  }>
): Promise<Company | null> {
  const before = await getCompanyById(id)
  if (!before) return null

  const rows = await sql`
    UPDATE companies SET
      name = COALESCE(${data.name ?? null}, name),
      corporate_number = COALESCE(${data.corporate_number ?? null}, corporate_number),
      industry = COALESCE(${data.industry ?? null}, industry),
      website_url = COALESCE(${data.website_url ?? null}, website_url),
      postal_code = COALESCE(${data.postal_code ?? null}, postal_code),
      address = COALESCE(${data.address ?? null}, address),
      phone = COALESCE(${data.phone ?? null}, phone),
      status = COALESCE(${data.status ?? null}, status),
      source = COALESCE(${data.source ?? null}, source),
      memo = COALESCE(${data.memo ?? null}, memo),
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
