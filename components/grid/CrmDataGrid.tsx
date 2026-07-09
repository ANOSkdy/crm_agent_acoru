'use client'

import { useCallback, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { Modal } from '@/components/ui/Modal'
import type { CrmDataGridProps, GridCellStatus, GridColumn, SortState } from './gridTypes'
import { compareGridValues } from './cellUtils'

type CellRef = { rowId: string; columnKey: string }
type EditingCell = CellRef & { draftValue: unknown }
type CellStatusState = { status: GridCellStatus; error?: string }

const interactiveSelector = 'a, button, form, input, select, textarea, label, [role="button"], [data-grid-action="true"]'

export function CrmDataGrid<Row>({
  rows,
  columns,
  getRowId,
  emptyMessage,
  ariaLabel,
  getRowClassName,
  onSaveCell,
  renderRowDetail,
  getRowDetailTitle,
}: CrmDataGridProps<Row>) {
  const [localRows, setLocalRows] = useState(rows)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())
  const [sort, setSort] = useState<SortState | null>(null)
  const [focusedCell, setFocusedCell] = useState<CellRef | null>(null)
  const [editingCell, setEditingCell] = useState<EditingCell | null>(null)
  const [cellStatuses, setCellStatuses] = useState<Record<string, CellStatusState>>({})
  const [detailRow, setDetailRow] = useState<Row | null>(null)
  const clickTimer = useRef<ReturnType<typeof setTimeout> | null>(null)


  const dataColumns = useMemo(() => columns.filter((column) => column.key !== 'actions'), [columns])
  const sortedRows = useMemo(() => {
    if (!sort) return localRows
    const column = columns.find((c) => c.key === sort.key)
    if (!column?.getValue) return localRows
    return [...localRows].sort((a, b) => compareGridValues(column.getValue?.(a), column.getValue?.(b), sort.direction))
  }, [columns, localRows, sort])

  const allVisibleSelected = sortedRows.length > 0 && sortedRows.every((row) => selectedIds.has(getRowId(row)))
  const statusKey = (rowId: string, columnKey: string) => `${rowId}:${columnKey}`
  const focusedRowIndex = focusedCell ? sortedRows.findIndex((row) => getRowId(row) === focusedCell.rowId) : -1
  const focusedColumnIndex = focusedCell ? dataColumns.findIndex((column) => column.key === focusedCell.columnKey) : -1

  const getCellText = useCallback((row: Row, column: GridColumn<Row>) => {
    const value = column.getValue?.(row)
    if (typeof value === 'boolean') return value ? 'true' : 'false'
    return value == null ? '' : String(value)
  }, [])

  const toggleAll = () => {
    setSelectedIds(() => allVisibleSelected ? new Set() : new Set(sortedRows.map(getRowId)))
  }

  const toggleRow = (id: string) => {
    setSelectedIds((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleSort = (key: string) => {
    setSort((current) => {
      if (current?.key !== key) return { key, direction: 'asc' }
      if (current.direction === 'asc') return { key, direction: 'desc' }
      return null
    })
  }

  const moveFocus = useCallback((rowDelta: number, columnDelta: number) => {
    if (sortedRows.length === 0 || dataColumns.length === 0) return
    const nextRowIndex = Math.min(Math.max((focusedRowIndex < 0 ? 0 : focusedRowIndex) + rowDelta, 0), sortedRows.length - 1)
    const nextColumnIndex = Math.min(Math.max((focusedColumnIndex < 0 ? 0 : focusedColumnIndex) + columnDelta, 0), dataColumns.length - 1)
    setFocusedCell({ rowId: getRowId(sortedRows[nextRowIndex]), columnKey: dataColumns[nextColumnIndex].key })
  }, [dataColumns, focusedColumnIndex, focusedRowIndex, getRowId, sortedRows])

  const saveCell = useCallback(async (cell: EditingCell) => {
    if (!onSaveCell) return
    const row = localRows.find((item) => getRowId(item) === cell.rowId)
    const column = columns.find((item) => item.key === cell.columnKey)
    if (!row || !column?.editable) return
    const key = statusKey(cell.rowId, cell.columnKey)
    setCellStatuses((current) => ({ ...current, [key]: { status: 'saving' } }))
    const value = column.parseValue ? column.parseValue(cell.draftValue) : cell.draftValue
    const result = await onSaveCell(row, column, value)
    if (result.ok) {
      setLocalRows((current) => current.map((item) => getRowId(item) === cell.rowId ? result.row : item))
      setCellStatuses((current) => ({ ...current, [key]: { status: 'saved' } }))
      window.setTimeout(() => setCellStatuses((current) => ({ ...current, [key]: { status: 'idle' } })), 1400)
      setEditingCell(null)
    } else {
      setCellStatuses((current) => ({ ...current, [key]: { status: 'error', error: result.error } }))
    }
  }, [columns, getRowId, localRows, onSaveCell])

  const startEditing = useCallback((row: Row, column: GridColumn<Row>) => {
    if (!column.editable) return
    setEditingCell({ rowId: getRowId(row), columnKey: column.key, draftValue: column.getValue?.(row) ?? '' })
  }, [getRowId])

  const clearFocusedCell = useCallback(() => {
    if (!focusedCell) return
    const row = sortedRows[focusedRowIndex]
    const column = dataColumns[focusedColumnIndex]
    if (!row || !column?.editable) return
    void saveCell({ rowId: focusedCell.rowId, columnKey: focusedCell.columnKey, draftValue: column.editor === 'checkbox' ? false : '' })
  }, [dataColumns, focusedCell, focusedColumnIndex, focusedRowIndex, saveCell, sortedRows])

  const copyToClipboard = useCallback(() => {
    const selectedRows = sortedRows.filter((row) => selectedIds.has(getRowId(row)))
    const rowsToCopy = selectedRows.length > 0 ? selectedRows : focusedRowIndex >= 0 ? [sortedRows[focusedRowIndex]] : []
    if (rowsToCopy.length === 0) return
    const text = rowsToCopy.map((row) => {
      const targetColumns = selectedRows.length > 0 ? dataColumns : [dataColumns[Math.max(focusedColumnIndex, 0)]]
      return targetColumns.map((column) => getCellText(row, column)).join('\t')
    }).join('\n')
    void navigator.clipboard?.writeText(text)
  }, [dataColumns, focusedColumnIndex, focusedRowIndex, getCellText, getRowId, selectedIds, sortedRows])

  const pasteTsv = useCallback(async (text: string) => {
    if (!focusedCell || focusedRowIndex < 0 || focusedColumnIndex < 0) return
    let writes = 0
    const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').filter((line) => line.length > 0)
    for (let rowOffset = 0; rowOffset < lines.length; rowOffset += 1) {
      const row = sortedRows[focusedRowIndex + rowOffset]
      if (!row) break
      let columnIndex = focusedColumnIndex
      for (const rawValue of lines[rowOffset].split('\t')) {
        while (columnIndex < dataColumns.length && !dataColumns[columnIndex].editable) columnIndex += 1
        const column = dataColumns[columnIndex]
        if (!column || writes >= 200) return
        await saveCell({ rowId: getRowId(row), columnKey: column.key, draftValue: rawValue })
        writes += 1
        columnIndex += 1
      }
    }
  }, [dataColumns, focusedCell, focusedColumnIndex, focusedRowIndex, getRowId, saveCell, sortedRows])

  const onGridKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    const target = event.target as HTMLElement
    const isNativeInput = ['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName)
    if (isNativeInput) return
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'c') {
      event.preventDefault(); copyToClipboard(); return
    }
    if (event.key === 'ArrowDown') { event.preventDefault(); moveFocus(1, 0) }
    else if (event.key === 'ArrowUp') { event.preventDefault(); moveFocus(-1, 0) }
    else if (event.key === 'ArrowRight') { event.preventDefault(); moveFocus(0, 1) }
    else if (event.key === 'ArrowLeft') { event.preventDefault(); moveFocus(0, -1) }
    else if (event.key === 'Tab') { event.preventDefault(); moveFocus(0, event.shiftKey ? -1 : 1) }
    else if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); clearFocusedCell() }
    else if (event.key === 'Enter' || event.key === 'F2') {
      const row = sortedRows[focusedRowIndex]
      const column = dataColumns[focusedColumnIndex]
      if (row && column?.editable) { event.preventDefault(); startEditing(row, column) }
    }
  }

  const renderEditor = (row: Row, column: GridColumn<Row>, editor: EditingCell) => {
    const common = {
      className: 'crm-grid__editor-input',
      autoFocus: true,
      onKeyDown: (event: KeyboardEvent<HTMLInputElement | HTMLSelectElement>) => {
        if (event.key === 'Escape') { event.preventDefault(); setEditingCell(null) }
        if (event.key === 'Enter') { event.preventDefault(); void saveCell(editor) }
      },
      onBlur: () => void saveCell(editor),
    }
    if (column.editor === 'select') return <select {...common} className="crm-grid__editor-select" value={String(editor.draftValue ?? '')} onChange={(event) => setEditingCell({ ...editor, draftValue: event.target.value })}>{column.options?.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select>
    if (column.editor === 'checkbox') return <input autoFocus className="crm-grid__editor-checkbox" type="checkbox" checked={Boolean(editor.draftValue)} onChange={(event) => setEditingCell({ ...editor, draftValue: event.target.checked })} onKeyDown={common.onKeyDown} onBlur={common.onBlur} />
    const type = column.editor === 'currency' ? 'number' : (column.editor ?? 'text')
    return <input {...common} type={type} value={String(editor.draftValue ?? '')} onChange={(event) => setEditingCell({ ...editor, draftValue: event.target.value })} />
  }

  return (
    <section className="crm-grid" aria-label={ariaLabel} tabIndex={0} onKeyDown={onGridKeyDown} onPaste={(event) => { if (!['INPUT', 'SELECT', 'TEXTAREA'].includes((event.target as HTMLElement).tagName)) { event.preventDefault(); void pasteTsv(event.clipboardData.getData('text/plain')) } }}>
      <div className="crm-grid__scroller">
        <table className="crm-grid__table">
          <colgroup><col style={{ width: 48 }} /><col style={{ width: 42 }} />{columns.map((column) => <col key={column.key} style={{ width: column.width, minWidth: column.minWidth }} />)}</colgroup>
          <thead className="crm-grid__head"><tr><th className="crm-grid__header crm-grid__header--select" scope="col"><input aria-label="表示中の行をすべて選択" checked={allVisibleSelected} disabled={sortedRows.length === 0} type="checkbox" onChange={toggleAll} /></th><th className="crm-grid__header crm-grid__header--rownum" scope="col">#</th>{columns.map((column) => { const isSorted = sort?.key === column.key; return <th key={column.key} className={`crm-grid__header crm-grid__header--${column.align ?? 'left'}`} scope="col">{column.sortable ? <button className="crm-grid__sort" type="button" onClick={() => toggleSort(column.key)}><span>{column.label}</span><span aria-hidden="true" className="crm-grid__sort-icon">{isSorted ? (sort.direction === 'asc' ? '↑' : '↓') : '↕'}</span></button> : column.label}</th> })}</tr></thead>
          <tbody>{sortedRows.length === 0 ? <tr><td className="crm-grid__empty" colSpan={columns.length + 2}>{emptyMessage}</td></tr> : sortedRows.map((row, index) => { const rowId = getRowId(row); const selected = selectedIds.has(rowId); return <tr key={rowId} className={`crm-grid__row ${selected ? 'crm-grid__row--selected' : ''} ${getRowClassName?.(row) ?? ''}`} aria-selected={selected} onClick={(event) => { if (!renderRowDetail || (event.target as HTMLElement).closest(interactiveSelector)) return; if (clickTimer.current) clearTimeout(clickTimer.current); clickTimer.current = setTimeout(() => setDetailRow(row), 180) }}><td className="crm-grid__cell crm-grid__cell--select"><input aria-label={`${index + 1}行目を選択`} checked={selected} type="checkbox" onChange={() => toggleRow(rowId)} /></td><td className="crm-grid__cell crm-grid__cell--rownum">{index + 1}</td>{columns.map((column) => { const isFocused = focusedCell?.rowId === rowId && focusedCell.columnKey === column.key; const isEditing = editingCell?.rowId === rowId && editingCell.columnKey === column.key; const cellStatus = cellStatuses[statusKey(rowId, column.key)]; return <td key={column.key} tabIndex={isFocused ? 0 : -1} className={`crm-grid__cell crm-grid__cell--${column.align ?? 'left'} ${column.editable ? 'crm-grid__cell--editable' : ''} ${isFocused ? 'crm-grid__cell--focused' : ''} ${isEditing ? 'crm-grid__cell--editing' : ''} ${cellStatus?.status ? `crm-grid__cell--${cellStatus.status}` : ''}`} onClick={(event) => { event.stopPropagation(); setFocusedCell({ rowId, columnKey: column.key }) }} onDoubleClick={(event) => { event.stopPropagation(); if (clickTimer.current) clearTimeout(clickTimer.current); startEditing(row, column) }}>{isEditing ? <span className="crm-grid__editor">{renderEditor(row, column, editingCell)}</span> : (column.renderCell ? column.renderCell(row) : (column.getValue?.(row) ?? '-'))}{cellStatus?.status === 'saving' ? <span className="crm-grid__cell-status">保存中</span> : null}{cellStatus?.status === 'saved' ? <span className="crm-grid__cell-status">保存済み</span> : null}{cellStatus?.status === 'error' ? <span className="crm-grid__cell-error" role="alert">⚠ {cellStatus.error}</span> : null}</td> })}</tr> })}</tbody>
        </table>
      </div>
      <div className="crm-grid__status" role="status"><span>{localRows.length.toLocaleString()} 件</span><span>{selectedIds.size.toLocaleString()} 件選択中</span></div>
      {detailRow && renderRowDetail ? <Modal title={getRowDetailTitle?.(detailRow) ?? '詳細'} onClose={() => setDetailRow(null)}>{renderRowDetail(detailRow)}</Modal> : null}
    </section>
  )
}
