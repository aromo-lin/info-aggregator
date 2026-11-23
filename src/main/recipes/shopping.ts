import type { Page } from 'playwright'
import type { ScrapedItem, UrlFilter } from '../../shared/types'
import { humanScroll } from '../engine/humanize'
import { extractMeta } from '../engine/meta'
import type { RateConfig } from '../../shared/types'

// 淘宝/天猫商品卡：等真实商品卡渲染出来，再按卡片结构解析（通用 <a> 提取器在这里会失效）
const CARD_SELECTORS = [
  '.items .item',
  '.item.J_MouserOnverReq',
  '[class*="Card--"]',
  '[class*="card--"]',
  '.Card--doubleCardWrapper--',
  '[class*="ProductCard"]',
  '.product-iWrap',
  '[class*="item"][class*="card"]',
]

export function isShoppingHost(url: string): boolean {
  try {
    const h = new URL(url).hostname.toLowerCase()
    return /(^|\.)(taobao|tmall)\.com$/.test(h) || h.includes('taobao.com') || h.includes('tmall.com')
  } catch {
    return false
  }
}

export async function runShopping(
  page: Page,
  source: { id: string; keywordOrUrl: string; searchField?: string; filter?: UrlFilter; config: { count: number } },
  onProgress: (m: string) => void,
  rate: RateConfig,
): Promise<ScrapedItem[]> {
  const limit = source.config.count || 30
  const filter = source.filter

  // 等真实商品卡出现（页面是骨架屏+异步渲染，最多 ~30s）
  let found = ''
  const deadline = Date.now() + 30000
  while (Date.now() < deadline) {
    for (const sel of CARD_SELECTORS) {
      if ((await page.locator(sel).count().catch(() => 0)) > 2) {
        found = sel
        break
      }
    }
    if (found) break
    await page.waitForTimeout(1500)
  }
  if (!found) {
    onProgress('未检测到商品卡（可能需登录/验证码，或页面结构变化），请确认弹出窗口里已出搜索结果')
    return []
  }

  onProgress('翻页加载商品…')
  await humanScroll(page, rate)
  await page.waitForTimeout(1500)

  // 在页面里按卡片结构抽取，避免 cheerio 拿到未渲染的骨架
  const raw = await page.evaluate((sel) => {
    const abs = (u: string): string => {
      if (!u) return ''
      if (u.startsWith('//')) return 'https:' + u
      try {
        return new URL(u, location.href).href
      } catch {
        return u
      }
    }
    const pick = (el: Element, sels: string[]): string => {
      for (const s of sels) {
        const t = el.querySelector(s)?.textContent?.trim()
        if (t) return t
      }
      return ''
    }
    const out: Array<{ title: string; url: string; img: string; price: string; sales: string }> = []
    document.querySelectorAll(sel).forEach((el) => {
      const a = el.querySelector('a[href]') as HTMLAnchorElement | null
      const title =
        pick(el, ['[class*="title"]', '[class*="Title"]', '.title', '.row.row-2']) || a?.textContent?.trim() || ''
      const href = a?.getAttribute('href') || ''
      const imgEl = el.querySelector('img')
      const img = imgEl?.getAttribute('src') || imgEl?.getAttribute('data-src') || ''
      const price = pick(el, ['[class*="price"]', '[class*="Price"]', '.price'])
      const sales = pick(el, ['[class*="deal"]', '[class*="sales"]', '[class*="Sales"]', '[class*="sold"]'])
      if (title && title.length >= 4) out.push({ title: title.slice(0, 120), url: abs(href), img: abs(img), price, sales })
    })
    return out
  }, found)

  onProgress(`解析到 ${raw.length} 个商品卡`)

  const dedup = new Map<string, (typeof raw)[number]>()
  for (const r of raw) if (!dedup.has(r.url || r.title)) dedup.set(r.url || r.title, r)
  let cards = [...dedup.values()]

  // 归类关键词：按标题筛
  const category = (filter?.category || '').trim().toLowerCase()
  if (category) {
    const before = cards.length
    cards = cards.filter((c) => c.title.toLowerCase().includes(category))
    onProgress(`按归类「${filter?.category}」筛选后剩 ${cards.length} 条（原 ${before}）`)
  }

  cards = cards.slice(0, limit)

  const results: ScrapedItem[] = cards.map((c) => {
    const meta = extractMeta(`${c.price} ${c.sales}`)
    const salesNum = parseSales(c.sales)
    return {
      id: c.url || c.title,
      sourceId: source.id,
      title: c.title,
      author: c.price ? `¥${c.price.replace(/[¥\s]/g, '')}` : '',
      date: '',
      likes: 0,
      sales: salesNum || meta.sales,
      url: c.url,
      images: c.img ? [c.img] : [],
      text: [c.price && `价格 ${c.price}`, c.sales].filter(Boolean).join(' · '),
      comments: [],
    }
  })

  // 销量下限（有数据才筛）
  if (filter?.minSales != null && filter.minSales > 0) {
    const before = results.length
    const kept = results.filter((r) => (r.sales ?? 0) >= filter.minSales!)
    onProgress(`按销量≥${filter.minSales}：${before} → ${kept.length} 条`)
    return kept
  }
  return results
}

function parseSales(s: string): number {
  const t = (s || '').replace(/,/g, '')
  const m = t.match(/([\d.]+)\s*(万|w)?/)
  if (!m) return 0
  const n = parseFloat(m[1])
  return Math.round(m[2] ? n * 10000 : n)
}
