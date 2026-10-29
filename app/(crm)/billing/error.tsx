'use client'
export default function BillingError({ reset }: { reset: () => void }) {
  return (
    <div className="p-6 space-y-4">
      <h1 className="text-xl">請求管理を読み込めませんでした</h1>
      <p>請求管理データベースの初期設定と接続状況を確認してください。</p>
      <button className="btn" onClick={reset}>
        再読み込み
      </button>
    </div>
  )
}
