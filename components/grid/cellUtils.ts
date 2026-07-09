import type { GridCellValue, SortDirection } from './gridTypes'

export function compareGridValues(a: GridCellValue, b: GridCellValue, direction: SortDirection): number {
  const dir = direction === 'asc' ? 1 : -1

  if (a == null && b == null) return 0
  if (a == null) return 1
  if (b == null) return -1

  if (typeof a === 'number' && typeof b === 'number') {
    return (a - b) * dir
  }

  if (typeof a === 'boolean' && typeof b === 'boolean') {
    return (Number(a) - Number(b)) * dir
  }

  return String(a).localeCompare(String(b), 'ja', { numeric: true, sensitivity: 'base' }) * dir
}

export function formatDateText(value: string | null | undefined): string {
  if (!value) return '-'
  return new Intl.DateTimeFormat('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(value))
}

export function formatCurrency(value: number | string | null | undefined): string {
  return `¥${Number(value ?? 0).toLocaleString()}`
}
