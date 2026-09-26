import { PDFDocument, rgb, type PDFFont } from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import type { Invoice } from './domain'

let fontBytes: Promise<Buffer> | undefined
let logoBytes: Promise<Buffer> | undefined
export async function createInvoicePdf(invoice: Invoice): Promise<Buffer> {
  const pdf = await PDFDocument.create()
  pdf.registerFontkit(fontkit)
  fontBytes ??= readFile(
    path.join(process.cwd(), 'assets/fonts/NotoSansJP-Regular.ttf'),
  )
  logoBytes ??= readFile(
    path.join(process.cwd(), 'assets/brand/acoru-logo.png'),
  )
  const [font, logo] = await Promise.all([
    pdf.embedFont(await fontBytes, { subset: false }),
    pdf.embedPng(await logoBytes),
  ])
  const d = invoice.document
  pdf.setTitle(`請求書 ${invoice.id}`)
  pdf.setAuthor(d.issuer.name)
  pdf.setCreationDate(new Date(`${d.issueDate}T00:00:00Z`))
  pdf.setModificationDate(new Date(`${d.issueDate}T00:00:00Z`))
  const purple = rgb(83 / 255, 68 / 255, 145 / 255),
    ink = rgb(0.25, 0.22, 0.21),
    green = rgb(0.34, 0.44, 0.41)
  const number = (n: number) => n.toLocaleString('ja-JP')
  const sections: { lines: typeof d.lines; heights: number[] }[] = []
  let current: typeof d.lines = [],
    heights: number[] = [],
    height = 0
  for (const item of d.lines) {
    const h = Math.max(28, wrap(item.name, font, 10, 245).length * 13 + 14)
    if (height + h > 220 && current.length) {
      sections.push({ lines: current, heights })
      current = []
      heights = []
      height = 0
    }
    current.push(item)
    heights.push(h)
    height += h
  }
  sections.push({ lines: current, heights })
  for (const [index, section] of sections.entries()) {
    const page = pdf.addPage([595.5, 842.25])
    const text = (
      value: string,
      x: number,
      y: number,
      size = 10,
      color = ink,
    ) => page.drawText(value, { x, y, size, font, color })
    const right = (
      value: string,
      x: number,
      y: number,
      size = 10,
      color = ink,
    ) => text(value, x - font.widthOfTextAtSize(value, size), y, size, color)
    const center = (
      value: string,
      x: number,
      y: number,
      size = 10,
      color = ink,
    ) =>
      text(value, x - font.widthOfTextAtSize(value, size) / 2, y, size, color)
    const line = (x: number, y: number, to: number, thickness = 0.6) =>
      page.drawLine({
        start: { x, y },
        end: { x: to, y },
        thickness,
        color: purple,
      })
    page.drawRectangle({
      x: 0,
      y: 812.25,
      width: 595.5,
      height: 30,
      color: purple,
    })
    page.drawRectangle({ x: 0, y: 0, width: 595.5, height: 30, color: purple })
    const [year, month, day] = d.issueDate.split('-').map(Number)
    right(`発行日　　${year}年 ${month}月${day}日`, 543, 766, 11)
    center('請 求 書', 297.75, 721, 25)
    const nameLines = wrap(d.name, font, 10, 180)
    if (nameLines.length > 4)
      throw Error('請求先名がPDFの表示領域を超えています')
    nameLines.forEach((s, i) => text(s, 67, 653 - i * 13, 10))
    const nameBottom = 643 - (nameLines.length - 1) * 13
    right(d.honorific, 243, nameBottom, 13)
    line(67, nameBottom - 10, 244, 3)
    const subjectY = nameBottom - 33
    text('件名', 67, subjectY, 11)
    const subjectLines = wrap(
      d.subject || `${invoice.period.replace('-', '年')}月分`,
      font,
      13,
      180,
    )
    if (subjectLines.length > 2)
      throw Error('件名がPDFの表示領域を超えています。短く調整してください')
    subjectLines.forEach((s, i) => text(s, 107, subjectY - i * 16, 13))
    line(67, subjectY - 10 - (subjectLines.length - 1) * 16, 294, 3)
    text(
      d.issuer.name,
      337,
      644,
      Math.min(21, 205 / font.widthOfTextAtSize(d.issuer.name, 1)),
      green,
    )
    text(d.issuer.tel, 337, 621, 13)
    const issuerAddress = wrap(d.issuer.address, font, 8.5, 207)
    if (issuerAddress.length > 4)
      throw Error('請求元住所がPDFの表示領域を超えています')
    issuerAddress.forEach((s, i) => text(s, 337, 604 - i * 12, 8.5))
    text(`登録番号 ${d.issuer.registration}`, 337, 548, 8)
    text('下記の通り、ご請求申し上げます。', 67, 533, 10)
    text('ご請求金額', 67, 504, 11)
    const totalString = number(invoice.total)
    right(
      totalString,
      225,
      502,
      Math.min(21, 100 / font.widthOfTextAtSize(totalString, 1)),
    )
    text('円（税込）', 239, 503, 9)
    line(67, 493, 294, 3)
    text(`お支払期日　${d.dueDate.replaceAll('-', '/')}`, 67, 475, 9)
    right(`請求番号 ${invoice.id}`, 518, 475, 7)
    if (d.address) {
      const recipient = wrap(
        `${d.postalCode ? '〒' + d.postalCode + '　' : ''}${d.address}`,
        font,
        8,
        450,
      )
      if (recipient.length > 2)
        throw Error('請求先住所がPDFの表示領域を超えています')
      recipient.forEach((s, i) => text(s, 67, 458 - i * 11, 8))
    }
    center('項目', 193, 423, 12, green)
    center('数量', 369, 423, 12, green)
    center('金額', 469, 423, 12, green)
    line(67, 413, 518)
    let y = 413
    section.lines.forEach((item, i) => {
      wrap(item.name, font, 10, 245).forEach((s, j) =>
        text(s, 70, y - 20 - j * 13, 10),
      )
      const quantity = `${item.quantity}${item.unit === '月' ? '/月' : item.unit ? ' ' + item.unit : ''}`
      center(
        quantity,
        369,
        y - 21,
        Math.min(10, 82 / font.widthOfTextAtSize(quantity, 1)),
      )
      right(number(item.quantity * item.unitPrice), 514, y - 21, 11)
      y -= section.heights[i]
      line(67, y, 518)
    })
    // Retain the reference's spacious seven-row grid for short invoices.
    for (let n = section.lines.length; n < 7 && y - 28 >= 193; n++) {
      y -= 28
      line(67, y, 518)
    }
    for (const x of [322, 417])
      page.drawLine({
        start: { x, y: 439 },
        end: { x, y },
        thickness: 0.6,
        color: purple,
      })
    page.drawImage(logo, { x: 106, y: 76, width: 70, height: 90 })
    if (index === sections.length - 1) {
      const items = [
        ['小計', invoice.subtotal],
        ['消費税 (10%)', invoice.tax],
        ['合計', invoice.total],
      ] as const
      items.forEach(([label, value], i) => {
        const sy = 168 - i * 29
        text(label, 326, sy, 10)
        right(number(value), 515, sy, 16)
        line(307, sy - 8, 518, 3)
      })
      const bank = wrap(`お振込先　${d.issuer.bank}`, font, 7.5, 310)
      if (bank.length > 4)
        throw Error(
          '振込先がPDFの表示領域を超えています。改行を調整してください',
        )
      bank.forEach((s, i) => text(s, 208, 75 - i * 10, 7.5))
    } else text('明細は次ページへ続きます。', 326, 139, 10)
    if (d.provisional) text('仮作成・内容確認用', 67, 36, 8, purple)
    right(`${index + 1} / ${sections.length}`, 550, 36, 7)
  }
  return Buffer.from(await pdf.save())
}
function wrap(value: string, font: PDFFont, size: number, width: number) {
  const result: string[] = []
  for (const paragraph of value.split('\n')) {
    let line = ''
    for (const char of paragraph) {
      if (font.widthOfTextAtSize(line + char, size) > width && line) {
        result.push(line)
        line = ''
      }
      line += char
    }
    result.push(line)
  }
  return result
}
