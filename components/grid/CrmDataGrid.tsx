'use client'

import { useCallback, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { Modal } from '@/components/ui/Modal'
import type { CrmDataGridProps, GridCellStatus, GridColumn, SortState } from './gridTypes'
import { compareGridValues } from './cellUtils'

type CellRef = { rowId: string; columnKey: string }
type EditingCell = CellRef & { draftValue: unknown }
type CellStatusState = { status: GridCellStatus; error?: string }

const interactiveSelector = 'a, button, form, input, select, textarea, label, [role="button"], [data-grid-action="true"]'
const nativeInputs = ['INPUT', 'SELECT', 'TEXTAREA']

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
  title,
  actions,
  toolbar,
  initialQuery = '',
  initialFilters,
  summary,
  canEditRow,
  onCreateRow,
  createLabel = '新規行',
}: CrmDataGridProps<Row>) {
  const [localRows, setLocalRows] = useState(rows)
  const [sourceRows, setSourceRows] = useState(rows)
  if (sourceRows !== rows) { setSourceRows(rows); setLocalRows(rows) }
  const [query, setQuery] = useState(initialQuery)
  const [filters, setFilters] = useState<Record<string, string>>(() => ({ ...initialFilters }))
  const [showFilters, setShowFilters] = useState(() => Object.values(initialFilters ?? {}).some(Boolean))
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())
  const [sort, setSort] = useState<SortState | null>(null)
  const [focusedCell, setFocusedCell] = useState<CellRef | null>(null)
  const [editingCell, setEditingCell] = useState<EditingCell | null>(null)
  const [cellStatuses, setCellStatuses] = useState<Record<string, CellStatusState>>({})
  const [detailRow, setDetailRow] = useState<Row | null>(null)
  const clickTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inFlight = useRef(new Set<string>())
  const newRowRef = useRef<HTMLTableRowElement>(null)

  const dataColumns = useMemo(() => columns.filter((column) => column.key !== 'actions'), [columns])
  const createColumns = useMemo(() => dataColumns.filter((column) => column.creatable ?? column.editable), [dataColumns])
  const blankDraft = useCallback(() => Object.fromEntries(createColumns.map((column) => [column.key, column.defaultValue?.() ?? (column.editor === 'checkbox' ? 'false' : '')])), [createColumns])
  const [newDraft, setNewDraft] = useState<Record<string, string>>(blankDraft)
  const [newError, setNewError] = useState('')
  const [creating, setCreating] = useState(false)

  const filterOptions = useMemo(() => Object.fromEntries(dataColumns.map((column) => {
    if (column.options) return [column.key, column.options]
    if (filterKind(column) !== 'select') return [column.key, []]
    const values = [...new Set(localRows.map((row) => column.getValue?.(row)).filter((value) => value != null && value !== '').map(String))]
    return [column.key, values.sort((a, b) => a.localeCompare(b, 'ja')).map((value) => ({ value, label: value }))]
  })), [dataColumns, localRows])
  const activeFilterCount = Object.values(filters).filter(Boolean).length
  const filteredRows = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase()
    return localRows.filter((row) => {
      if (needle && !dataColumns.some((column) => cellSearchText(row, column).includes(needle))) return false
      return dataColumns.every((column) => {
        const filter = filters[column.key]
        if (!filter) return true
        const value = column.getValue?.(row)
        if (filterKind(column) === 'select') return String(value ?? '') === filter
        return matchesTextFilter(value, cellSearchText(row, column), filter)
      })
    })
  }, [dataColumns, filters, localRows, query])
  const sortedRows = useMemo(() => {
    if (!sort) return filteredRows
    const column = columns.find((c) => c.key === sort.key)
    if (!column?.getValue) return filteredRows
    return [...filteredRows].sort((a, b) => compareGridValues(column.getValue?.(a), column.getValue?.(b), sort.direction))
  }, [columns, filteredRows, sort])
  const selectedRows = sortedRows.filter((row) => selectedIds.has(getRowId(row)))
  const aggregateRows = selectedRows.length > 0 ? selectedRows : sortedRows

  const allVisibleSelected = sortedRows.length > 0 && sortedRows.every((row) => selectedIds.has(getRowId(row)))
  const statusKey = (rowId: string, columnKey: string) => `${rowId}:${columnKey}`
  const focusedRowIndex = focusedCell ? sortedRows.findIndex((row) => getRowId(row) === focusedCell.rowId) : -1
  const focusedColumnIndex = focusedCell ? dataColumns.findIndex((column) => column.key === focusedCell.columnKey) : -1
  const isEditable = useCallback((row: Row, column: GridColumn<Row>) => !!column.editable && (!canEditRow || canEditRow(row)), [canEditRow])

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
    if (!row || !column || !isEditable(row, column)) return
    const key = statusKey(cell.rowId, cell.columnKey)
    if (String(column.getValue?.(row) ?? '') === String(cell.draftValue ?? '')) { setEditingCell(null); return }
    // A dropdown saves on change and again on blur; send each value once.
    const request = `${key}=${String(cell.draftValue ?? '')}`
    if (inFlight.current.has(request)) return
    inFlight.current.add(request)
    setCellStatuses((current) => ({ ...current, [key]: { status: 'saving' } }))
    const value = column.parseValue ? column.parseValue(cell.draftValue) : cell.draftValue
    const result = await onSaveCell(row, column, value).finally(() => inFlight.current.delete(request))
    if (result.ok) {
      setLocalRows((current) => current.map((item) => getRowId(item) === cell.rowId ? result.row : item))
      setCellStatuses((current) => ({ ...current, [key]: { status: 'saved' } }))
      window.setTimeout(() => setCellStatuses((current) => ({ ...current, [key]: { status: 'idle' } })), 1400)
      setEditingCell(null)
    } else {
      setCellStatuses((current) => ({ ...current, [key]: { status: 'error', error: result.error } }))
    }
  }, [columns, getRowId, isEditable, localRows, onSaveCell])

  const startEditing = useCallback((row: Row, column: GridColumn<Row>) => {
    if (!isEditable(row, column)) return
    setFocusedCell({ rowId: getRowId(row), columnKey: column.key })
    setEditingCell({ rowId: getRowId(row), columnKey: column.key, draftValue: column.getValue?.(row) ?? '' })
  }, [getRowId, isEditable])

  const clearFocusedCell = useCallback(() => {
    if (!focusedCell) return
    const row = sortedRows[focusedRowIndex]
    const column = dataColumns[focusedColumnIndex]
    if (!row || !column || !isEditable(row, column) || column.required) return
    void saveCell({ rowId: focusedCell.rowId, columnKey: focusedCell.columnKey, draftValue: column.editor === 'checkbox' ? false : '' })
  }, [dataColumns, focusedCell, focusedColumnIndex, focusedRowIndex, isEditable, saveCell, sortedRows])

  const copyToClipboard = useCallback(() => {
    const rowsToCopy = selectedRows.length > 0 ? selectedRows : focusedRowIndex >= 0 ? [sortedRows[focusedRowIndex]] : []
    if (rowsToCopy.length === 0) return
    const text = rowsToCopy.map((row) => {
      const targetColumns = selectedRows.length > 0 ? dataColumns : [dataColumns[Math.max(focusedColumnIndex, 0)]]
      return targetColumns.map((column) => getCellText(row, column)).join('\t')
    }).join('\n')
    void navigator.clipboard?.writeText(text)
  }, [dataColumns, focusedColumnIndex, focusedRowIndex, getCellText, selectedRows, sortedRows])

  const pasteTsv = useCallback(async (text: string) => {
    if (!focusedCell || focusedRowIndex < 0 || focusedColumnIndex < 0) return
    let writes = 0
    const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').filter((line) => line.length > 0)
    for (let rowOffset = 0; rowOffset < lines.length; rowOffset += 1) {
      const row = sortedRows[focusedRowIndex + rowOffset]
      if (!row) break
      let columnIndex = focusedColumnIndex
      for (const rawValue of lines[rowOffset].split('\t')) {
        while (columnIndex < dataColumns.length && !isEditable(row, dataColumns[columnIndex])) columnIndex += 1
        const column = dataColumns[columnIndex]
        if (!column || writes >= 200) return
        await saveCell({ rowId: getRowId(row), columnKey: column.key, draftValue: rawValue })
        writes += 1
        columnIndex += 1
      }
    }
  }, [dataColumns, focusedCell, focusedColumnIndex, focusedRowIndex, getRowId, isEditable, saveCell, sortedRows])

  const createRow = async () => {
    if (!onCreateRow || creating) return
    const missing = createColumns.find((column) => column.required && !newDraft[column.key]?.trim())
    if (missing) { setNewError(`${missing.label}を入力してください`); return }
    setCreating(true)
    setNewError('')
    const values = Object.fromEntries(createColumns.map((column) => [column.key, column.editor === 'checkbox' ? newDraft[column.key] === 'true' : newDraft[column.key]]))
    const result = await onCreateRow(values)
    setCreating(false)
    if (!result.ok) { setNewError(result.error); return }
    setLocalRows((current) => [result.row, ...current])
    setNewDraft(blankDraft())
    const id = getRowId(result.row)
    setCellStatuses((current) => ({ ...current, [statusKey(id, dataColumns[0]?.key ?? '')]: { status: 'saved' } }))
    window.setTimeout(() => setCellStatuses((current) => ({ ...current, [statusKey(id, dataColumns[0]?.key ?? '')]: { status: 'idle' } })), 1400)
    newRowRef.current?.querySelector<HTMLElement>('input, select, textarea')?.focus()
  }

  const onGridKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    const target = event.target as HTMLElement
    if (nativeInputs.includes(target.tagName)) return
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'c') {
      event.preventDefault(); copyToClipboard(); return
    }
    if (event.key === 'ArrowDown') { event.preventDefault(); moveFocus(1, 0) }
    else if (event.key === 'ArrowUp') { event.preventDefault(); moveFocus(-1, 0) }
    else if (event.key === 'ArrowRight') { event.preventDefault(); moveFocus(0, 1) }
    else if (event.key === 'ArrowLeft') { event.preventDefault(); moveFocus(0, -1) }
    else if (event.key === 'Tab' && focusedCell) { event.preventDefault(); moveFocus(0, event.shiftKey ? -1 : 1) }
    else if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); clearFocusedCell() }
    else if (event.key === 'Enter' || event.key === 'F2') {
      const row = sortedRows[focusedRowIndex]
      const column = dataColumns[focusedColumnIndex]
      if (row && column && isEditable(row, column)) { event.preventDefault(); startEditing(row, column) }
    }
  }

  const renderEditor = (column: GridColumn<Row>, editor: EditingCell) => {
    const label = `${column.label}を編集`
    const onKeyDown = (event: KeyboardEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
      if (event.key === 'Escape') { event.preventDefault(); setEditingCell(null) }
      if (event.key === 'Enter' && !(column.editor === 'textarea' && (event.shiftKey || event.altKey))) { event.preventDefault(); void saveCell(editor) }
    }
    const onBlur = () => void saveCell(editor)
    const update = (draftValue: unknown) => setEditingCell({ ...editor, draftValue })
    // Picking a choice is a complete edit, like Excel's dropdown cells.
    const commitNow = (draftValue: unknown) => { const next = { ...editor, draftValue }; setEditingCell(next); void saveCell(next) }
    if (column.editor === 'select') return <select aria-label={label} autoFocus className="crm-grid__editor-select" value={String(editor.draftValue ?? '')} onKeyDown={onKeyDown} onBlur={onBlur} onChange={(event) => commitNow(event.target.value)}>{column.required ? null : <option value="">（なし）</option>}{column.options?.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select>
    if (column.editor === 'checkbox') return <input aria-label={label} autoFocus className="crm-grid__editor-checkbox" type="checkbox" checked={editor.draftValue === true || editor.draftValue === 'true'} onKeyDown={onKeyDown} onBlur={onBlur} onChange={(event) => commitNow(event.target.checked)} />
    if (column.editor === 'textarea') return <textarea aria-label={label} autoFocus rows={3} className="crm-grid__editor-input crm-grid__editor-textarea" value={String(editor.draftValue ?? '')} onKeyDown={onKeyDown} onBlur={onBlur} onChange={(event) => update(event.target.value)} />
    return <input aria-label={label} autoFocus className="crm-grid__editor-input" type={inputType(column)} value={String(editor.draftValue ?? '')} onKeyDown={onKeyDown} onBlur={onBlur} onChange={(event) => update(event.target.value)} />
  }

  const renderNewInput = (column: GridColumn<Row>) => {
    const label = `${createLabel}: ${column.label}`
    const value = newDraft[column.key] ?? ''
    const update = (next: string) => { setNewDraft((current) => ({ ...current, [column.key]: next })); setNewError('') }
    const onKeyDown = (event: KeyboardEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
      if (event.key === 'Escape') { event.preventDefault(); setNewDraft(blankDraft()); setNewError('') }
      if (event.key === 'Enter' && !(column.editor === 'textarea' && (event.shiftKey || event.altKey))) { event.preventDefault(); void createRow() }
    }
    const placeholder = column.required ? `${column.label} *` : column.label
    if (column.editor === 'select') return <select aria-label={label} className="crm-grid__new-input" value={value} disabled={creating} onKeyDown={onKeyDown} onChange={(event) => update(event.target.value)}><option value="">{column.required ? `${column.label}を選択 *` : '（なし）'}</option>{column.options?.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select>
    if (column.editor === 'checkbox') return <input aria-label={label} type="checkbox" className="crm-grid__editor-checkbox" checked={value === 'true'} disabled={creating} onKeyDown={onKeyDown} onChange={(event) => update(String(event.target.checked))} />
    if (column.editor === 'textarea') return <textarea aria-label={label} rows={1} className="crm-grid__new-input crm-grid__new-textarea" placeholder={placeholder} value={value} disabled={creating} onKeyDown={onKeyDown} onChange={(event) => update(event.target.value)} />
    return <input aria-label={label} className="crm-grid__new-input" type={inputType(column)} placeholder={placeholder} value={value} disabled={creating} onKeyDown={onKeyDown} onChange={(event) => update(event.target.value)} />
  }

  const setFilter = (key: string, value: string) => setFilters((current) => ({ ...current, [key]: value }))
  const clearFilters = () => { setFilters({}); setQuery('') }
  const columnCount = columns.length + 2

  return (
    <section className="crm-grid" aria-label={ariaLabel} tabIndex={0} onKeyDown={onGridKeyDown} onPaste={(event) => { if (!nativeInputs.includes((event.target as HTMLElement).tagName)) { event.preventDefault(); void pasteTsv(event.clipboardData.getData('text/plain')) } }}>
      <div className="crm-grid__toolbar">
        {title != null ? <h1 className="workspace__title">{title}</h1> : null}
        <label className="crm-grid__search">
          <svg aria-hidden="true" width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6"><circle cx="7" cy="7" r="5" /><path d="m11 11 3.5 3.5" strokeLinecap="round" /></svg>
          <input type="search" aria-label="表の内容を検索" placeholder="すべての列から検索" value={query} onChange={(event) => setQuery(event.target.value)} />
        </label>
        <button type="button" className="crm-grid__tool" aria-pressed={showFilters} onClick={() => setShowFilters((current) => !current)}>
          <svg aria-hidden="true" width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M1.5 2h13l-5 6.2V13l-3 1.5V8.2z" /></svg>
          列フィルター{activeFilterCount > 0 ? <span className="crm-grid__tool-count">{activeFilterCount}</span> : null}
        </button>
        {activeFilterCount > 0 || query ? <button type="button" className="crm-grid__clear" onClick={clearFilters}>条件をクリア</button> : null}
        {toolbar}
        <span className="workspace__spacer" />
        {actions != null ? <div className="workspace__actions">{actions}</div> : null}
      </div>
      <div className="crm-grid__scroller">
        <table className="crm-grid__table">
          <colgroup><col style={{ width: 48 }} /><col style={{ width: 42 }} />{columns.map((column) => <col key={column.key} style={{ width: column.width, minWidth: column.minWidth }} />)}</colgroup>
          <thead className="crm-grid__head">
            <tr>
              <th className="crm-grid__header crm-grid__header--select" scope="col"><input aria-label="表示中の行をすべて選択" checked={allVisibleSelected} disabled={sortedRows.length === 0} type="checkbox" onChange={toggleAll} /></th>
              <th className="crm-grid__header crm-grid__header--rownum" scope="col">#</th>
              {columns.map((column) => {
                const isSorted = sort?.key === column.key
                return <th key={column.key} className={`crm-grid__header crm-grid__header--${column.align ?? 'left'}`} scope="col">{column.sortable ? <button className={`crm-grid__sort${isSorted ? ' crm-grid__sort--active' : ''}`} type="button" onClick={() => toggleSort(column.key)}><span>{column.label}</span><span aria-hidden="true" className="crm-grid__sort-icon">{isSorted ? (sort.direction === 'asc' ? '↑' : '↓') : '↕'}</span></button> : column.label}</th>
              })}
            </tr>
            {showFilters ? <tr>
              <td className="crm-grid__filter-cell" /><td className="crm-grid__filter-cell" />
              {columns.map((column) => {
                const kind = column.key === 'actions' ? false : filterKind(column)
                const value = filters[column.key] ?? ''
                const className = `crm-grid__filter-input${value ? ' crm-grid__filter-input--active' : ''}`
                return <td key={column.key} className="crm-grid__filter-cell">{kind === 'select' ? <select aria-label={`${column.label}で絞り込み`} className={className} value={value} onChange={(event) => setFilter(column.key, event.target.value)}><option value="">すべて</option>{filterOptions[column.key]?.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select> : kind === 'text' ? <input aria-label={`${column.label}で絞り込み`} className={className} value={value} placeholder={column.align === 'right' ? '例: >1000' : '含む…'} onChange={(event) => setFilter(column.key, event.target.value)} /> : null}</td>
              })}
            </tr> : null}
          </thead>
          <tbody>
            {onCreateRow ? <>
              <tr ref={newRowRef} className="crm-grid__row crm-grid__row--new">
                <td className="crm-grid__cell crm-grid__cell--new-action" colSpan={2}><button type="button" className="crm-grid__add" disabled={creating} onClick={() => void createRow()}>{creating ? '追加中…' : '＋ 追加'}</button></td>
                {columns.map((column) => <td key={column.key} className={`crm-grid__cell crm-grid__cell--new crm-grid__cell--${column.align ?? 'left'}`}>{createColumns.includes(column) ? renderNewInput(column) : null}</td>)}
              </tr>
              {newError ? <tr><td colSpan={columnCount} className="crm-grid__new-error" role="alert">⚠ {newError}</td></tr> : null}
            </> : null}
            {sortedRows.length === 0 ? <tr><td className="crm-grid__empty" colSpan={columnCount}>{emptyMessage}</td></tr> : sortedRows.map((row, index) => {
              const rowId = getRowId(row)
              const selected = selectedIds.has(rowId)
              return <tr key={rowId} className={`crm-grid__row ${selected ? 'crm-grid__row--selected' : ''} ${getRowClassName?.(row) ?? ''}`} aria-selected={selected} onClick={(event) => { if (!renderRowDetail || (event.target as HTMLElement).closest(interactiveSelector)) return; if (clickTimer.current) clearTimeout(clickTimer.current); clickTimer.current = setTimeout(() => setDetailRow(row), 180) }}>
                <td className="crm-grid__cell crm-grid__cell--select"><input aria-label={`${index + 1}行目を選択`} checked={selected} type="checkbox" onChange={() => toggleRow(rowId)} /></td>
                <td className="crm-grid__cell crm-grid__cell--rownum" title={renderRowDetail ? '詳細を表示' : undefined}>{index + 1}</td>
                {columns.map((column) => {
                  const isFocused = focusedCell?.rowId === rowId && focusedCell.columnKey === column.key
                  const isEditing = editingCell?.rowId === rowId && editingCell.columnKey === column.key
                  const editable = isEditable(row, column)
                  const cellStatus = cellStatuses[statusKey(rowId, column.key)]
                  const className = ['crm-grid__cell', `crm-grid__cell--${column.align ?? 'left'}`, column.wrap ? 'crm-grid__cell--wrap' : '', editable ? 'crm-grid__cell--editable' : '', isFocused ? 'crm-grid__cell--focused' : '', isEditing ? 'crm-grid__cell--editing' : '', cellStatus?.status ? `crm-grid__cell--${cellStatus.status}` : ''].filter(Boolean).join(' ')
                  return <td key={column.key} tabIndex={isFocused ? 0 : -1} className={className} title={editable && !isEditing ? 'ダブルクリックで編集' : undefined}
                    onClick={(event) => { event.stopPropagation(); setFocusedCell({ rowId, columnKey: column.key }) }}
                    onDoubleClick={(event) => { if ((event.target as HTMLElement).closest('a, button')) return; event.stopPropagation(); if (clickTimer.current) clearTimeout(clickTimer.current); startEditing(row, column) }}>
                    {isEditing ? <span className="crm-grid__editor">{renderEditor(column, editingCell)}</span> : (column.renderCell ? column.renderCell(row) : (column.options?.find((option) => option.value === String(column.getValue?.(row)))?.label ?? column.getValue?.(row) ?? '-'))}
                    {cellStatus?.status === 'saving' ? <span className="crm-grid__cell-status">保存中</span> : null}
                    {cellStatus?.status === 'saved' ? <span className="crm-grid__cell-status">保存済み</span> : null}
                    {cellStatus?.status === 'error' ? <span className="crm-grid__cell-error" role="alert">⚠ {cellStatus.error}</span> : null}
                  </td>
                })}
              </tr>
            })}
          </tbody>
        </table>
      </div>
      <div className="crm-grid__status" role="status">
        <span>{sortedRows.length === localRows.length ? <><strong>{localRows.length.toLocaleString()}</strong> 件</> : <>表示 <strong>{sortedRows.length.toLocaleString()}</strong> / 全 {localRows.length.toLocaleString()} 件</>}</span>
        <span>{selectedIds.size.toLocaleString()} 件選択中</span>
        {onSaveCell ? <span className="crm-grid__hint">ダブルクリック・Enterで編集 / Escで取消</span> : null}
        <span className="crm-grid__status-spacer" />
        {dataColumns.filter((column) => column.aggregate === 'sum').map((column) => {
          const total = aggregateRows.reduce((sum, row) => sum + (Number(column.getValue?.(row)) || 0), 0)
          return <span key={column.key}>{column.label} 合計 <strong>{column.formatAggregate ? column.formatAggregate(total) : total.toLocaleString()}</strong></span>
        })}
        {summary?.(aggregateRows)}
      </div>
      {detailRow && renderRowDetail ? <Modal title={getRowDetailTitle?.(detailRow) ?? '詳細'} onClose={() => setDetailRow(null)}>{renderRowDetail(detailRow)}</Modal> : null}
    </section>
  )
}

function inputType<Row>(column: GridColumn<Row>) {
  if (column.editor === 'currency') return 'number'
  if (column.editor === 'textarea' || column.editor === 'select' || column.editor === 'checkbox') return 'text'
  return column.editor ?? 'text'
}

function filterKind<Row>(column: GridColumn<Row>) {
  if (column.filter === false || !column.getValue) return false
  return column.filter ?? (column.options ? 'select' : 'text')
}

function cellSearchText<Row>(row: Row, column: GridColumn<Row>) {
  const value = column.getValue?.(row)
  if (value == null) return ''
  const label = column.options?.find((option) => option.value === String(value))?.label
  return `${value} ${label ?? ''}`.toLocaleLowerCase()
}

// Excel-like text filter: "contains" by default, or a numeric comparison such as ">=1000".
function matchesTextFilter(value: unknown, text: string, filter: string) {
  const comparison = filter.trim().match(/^(>=|<=|>|<|=)\s*(-?[\d,.]+)$/)
  if (comparison && value != null && value !== '' && !Number.isNaN(Number(value))) {
    const actual = Number(value)
    const expected = Number(comparison[2].replace(/,/g, ''))
    if (comparison[1] === '>=') return actual >= expected
    if (comparison[1] === '<=') return actual <= expected
    if (comparison[1] === '>') return actual > expected
    if (comparison[1] === '<') return actual < expected
    return actual === expected
  }
  return text.includes(filter.trim().toLocaleLowerCase())
}
