export type DateLike = Date | string | null | undefined

function toValidDate(value: DateLike): Date | null {
  if (!value) return null
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

export function toDateInputValue(value: DateLike): string {
  const date = toValidDate(value)
  return date ? date.toISOString().slice(0, 10) : ''
}

export function toDateTimeLocalInputValue(value: DateLike): string {
  const date = toValidDate(value)
  return date ? date.toISOString().slice(0, 16) : ''
}

export function formatDisplayDate(value: DateLike): string {
  return toDateInputValue(value) || '-'
}

export function formatDisplayDateTime(value: DateLike): string {
  const date = toValidDate(value)
  return date ? date.toISOString().slice(0, 16) : '-'
}
