import type React from 'react'

export type GridCellValue = string | number | boolean | null | undefined

export type GridEditorType = 'text' | 'email' | 'number' | 'currency' | 'date' | 'select' | 'checkbox'

export type GridSelectOption = { value: string; label: string }

export type GridCellStatus = 'idle' | 'saving' | 'saved' | 'error'

export type GridSaveResult<Row> =
  | { ok: true; row: Row }
  | { ok: false; error: string }

export type GridColumn<Row> = {
  key: string
  label: string
  width?: number
  minWidth?: number
  align?: 'left' | 'right' | 'center'
  sortable?: boolean
  editable?: boolean
  editor?: GridEditorType
  options?: GridSelectOption[]
  parseValue?: (value: unknown) => unknown
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
  onSaveCell?: (row: Row, column: GridColumn<Row>, value: unknown) => Promise<GridSaveResult<Row>>
  renderRowDetail?: (row: Row) => React.ReactNode
  getRowDetailTitle?: (row: Row) => string
}

export type SortDirection = 'asc' | 'desc'

export type SortState = {
  key: string
  direction: SortDirection
}
