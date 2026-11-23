import { load } from 'cheerio'

export interface ItemMeta {
  likes: number
  sales: number
  date: string // 归一为 YYYY-MM-DD，识别不到为空串
}

// "3.2万" / "1200" / "1.2w" → 数字
function parseCount(s: string): number {
  const t = (s || '').replace(/,/g, '').trim()
  if (!t) return 0
  if (/万/.test(t)) return Math.round(parseFloat(t) * 10000)
  if (/w/i.test(t)) return Math.round(parseFloat(t) * 10000)
  const m = t.match(/[\d.]+/)
  return m ? Math.round(parseFloat(m[0])) : 0
}

function fmtDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function parseDateText(s: string, now: Date): Date | null {
  let m = s.match(/(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/)
  if (m) return new Date(+m[1], +m[2] - 1, +m[3])

  const rel = s.match(/(\d+)\s*(天|小时|分钟)前/)
  if (rel) {
    const v = +rel[1]
    if (rel[2] === '天') return new Date(now.getTime() - v * 86400000)
    if (rel[2] === '小时') return new Date(now.getTime() - v * 3600000)
    if (rel[2] === '分钟') return new Date(now.getTime() - v * 60000)
  }
  if (/今天/.test(s)) return now
  if (/昨天/.test(s)) return new Date(now.getTime() - 86400000)

  m = s.match(/(\d{1,2})[-/.](\d{1,2})/)
  if (m) {
    const month = +m[1]
    const day = +m[2]
    let d = new Date(now.getFullYear(), month - 1, day)
    if (d > now) d = new Date(now.getFullYear() - 1, month - 1, day)
    return d
  }
  return null
}

// 从详情页 HTML 里尽量识别点赞/销量/日期（识别不到则为 0 / 空串）
export function extractMeta(html: string, now: Date = new Date()): ItemMeta {
  const $ = load(html)
  const body = $('body').text().replace(/\s+/g, ' ')

  let likes = 0
  const likeMatch =
    body.match(/([\d.]+[万千w]?)\s*(?:人)?(?:点赞|赞|喜欢|收藏)/) ||
    body.match(/(?:点赞|赞|喜欢|收藏)\s*[:：]?\s*([\d.]+[万千w]?)/)
  if (likeMatch) likes = parseCount(likeMatch[1])

  let sales = 0
  const salesMatch = body.match(/(?:销量|已售|售出|月销)\s*[:：]?\s*([\d.]+[万千w]?)/)
  if (salesMatch) sales = parseCount(salesMatch[1])

  let date = ''
  const dateMatch = body.match(/(\d{4}[-/.]\d{1,2}[-/.]\d{1,2}|\d{1,2}[-/.]\d{1,2}|\d+\s*(?:天|小时|分钟)前|昨天|今天)/)
  if (dateMatch) {
    const d = parseDateText(dateMatch[0], now)
    if (d) date = fmtDate(d)
  }

  return { likes, sales, date }
}