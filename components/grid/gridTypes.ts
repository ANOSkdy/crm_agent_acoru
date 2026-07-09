import type React from 'react'

export type GridCellValue = string | number | boolean | null | undefined

export type GridColumn<Row> = {
  key: string
  label: string
  width?: number
  minWidth?: number
  align?: 'left' | 'right' | 'center'
  sortable?: boolean
  getValue?: (row: Row) => GridCellValue
  renderCell?: (row: Row) => React.ReactNode
}

export type CrmDataGridProps<Row> = {
  rows: Row[]
  columns: GridColumn<Row>[]
  getRowId: (row: Row) => string
  emptyMessage: string
  ariaLabel: string
  getRowClassName?: (row: Row) => string | undefined
}

export type SortDirection = 'asc' | 'desc'

export type SortState = {
  key: string
  direction: SortDirection
}
