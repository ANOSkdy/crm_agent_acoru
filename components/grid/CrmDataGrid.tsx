'use client'

import { useMemo, useState } from 'react'
import type { CrmDataGridProps, SortState } from './gridTypes'
import { compareGridValues } from './cellUtils'

export function CrmDataGrid<Row>({
  rows,
  columns,
  getRowId,
  emptyMessage,
  ariaLabel,
  getRowClassName,
}: CrmDataGridProps<Row>) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())
  const [sort, setSort] = useState<SortState | null>(null)

  const sortedRows = useMemo(() => {
    if (!sort) return rows
    const column = columns.find((c) => c.key === sort.key)
    if (!column?.getValue) return rows
    return [...rows].sort((a, b) => compareGridValues(column.getValue?.(a), column.getValue?.(b), sort.direction))
  }, [columns, rows, sort])

  const allVisibleSelected = sortedRows.length > 0 && sortedRows.every((row) => selectedIds.has(getRowId(row)))

  const toggleAll = () => {
    setSelectedIds(() => {
      if (allVisibleSelected) return new Set()
      return new Set(sortedRows.map(getRowId))
    })
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

  return (
    <section className="crm-grid" aria-label={ariaLabel}>
      <div className="crm-grid__scroller">
        <table className="crm-grid__table">
          <colgroup>
            <col style={{ width: 48 }} />
            <col style={{ width: 42 }} />
            {columns.map((column) => (
              <col key={column.key} style={{ width: column.width, minWidth: column.minWidth }} />
            ))}
          </colgroup>
          <thead className="crm-grid__head">
            <tr>
              <th className="crm-grid__header crm-grid__header--select" scope="col">
                <input
                  aria-label="表示中の行をすべて選択"
                  checked={allVisibleSelected}
                  disabled={sortedRows.length === 0}
                  type="checkbox"
                  onChange={toggleAll}
                />
              </th>
              <th className="crm-grid__header crm-grid__header--rownum" scope="col">#</th>
              {columns.map((column) => {
                const isSorted = sort?.key === column.key
                return (
                  <th key={column.key} className={`crm-grid__header crm-grid__header--${column.align ?? 'left'}`} scope="col">
                    {column.sortable ? (
                      <button className="crm-grid__sort" type="button" onClick={() => toggleSort(column.key)}>
                        <span>{column.label}</span>
                        <span aria-hidden="true" className="crm-grid__sort-icon">{isSorted ? (sort.direction === 'asc' ? '↑' : '↓') : '↕'}</span>
                      </button>
                    ) : column.label}
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {sortedRows.length === 0 ? (
              <tr><td className="crm-grid__empty" colSpan={columns.length + 2}>{emptyMessage}</td></tr>
            ) : sortedRows.map((row, index) => {
              const rowId = getRowId(row)
              const selected = selectedIds.has(rowId)
              return (
                <tr key={rowId} className={`crm-grid__row ${selected ? 'crm-grid__row--selected' : ''} ${getRowClassName?.(row) ?? ''}`} aria-selected={selected}>
                  <td className="crm-grid__cell crm-grid__cell--select">
                    <input aria-label={`${index + 1}行目を選択`} checked={selected} type="checkbox" onChange={() => toggleRow(rowId)} />
                  </td>
                  <td className="crm-grid__cell crm-grid__cell--rownum">{index + 1}</td>
                  {columns.map((column) => (
                    <td key={column.key} className={`crm-grid__cell crm-grid__cell--${column.align ?? 'left'}`}>
                      {column.renderCell ? column.renderCell(row) : (column.getValue?.(row) ?? '-')}
                    </td>
                  ))}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <div className="crm-grid__status" role="status">
        <span>{rows.length.toLocaleString()} 件</span>
        <span>{selectedIds.size.toLocaleString()} 件選択中</span>
      </div>
    </section>
  )
}
