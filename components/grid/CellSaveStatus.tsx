export function SaveSpinner() {
  return <span aria-hidden="true" className="save-spinner" />
}

// Overlays the cell's corner so saving never changes the row height.
export function CellSaveStatus({ state }: { state: 'saving' | 'saved' }) {
  return <span aria-live="polite" className={`crm-grid__cell-status crm-grid__cell-status--${state}`}>
    {state === 'saving' ? <SaveSpinner /> : <svg aria-hidden="true" width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="m2 6.5 2.8 2.8L10 3.5" /></svg>}
    <span className="sr-only">{state === 'saving' ? '保存中' : '保存済み'}</span>
  </span>
}
