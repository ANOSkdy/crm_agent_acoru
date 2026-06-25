'use client'

export function DeleteCompanyButton() {
  return (
    <button
      type="submit"
      className="px-3 py-2 text-sm bg-red-600 text-white rounded-md hover:bg-red-700"
      onClick={(event) => {
        if (!confirm('削除しますか？')) event.preventDefault()
      }}
    >
      削除
    </button>
  )
}
