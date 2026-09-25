import { PDFDocument, rgb, type PDFFont } from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import type { Invoice } from './domain'

let fontBytes: Promise<Buffer> | undefined
export async function createInvoicePdf(invoice: Invoice): Promise<Buffer> {
  const pdf = await PDFDocument.create()
  pdf.registerFontkit(fontkit)
  fontBytes ??= readFile(
    path.join(process.cwd(), 'assets/fonts/NotoSansJP-Regular.ttf'),
  )
  const font = await pdf.embedFont(await fontBytes, { subset: false })
  pdf.setTitle(`請求書 ${invoice.id}`)
  pdf.setAuthor(invoice.document.issuer.name)
  // A fixed creation date makes archived payloads and regeneration deterministic.
  pdf.setCreationDate(new Date(`${invoice.document.issueDate}T00:00:00Z`))
  pdf.setModificationDate(new Date(`${invoice.document.issueDate}T00:00:00Z`))
  const d = invoice.document
  const ink = rgb(0.14, 0.16, 0.2),
    muted = rgb(0.38, 0.41, 0.46),
    line = rgb(0.83, 0.85, 0.88)
  const money = (n: number) => `¥${n.toLocaleString('ja-JP')}`
  const pages: { lines: typeof d.lines; heights: number[] }[] = []
  let group: typeof d.lines = [],
    heights: number[] = [],
    height = 0
  for (const item of d.lines) {
    const h = Math.max(30, wrap(item.name, font, 10, 275).length * 15 + 14)
    if (height + h > 285 && group.length) {
      pages.push({ lines: group, heights })
      group = []
      heights = []
      height = 0
    }
    group.push(item)
    heights.push(h)
    height += h
  }
  pages.push({ lines: group, heights })
  for (const [index, section] of pages.entries()) {
    const page = pdf.addPage([595.28, 841.89])
    const text = (
      value: string,
      x: number,
      y: number,
      size = 10,
      color = ink,
    ) => page.drawText(value, { x, y, size, font, color })
    const right = (value: string, x: number, y: number, size = 10) =>
      text(value, x - font.widthOfTextAtSize(value, size), y, size)
    const rule = (y: number) =>
      page.drawLine({
        start: { x: 45, y },
        end: { x: 550, y },
        thickness: 0.6,
        color: line,
      })
    text('請 求 書', 45, 783, 24)
    right(`請求日 ${d.issueDate.replaceAll('-', '/')}`, 550, 790)
    right(`請求書番号 ${invoice.id}`, 550, 769, 9)
    wrap(`${d.name} ${d.honorific}`, font, 14, 505).forEach((s, i) =>
      text(s, 45, 730 - i * 19, 14),
    )
    text('下記の通りご請求申し上げます。', 45, 666)
    text(`お支払い期限  ${d.dueDate.replaceAll('-', '/')}`, 45, 645)
    text('ご請求金額', 45, 602, 11)
    right(`${money(invoice.total)}-`, 550, 596, 25)
    rule(582)
    page.drawRectangle({
      x: 45,
      y: 540,
      width: 505,
      height: 27,
      color: rgb(0.95, 0.95, 0.97),
    })
    text('品名', 53, 549)
    right('数量', 390, 549)
    right('単価', 470, 549)
    right('金額', 542, 549)
    let y = 540
    section.lines.forEach((item, i) => {
      wrap(item.name, font, 10, 275).forEach((s, j) =>
        text(s, 53, y - 20 - j * 15),
      )
      right(String(item.quantity), 390, y - 20)
      right(money(item.unitPrice), 470, y - 20, 9)
      right(money(item.quantity * item.unitPrice), 542, y - 20, 9)
      y -= section.heights[i]
      rule(y)
    })
    if (index === pages.length - 1) {
      const sy = Math.min(y - 28, 260)
      text('小計', 365, sy)
      right(money(invoice.subtotal), 542, sy)
      text('消費税（10%）', 365, sy - 22)
      right(money(invoice.tax), 542, sy - 22)
      text('合計', 365, sy - 48, 12)
      right(money(invoice.total), 542, sy - 48, 12)
    }
    text('お振込先', 45, 167, 10)
    const bankLines = wrap(d.issuer.bank, font, 9, 285)
    const issuerLines = [
      ...wrap(d.issuer.name, font, 9, 196),
      d.issuer.registration,
      ...wrap(d.issuer.address, font, 9, 196),
      ...wrap(`TEL ${d.issuer.tel}`, font, 9, 196),
    ]
    if (bankLines.length > 8 || issuerLines.length > 10)
      throw new Error(
        '請求元情報がPDFの表示領域を超えています。改行と文字数を調整してください',
      )
    bankLines.forEach((s, i) => text(s, 45, 147 - i * 13, 9))
    issuerLines.forEach((s, i) => text(s, 352, 167 - i * 13, 9))
    text(`${index + 1} / ${pages.length}`, 518, 31, 8, muted)
  }
  return Buffer.from(await pdf.save())
}
function wrap(value: string, font: PDFFont, size: number, width: number) {
  const lines: string[] = []
  for (const paragraph of value.split('\n')) {
    let current = ''
    for (const char of paragraph) {
      if (font.widthOfTextAtSize(current + char, size) > width && current) {
        lines.push(current)
        current = ''
      }
      current += char
    }
    lines.push(current)
  }
  return lines
}
