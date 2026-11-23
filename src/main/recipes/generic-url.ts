import { load } from 'cheerio'
import type { RateConfig, ScrapedItem, UrlFilter } from '../../shared/types'
import type { Recipe } from '../engine/recipe'
import { extractMeta } from '../engine/meta'
import { trySearch } from '../engine/search'
import { humanDelay, humanScroll } from '../engine/humanize'
import { isShoppingHost, runShopping } from './shopping'

// 把相对路径 / 懒加载的 data-src 归一为绝对 URL
function absUrl(raw: string, baseUrl: string): string {
  const src = (raw || '').trim()
  if (!src) return ''
  if (src.startsWith('data:')) return src
  try {
    return new URL(src, baseUrl).href
  } catch {
    return src
  }
}

// 明显的导航 / 页脚 / UI 杂项链接标题
const JUNK_PATTERNS: RegExp[] = [
  /^查看更多/,
  /^点击(查看|进入|下载|阅读)/,
  /^阅读(全文|原文)/,
  /^立即(下载|查看|购买|体验)/,
  /^扫码/,
  /^下载/,
  /^登录/,
  /^注册/,
  /^首页$/,
  /^关于/,
  /^联系(我们)?/,
  /^隐私/,
  /^用户(协议|服务|条款)/,
  /^帮助/,
  /^客服/,
  /^返回/,
  /^上一篇/,
  /^下一篇/,
  /^收藏$/,
  /^分享$/,
  /^评论$/,
  /^点赞$/,
  /^加入/,
  /^关注/,
]

function isJunkTitle(t: string): boolean {
  const s = t.trim()
  if (!s) return true
  return JUNK_PATTERNS.some((re) => re.test(s))
}

