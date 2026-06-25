import 'server-only'
import { sql } from '@/lib/db'

export interface CrmFile {
  id: string
  company_id: string | null
  company_name?: string
  deal_id: string | null
  filename: string
  file_url: string
  mime_type: string | null
  file_type: string | null
  uploaded_by: string | null
  created_at: string
  deleted_at: string | null
}

type Row = Record<string, unknown>
function toFile(r: Row): CrmFile { return r as unknown as CrmFile }

export async function getFiles(filters?: { companyId?: string; dealId?: string }): Promise<CrmFile[]> {
  const companyId = filters?.companyId ?? null
  const dealId = filters?.dealId ?? null

  let rows: Row[]
  if (companyId) {
    rows = await sql`
      SELECT f.*, co.name as company_name FROM files f
      LEFT JOIN companies co ON co.id = f.company_id
      WHERE f.deleted_at IS NULL AND f.company_id = ${companyId}
      ORDER BY f.created_at DESC
    `
  } else if (dealId) {
    rows = await sql`
      SELECT f.*, co.name as company_name FROM files f
      LEFT JOIN companies co ON co.id = f.company_id
      WHERE f.deleted_at IS NULL AND f.deal_id = ${dealId}
      ORDER BY f.created_at DESC
    `
  } else {
    rows = await sql`
      SELECT f.*, co.name as company_name FROM files f
      LEFT JOIN companies co ON co.id = f.company_id
      WHERE f.deleted_at IS NULL
      ORDER BY f.created_at DESC
    `
  }
  return rows.map(toFile)
}

export async function getFilesByCompany(companyId: string): Promise<CrmFile[]> {
  return getFiles({ companyId })
}

export async function createFile(data: {
  company_id?: string
  deal_id?: string
  filename: string
  file_url: string
  mime_type?: string
  file_type?: string
}): Promise<CrmFile> {
  const rows = await sql`
    INSERT INTO files (company_id, deal_id, filename, file_url, mime_type, file_type)
    VALUES (
      ${data.company_id ?? null},
      ${data.deal_id ?? null},
      ${data.filename},
      ${data.file_url},
      ${data.mime_type ?? null},
      ${data.file_type ?? null}
    )
    RETURNING *
  `
  return toFile(rows[0])
}

export async function deleteFile(id: string): Promise<void> {
  await sql`UPDATE files SET deleted_at = now() WHERE id = ${id}`
}
