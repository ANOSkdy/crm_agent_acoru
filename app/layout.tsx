import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Acoru CRM',
  description: 'Acoru Hub 内部CRM',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="ja" className="h-full">
      <body className="h-full">{children}</body>
    </html>
  )
}
