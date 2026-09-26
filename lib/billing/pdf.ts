import { PDFDocument, rgb, type PDFFont } from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import type { Invoice } from './domain'
import { ACORU_TEMPLATE, type DocumentOptions } from './template'

let fontBytes: Promise<Buffer> | undefined
let logoBytes: Promise<Buffer> | undefined
export async function createInvoicePdf(invoice: Invoice): Promise<Buffer> {
  return createBusinessDocumentPdf(invoice, { kind: 'invoice' })
}

export async function createBusinessDocumentPdf(
  invoice: Invoice,
  options: DocumentOptions = { kind: 'invoice' },
): Promise<Buffer> {
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
  const quotation = options.kind === 'quotation'
  pdf.setTitle(`${quotation ? '見積書' : '請求書'} ${d.name} ${invoice.period}`)
  pdf.setSubject(`${ACORU_TEMPLATE.name} v${ACORU_TEMPLATE.version}`)
  pdf.setAuthor(d.issuer.name)
  pdf.setCreationDate(new Date(`${d.issueDate}T00:00:00Z`))
  pdf.setModificationDate(new Date(`${d.issueDate}T00:00:00Z`))
  const purple = rgb(...ACORU_TEMPLATE.colors.purple)
  const ink = rgb(...ACORU_TEMPLATE.colors.ink),
    muted = rgb(...ACORU_TEMPLATE.colors.muted)
  const pale = rgb(...ACORU_TEMPLATE.colors.pale),
    rule = rgb(...ACORU_TEMPLATE.colors.rule)
  const number = (n: number) => n.toLocaleString('ja-JP')
  const fit = (s: string, size: number, width: number) =>
    Math.min(size, width / Math.max(font.widthOfTextAtSize(s, 1), 1))
  const period = `${invoice.period.slice(0, 4)}年${Number(invoice.period.slice(5))}月分`
  const quotationTerms =
    options.kind === 'quotation'
      ? [
          options.delivery && `納期　${options.delivery}`,
          options.conditions && `条件　${options.conditions}`,
        ]
          .filter(Boolean)
          .join('\n')
      : ''
  const footerLabel = quotation
    ? quotationTerms
      ? 'お見積条件'
      : 'お問い合わせ'
    : 'お振込先'
  const bank = wrap(
    quotation
      ? quotationTerms || 'ご不明な点は上記連絡先までお問い合わせください。'
      : d.issuer.bank.trim(),
    font,
    9,
    367,
  )
  const bankY = 58,
    bankHeight = Math.max(78, 38 + bank.length * 13)
  const summaryY = bankY + bankHeight + 18
  const summaryHeight = 76
  const footerTop = summaryY + summaryHeight
  if (footerTop > 420)
    throw Error(`${footerLabel}の文章が長いため、短く調整してください`)

  const sections: { lines: typeof d.lines; heights: number[] }[] = []
  let current: typeof d.lines = [],
    heights: number[] = [],
    height = 0
  for (const item of d.lines) {
    const h = Math.max(28, wrap(item.name, font, 10, 274).length * 13 + 14)
    if (height + h > 210 && current.length) {
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
  // Reserve space for the final payment block, moving only the trailing details.
  const finalCapacity = 450 - footerTop - 18
  if (height > finalCapacity) {
    const finalSection = sections[sections.length - 1]
    let split = finalSection.lines.length,
      trailingHeight = 0
    while (
      split > 0 &&
      trailingHeight + finalSection.heights[split - 1] <= finalCapacity
    ) {
      trailingHeight += finalSection.heights[--split]
    }
    sections.push({
      lines: finalSection.lines.splice(split),
      heights: finalSection.heights.splice(split),
    })
  }

  for (const [index, section] of sections.entries()) {
    const page = pdf.addPage([
      ACORU_TEMPLATE.page.width,
      ACORU_TEMPLATE.page.height,
    ])
    const last = index === sections.length - 1
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
    const line = (
      x: number,
      y: number,
      to: number,
      thickness = 0.6,
      color = rule,
    ) =>
      page.drawLine({
        start: { x, y },
        end: { x: to, y },
        thickness,
        color,
      })

    page.drawRectangle({
      x: 0,
      y: 822.25,
      width: 595.5,
      height: 20,
      color: purple,
    })
    page.drawRectangle({
      x: 0,
      y: 0,
      width: 595.5,
      height: 12,
      color: purple,
    })
    center(quotation ? '見 積 書' : '請 求 書', 297.75, 761, 25)
    center(
      quotation ? 'Q U O T A T I O N' : 'I N V O I C E',
      297.75,
      742,
      8,
      purple,
    )
    const [year, month, day] = d.issueDate.split('-').map(Number)
    right(`発行日　${year}年${month}月${day}日`, 543.5, 714, 9, muted)
    line(52, 703, 543.5)

    text(quotation ? 'お見積先' : 'ご請求先', 52, 690, 8, muted)
    const recipient = wrap(`${d.name}　${d.honorific}`, font, 13, 268)
    if (recipient.length > 3)
      throw Error('請求先名が長いため、短く調整してください')
    recipient.forEach((s, i) => text(s, 52, 668 - i * 18, 13))
    const recipientEnd = 668 - (recipient.length - 1) * 18
    line(52, recipientEnd - 10, 320, 1.4, purple)
    text(d.issuer.name, 349, 675, fit(d.issuer.name, 18, 194.5), ink)
    const issuerAddress = wrap(d.issuer.address, font, 8.5, 194.5)
    if (issuerAddress.length > 4)
      throw Error('請求元住所が長いため、短く調整してください')
    issuerAddress.forEach((s, i) => text(s, 349, 653 - i * 12, 8.5))
    const issuerBottom = 653 - issuerAddress.length * 12
    text('TEL', 349, issuerBottom - 4, 8.5)
    text(d.issuer.tel.normalize('NFKC'), 373, issuerBottom - 4, 8.5)

    const subject = wrap(d.subject || period, font, 11, 440)
    if (subject.length > 2) throw Error('件名が長いため、短く調整してください')
    text('件名', 52, 572, 9, muted)
    subject.forEach((s, i) => text(s, 84, 572 - i * 15, 11))
    text(
      quotation
        ? '下記の通り、お見積申し上げます。'
        : '下記の通り、ご請求申し上げます。',
      52,
      545,
      9,
    )

    page.drawRectangle({
      x: 52,
      y: 486,
      width: 491.5,
      height: 43,
      color: pale,
    })
    text(quotation ? 'お見積金額' : 'ご請求金額', 65, 502, 10, purple)
    const amount = `${number(invoice.total)} 円`
    right(amount, 337, 498, fit(amount, 24, 182), purple)
    text('税込', 344, 501, 8, muted)
    page.drawLine({
      start: { x: 382, y: 496 },
      end: { x: 382, y: 519 },
      thickness: 0.6,
      color: rule,
    })
    text(quotation ? '見積有効期限' : 'お支払期日', 397, 513, 8, muted)
    right(
      (options.kind === 'quotation'
        ? options.validUntil
        : d.dueDate
      ).replaceAll('-', '/'),
      530,
      496,
      12,
      purple,
    )

    if (section.lines.length) {
      page.drawRectangle({
        x: 52,
        y: 450,
        width: 491.5,
        height: 26,
        color: rgb(0.975, 0.975, 0.98),
      })
      text('項目', 65, 459, 9, muted)
      center('数量', 386, 459, 9, muted)
      right('金額（税抜）', 531, 459, 9, muted)
      line(52, 450, 543.5, 0.9, purple)
      let y = 450
      section.lines.forEach((item, i) => {
        wrap(item.name, font, 10, 274).forEach((s, j) =>
          text(s, 65, y - 19 - j * 13, 10),
        )
        const quantity = `${number(item.quantity)}${item.unit === '月' ? '/月' : item.unit ? ' ' + item.unit : ''}`
        center(quantity, 386, y - 19, fit(quantity, 10, 68))
        const value = number(item.quantity * item.unitPrice)
        right(value, 531, y - 19, fit(value, 11, 104))
        y -= section.heights[i]
        line(52, y, 543.5)
      })
      const bottom = last ? Math.max(240, footerTop + 18) : 240
      for (let n = section.lines.length; n < 7 && y - 28 >= bottom; n++) {
        y -= 28
        line(52, y, 543.5)
      }
    } else {
      text('明細は前ページをご確認ください。', 52, 459, 9, muted)
    }

    if (last) {
      const totalTop = footerTop
      text('小計', 354, totalTop - 17, 9, muted)
      right(number(invoice.subtotal), 531, totalTop - 17, 11)
      text('消費税（10%）', 354, totalTop - 38, 9, muted)
      right(number(invoice.tax), 531, totalTop - 38, 11)
      line(344, totalTop - 48, 543.5, 0.9, purple)
      text('合計（税込）', 354, totalTop - 69, 9, purple)
      const total = `${number(invoice.total)} 円`
      right(total, 531, totalTop - 69, fit(total, 17, 104), purple)

      page.drawRectangle({
        x: 52,
        y: bankY,
        width: 491.5,
        height: bankHeight,
        color: rgb(1, 1, 1),
        borderColor: rule,
        borderWidth: 0.6,
      })
      page.drawRectangle({
        x: 52,
        y: bankY,
        width: 3,
        height: bankHeight,
        color: purple,
      })
      text(footerLabel, 66, bankY + bankHeight - 18, 9, purple)
      bank.forEach((s, i) => text(s, 66, bankY + bankHeight - 36 - i * 13, 9))
      page.drawImage(logo, {
        x: 474,
        y: bankY + (bankHeight - 62) / 2,
        width: 48.2,
        height: 62,
      })
    } else {
      line(52, 117, 543.5)
      text(
        sections[index + 1].lines.length
          ? '明細は次ページへ続きます。'
          : `${footerLabel}は次ページをご確認ください。`,
        52,
        96,
        9,
        muted,
      )
      text(
        `${footerLabel}・金額集計は最終ページに記載しています。`,
        52,
        80,
        8,
        muted,
      )
    }
    if (d.provisional) text('仮作成・内容確認用', 52, 32, 8, purple)
    right(`${index + 1} / ${sections.length}`, 543.5, 32, 8, muted)
  }
  return Buffer.from(await pdf.save())
}

function wrap(value: string, font: PDFFont, size: number, width: number) {
  const result: string[] = []
  for (const paragraph of value.split(/\r?\n/)) {
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