// 纯函数：抽取单页正文（标题 + 文本 + 图片）
export function extractArticle(html: string, url: string): Pick<ScrapedItem, 'id' | 'title' | 'text' | 'images' | 'url'> {
  const $ = load(html)
  const title = ($('h1').first().text() || $('title').text() || $('meta[property="og:title"]').attr('content') || '').trim()

  // 只保留正文主图：排除头像/评论/表情/logo/图标等杂图（VOGUE 文章图常在 vphotocms/article-content 容器里）
  const isJunkImg = (el: Parameters<typeof $>[0], src: string): boolean => {
    const $el = $(el)
    if ($el.closest('[class*="avatar"], [class*="comment"], [class*="emoji"], [class*="sticker"], [class*="icon"], nav, header, footer, [class*="share"], [class*="relate"], [class*="recommend"]').length > 0) return true
    if (/avatar|emoji|sticker|logo|icon|sprite|blank\.|spacer\.|loading\./i.test(src)) return true
    const w = Number($el.attr('width') || 0)
    const h = Number($el.attr('height') || 0)
    if ((w > 0 && w < 100) || (h > 0 && h < 100)) return true
    return false
  }
  const seen = new Set<string>()
  const images: string[] = []
  const push = (raw: string): void => {
    const s = absUrl(raw, url)
    if (!s || seen.has(s)) return
    seen.add(s)
    images.push(s)
  }
  $(
    '.vphotocms img, .article-content img, .article_content img, [class*="article-body"] img, [class*="content-body"] img, article img, main img, .content img, .article img',
  ).each((_, el) => {
    const src = $(el).attr('src') || $(el).attr('data-src') || $(el).attr('data-original') || ''
    if (!src || src.startsWith('data:')) return
    if (isJunkImg(el, src)) return
    push(src)
  })

  let best = $('article, main, .content, .article, #content').first()
  if (best.length === 0) best = $('body')
  const text = best.text().replace(/\s+/g, ' ').trim()

  return { id: url.replace(/[#?].*$/, ''), title, text, images, url }
}

// 纯函数：抽取列表页条目（<a> 链接：标题=链接文本、url=href，并尽量带上缩略图）
export function extractListItems(html: string, baseUrl: string, limit = 30): Array<Pick<ScrapedItem, 'id' | 'title' | 'url' | 'images'>> {
  const $ = load(html)
  const seen = new Set<string>()
  const out: Array<Pick<ScrapedItem, 'id' | 'title' | 'url' | 'images'>> = []
  $('a[href]').each((_, el) => {
    const href = $(el).attr('href') || ''
    const text = $(el).text().replace(/\s+/g, ' ').trim()
    if (!text || text.length < 4 || text.length > 120) return
    let abs: string
    try {
      abs = new URL(href, baseUrl).href
    } catch {
      return
    }
    const id = abs.replace(/[#?].*$/, '')
    if (seen.has(id)) return
    seen.add(id)
    const img = $(el).find('img').first().attr('src') || $(el).find('img').first().attr('data-src') || $(el).find('img').first().attr('data-original') || ''
    const images = img ? [absUrl(img, baseUrl)].filter(Boolean) : []
    out.push({ id, title: text, url: abs, images })
    if (out.length >= limit) return false
  })
  return out
}

// 结构化筛选：点赞 / 销量 / 时间范围。只在能识别到对应数据时才筛，避免缺数据误伤。
function applyFilters(items: ScrapedItem[], filter: UrlFilter | undefined): ScrapedItem[] {
  if (!filter) return items
  let out = items

  if (filter.minLikes != null && filter.minLikes > 0 && out.some((it) => it.likes > 0)) {
    out = out.filter((it) => it.likes >= filter.minLikes!)
  }
  if (filter.minSales != null && filter.minSales > 0 && out.some((it) => (it.sales ?? 0) > 0)) {
    out = out.filter((it) => (it.sales ?? 0) >= filter.minSales!)
  }
  if (filter.timeRangeDays != null && filter.timeRangeDays > 0 && out.some((it) => it.date)) {
    const cutoff = Date.now() - filter.timeRangeDays * 86400000
    out = out.filter((it) => {
      if (!it.date) return true
      const d = new Date(it.date).getTime()
      return Number.isNaN(d) || d >= cutoff
    })
  }
  return out
}

export const genericRecipe: Recipe = {
  site: 'generic',
  async run(session, source, onProgress, rate) {
    const { page } = session
    const url = source.keywordOrUrl
    const limit = source.config.count || 30
    const keyword = (source.searchField || '').trim()
    const filter = source.filter

    onProgress({ message: `打开网页：${url}` })
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {})

    // 有「搜索字段」就先站内搜索；搜不到再退回按关键词筛选页面内容
    let searched = false
    if (keyword) {
      searched = await trySearch(page, keyword)
      onProgress({ message: searched ? `已在站内搜索「${keyword}」` : '未识别到站内搜索框，改为按关键词筛选页面内容' })
    }

    // 淘宝/天猫：重 JS 电商站，走商品卡专用解析（通用 <a> 提取器在这里会失效）
    if (isShoppingHost(page.url() || url)) {
      return runShopping(page, { ...source, searchField: keyword }, (m) => onProgress({ message: m }), rate)
    }

    // 拟人滚动加载（懒加载图片/内容）
    await humanScroll(page, rate)
    await humanDelay(rate)

    const baseUrl = page.url() || url
    const html = await page.content()
    const article = extractArticle(html, baseUrl)
    let links = extractListItems(html, baseUrl, limit * 4)

    // 去导航/页脚等杂项链接
    links = links.filter((l) => !isJunkTitle(l.title))

    // 没真正站内搜索时，把「搜索字段」当标签，按标题包含关键词筛选
    if (keyword && !searched) {
      const kws = keyword
        .split(/[\s,，、;；]+/)
        .map((k) => k.toLowerCase())
        .filter(Boolean)
      links = links.filter((l) => kws.some((k) => l.title.toLowerCase().includes(k)))
      onProgress({ message: `按关键词筛选后剩 ${links.length} 条` })
    }

    // 归类关键词：先按标题筛，减少无谓的详情抓取
    const category = (filter?.category || '').trim().toLowerCase()
    if (category) {
      links = links.filter((l) => l.title.toLowerCase().includes(category))
      onProgress({ message: `按归类「${filter?.category}」筛选后剩 ${links.length} 条` })
    }

    links = links.slice(0, limit)

    // 列表页：逐条点进去读详情（串行、拟人节奏）
    if (links.length > 0) {
      onProgress({ message: `共 ${links.length} 条，逐条读取详情…` })
      let results: ScrapedItem[] = []
      for (const l of links) {
        try {
          await page.goto(l.url, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {})
          await humanDelay(rate)
          const detailHtml = await page.content()
          const detail = extractArticle(detailHtml, l.url)
          const meta = extractMeta(detailHtml)
          results.push({
            id: l.id,
            sourceId: source.id,
            title: detail.title || l.title,
            author: '',
            date: meta.date,
            likes: meta.likes,
            sales: meta.sales,
            url: l.url,
            images: detail.images.length > 0 ? detail.images : l.images,
            text: detail.text,
            comments: [],
          })
          onProgress({ message: `读取：${(detail.title || l.title).slice(0, 30)}（图 ${detail.images.length}，赞 ${meta.likes}，${meta.date}）` })
        } catch (e) {
          onProgress({ message: `读取失败：${String(e).slice(0, 60)}` })
        }
      }

      // 结构化筛选：点赞 / 销量 / 时间范围（只在该站点能识别到对应数据时才筛）
      results = applyFilters(results, filter)
      if (filter && (filter.minLikes || filter.minSales || filter.timeRangeDays || category)) {
        onProgress({ message: `筛选后剩 ${results.length} 条` })
      }
      return results
    }

    // 单页正文
    if (article.title || article.text) {
      onProgress({ message: `已读取正文（${(article.text || '').length} 字，图 ${article.images.length} 张）` })
      const meta = extractMeta(html)
      return [{ ...article, sourceId: source.id, author: '', date: meta.date, likes: meta.likes, sales: meta.sales, comments: [] }]
    }
    return []
  },
}