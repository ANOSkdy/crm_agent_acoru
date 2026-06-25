import 'server-only'
import { sql } from '@/lib/db'

export interface Contact {
  id: string
  company_id: string
  company_name?: string
  name: string
  department: string | null
  position: string | null
  email: string | null
  phone: string | null
  is_decision_maker: boolean
  memo: string | null
  created_by: string | null
  created_at: string
  updated_at: string
  deleted_at: string | null
}

type Row = Record<string, unknown>
function toContact(r: Row): Contact { return r as unknown as Contact }

export async function getContacts(companyId?: string): Promise<Contact[]> {
  let rows: Row[]
  if (companyId) {
    rows = await sql`
      SELECT c.*, co.name as company_name FROM contacts c
      LEFT JOIN companies co ON co.id = c.company_id
      WHERE c.deleted_at IS NULL AND c.company_id = ${companyId}
      ORDER BY c.created_at DESC
    `
  } else {
    rows = await sql`
      SELECT c.*, co.name as company_name FROM contacts c
      LEFT JOIN companies co ON co.id = c.company_id
      WHERE c.deleted_at IS NULL
      ORDER BY c.created_at DESC
    `
  }
  return rows.map(toContact)
}

export async function getContactById(id: string): Promise<Contact | null> {
  const rows = await sql`
    SELECT c.*, co.name as company_name FROM contacts c
    LEFT JOIN companies co ON co.id = c.company_id
    WHERE c.id = ${id} AND c.deleted_at IS NULL
  `
  return rows[0] ? toContact(rows[0]) : null
}

export async function createContact(data: {
  company_id: string
  name: string
  department?: string
  position?: string
  email?: string
  phone?: string
  is_decision_maker?: boolean
  memo?: string
}): Promise<Contact> {
  const rows = await sql`
    INSERT INTO contacts (company_id, name, department, position, email, phone, is_decision_maker, memo)
    VALUES (
      ${data.company_id},
      ${data.name},
      ${data.department ?? null},
      ${data.position ?? null},
      ${data.email ?? null},
      ${data.phone ?? null},
      ${data.is_decision_maker ?? false},
      ${data.memo ?? null}
    )
    RETURNING *
  `
  return toContact(rows[0])
}

export async function updateContact(
  id: string,
  data: Partial<{
    name: string
    department: string
    position: string
    email: string
    phone: string
    is_decision_maker: boolean
    memo: string
  }>
): Promise<Contact | null> {
  const rows = await sql`
    UPDATE contacts SET
      name = COALESCE(${data.name ?? null}, name),
      department = COALESCE(${data.department ?? null}, department),
      position = COALESCE(${data.position ?? null}, position),
      email = COALESCE(${data.email ?? null}, email),
      phone = COALESCE(${data.phone ?? null}, phone),
      is_decision_maker = COALESCE(${data.is_decision_maker ?? null}, is_decision_maker),
      memo = COALESCE(${data.memo ?? null}, memo),
      updated_at = now()
    WHERE id = ${id} AND deleted_at IS NULL
    RETURNING *
  `
  return rows[0] ? toContact(rows[0]) : null
}

export async function deleteContact(id: string): Promise<void> {
  await sql`UPDATE contacts SET deleted_at = now() WHERE id = ${id}`
}
