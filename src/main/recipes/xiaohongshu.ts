import { load } from 'cheerio'
import type { RateConfig, ScrapedItem, Source, UrlFilter } from '../../shared/types'
import type { Recipe } from '../engine/recipe'
import { waitForLogin } from '../browser/session'
import { trySearch } from '../engine/search'
import { extractMeta } from '../engine/meta'
import { humanDelay, humanScroll, sleep } from '../engine/humanize'

const parseNum = (s: string): number => {
  const t = (s || '').replace(/,/g, '').trim()
  if (/万/.test(t)) return Math.round(parseFloat(t) * 10000)
  const m = t.match(/[\d.]+/)
  return m ? Math.round(parseFloat(m[0])) : 0
}

function noteIdFromHref(href: string): string {
  const m = href.match(/\/(?:explore|search_result)\/([0-9a-f]{10,})/)
  return m ? m[1] : ''
}

// 从搜索页/分享链接里取出关键词（?keyword= / ?q= / ?query=）
function keywordFromUrl(raw: string): string {
  try {
    const u = new URL(raw)
    return (u.searchParams.get('keyword') || u.searchParams.get('q') || u.searchParams.get('query') || '').trim()
  } catch {
    return ''
  }
}

function isNoteUrl(raw: string): boolean {
  return /\/(?:explore|discovery\/item)\//.test(raw)
}

function hoursAgo(dateText: string): number {
  const d = parseDate(dateText)
  return d ? d.getTime() : Number.POSITIVE_INFINITY
}

function keepByTime(item: ScrapedItem, filter: UrlFilter | undefined): boolean {
  if (filter?.timeRangeDays == null || filter.timeRangeDays <= 0) return true
  return hoursAgo(item.date) >= Date.now() - filter.timeRangeDays * 86400000
}

// 把小红书常见的日期格式归一为 Date：
//   "刚刚" / "N分钟前" / "N小时前" / "N天前" / "昨天" / "今天" / "M月D日" / "MM-DD" / "YYYY-MM-DD"
function parseDate(input: string | undefined, ref: Date = new Date()): Date | null {
  if (!input) return null
  // 详情页常见前缀「编辑于/发布于」，先剥掉再解析
  const s = input.replace(/(编辑|发布|发表|更新)于/g, '').trim()

  const rel = s.match(/^(\d+)\s*(分钟|小时|天)前$/)
  if (rel) {
    const v = +rel[1]
    if (rel[2] === '分钟') return new Date(ref.getTime() - v * 60000)
    if (rel[2] === '小时') return new Date(ref.getTime() - v * 3600000)
    if (rel[2] === '天') return new Date(ref.getTime() - v * 86400000)
  }
  if (/刚刚|今天/.test(s)) return ref
  if (/昨天/.test(s)) return new Date(ref.getTime() - 86400000)

  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/)
  if (m) return new Date(+m[1], +m[2] - 1, +m[3])

  m = s.match(/^(\d{1,2})月(\d{1,2})日/)
  if (m) return new Date(ref.getFullYear(), +m[1] - 1, +m[2])

  m = s.match(/^(\d{1,2})[-/.](\d{1,2})/)
  if (m) {
    const month = +m[1]
    const day = +m[2]
    let d = new Date(ref.getFullYear(), month - 1, day)
    if (d > ref) d = new Date(ref.getFullYear() - 1, month - 1, day)
    return d
  }
  return null
}

// 判断标题是否命中搜索词：优先全词包含，长词再退化成 2 字粒度匹配
function bigrams(s: string): string[] {
  const out: string[] = []
  for (let i = 0; i < s.length - 1; i++) out.push(s.slice(i, i + 2))
  return out
}

function titleMatches(title: string, keyword: string): boolean {
  const t = title.toLowerCase()
  const terms = keyword
    .split(/[\s,，,、;；|]+/)
    .map((x) => x.trim())
    .flatMap((x) => x.split(/(\d+)/))
    .filter((x) => x.length >= 2)

  return terms.some((term) => {
    const tt = term.toLowerCase()
    if (t.includes(tt)) return true
    return bigrams(tt).some((b) => t.includes(b))
  })
}

export function parseCards(html: string): Array<Pick<ScrapedItem, 'id' | 'title' | 'author' | 'date' | 'likes' | 'url' | 'images'>> {  const $ = load(html)
  const out: Array<Pick<ScrapedItem, 'id' | 'title' | 'author' | 'date' | 'likes' | 'url' | 'images'>> = []
  $('section.note-item').each((_, el) => {
    const a = $(el).find('a[href*="/explore/"], a[href*="/search_result/"]').first()
    const href = a.attr('href') || ''
    const id = noteIdFromHref(href)
    const title = ($(el).find('.title').text() || a.attr('aria-label') || '').trim()
    const author = $(el).find('.author-wrapper .name, .username').first().text().trim()
    const date = $(el).find('.date').first().text().trim()
    const likeTxt = $(el).find('.like-wrapper .count, [class*="like"] .count').first().text().trim()
    const img = $(el).find('img').first().attr('src') || ''
    if (!id && !title) return
    // href 是相对路径（/explore/xxx），补全域名，否则导出后链接打不开
    const url = href.startsWith('http') ? href : `https://www.xiaohongshu.com${href.startsWith('/') ? '' : '/'}${href}`
    out.push({ id, title, author, date, likes: parseNum(likeTxt), url, images: img ? [img] : [] })
  })
  return out
}

const BLOCKED = /安全限制|当前笔记暂时无法浏览|访问链接已失效/

export function parseNote(html: string): Pick<ScrapedItem, 'title' | 'author' | 'date' | 'text' | 'images' | 'videoCover' | 'videoUrl' | 'comments' | 'blocked'> {
  const $ = load(html)
  const bodyText = $('body').text()
  if (BLOCKED.test(bodyText)) {
    return { title: '', author: '', date: '', text: '', images: [], videoCover: undefined, videoUrl: undefined, comments: [], blocked: true }
  }
  const title = $('#detail-title').first().text().trim() || $('.note-detail-mask .title').first().text().trim()
  const author = $('.author-wrapper .username').first().text().trim()
  const date = $('.note-detail-mask .date').first().text().trim() || $('.date').first().text().trim()
  const text = $('#detail-desc').first().text().trim() || $('.note-detail-mask .desc').first().text().trim()

  // 只取正文主图：优先媒体容器（轮播/图片流），排除描述里的表情图、头像等杂图
  const seen = new Set<string>()
  const images: string[] = []
  const pushImg = (src: string | undefined): void => {
    const s = (src || '').trim()
    if (!s || /emoji/i.test(s) || seen.has(s)) return
    seen.add(s)
    images.push(s)
  }
  $('.note-detail-mask .swiper-slide img, .media-container img, .note-slider img').each((_, el) => {
    pushImg($(el).attr('src') || $(el).attr('data-src'))
  })
  if (images.length === 0) {
    $('.note-detail-mask img').each((_, el) => {
      const $el = $(el)
      if ($el.closest('[class*="emoji"], [class*="sticker"], [class*="avatar"]').length > 0) return
      pushImg($el.attr('src') || $el.attr('data-src'))
    })
  }
  const videoCover = $('.note-detail-mask video').attr('poster') || undefined
  const videoUrl = $('.note-detail-mask video source').attr('src') || undefined
  const comments = $('.comment-item .content, .parent-comment .content').map((_, el) => $(el).text().trim()).get().slice(0, 5)
  return { title, author, date, text, images, videoCover, videoUrl, comments, blocked: false }
}

const LOGIN_SELECTOR = '.user .avatar, .avatar-wrapper, [class*="avatar"] img, .reds-avatar'
const CARD_SELECTOR = 'section.note-item'

// 结构化筛选 + 按点赞排序 + 去重 + 截取条数
function selectCards(cards: ScrapedItem[], filter: UrlFilter | undefined, count: number, seenItemIds: string[]): ScrapedItem[] {
  const seen = new Set(seenItemIds)
  let out = cards.filter((c) => (c.id ? !seen.has(c.id) : true))

  const category = (filter?.category || '').trim().toLowerCase()
  if (category) out = out.filter((it) => it.title.toLowerCase().includes(category) || it.text.toLowerCase().includes(category))
  if (filter?.minLikes != null && filter.minLikes > 0) out = out.filter((it) => it.likes >= filter.minLikes!)
  if (filter?.timeRangeDays != null && filter.timeRangeDays > 0) {
    const cutoff = new Date(Date.now() - filter.timeRangeDays * 86400000)
    out = out.filter((it) => {
      const d = parseDate(it.date)
      return !d || d >= cutoff
    })
  }

  out.sort((a, b) => b.likes - a.likes)
  return out.slice(0, count || 20)
}

export const xiaohongshuRecipe: Recipe = {
  site: 'xiaohongshu',
  async run(session, source, onProgress, rate: RateConfig) {
    const { page } = session
    const entryUrl = (source.keywordOrUrl || '').trim()
    const searchKeyword = (source.searchField || '').trim()
    const urlKeyword = keywordFromUrl(entryUrl)
    const keyword = searchKeyword || urlKeyword
    const { config } = source
    const filter = source.filter

    // 直接给的是某篇笔记：照网址打开，不当成搜索词
    if (isNoteUrl(entryUrl) && !searchKeyword) {
      onProgress({ message: `打开笔记：${entryUrl}` })
      await page.goto(entryUrl, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {})
      await humanDelay(rate)
      const html = await page.content()
      const detail = parseNote(html)
      if (detail.blocked) {
        onProgress({ message: '这篇笔记被平台拦截/失效，无法采集' })
        return []
      }
      const meta = extractMeta(html)
      const item: ScrapedItem = {
        id: noteIdFromHref(entryUrl) || entryUrl,
        sourceId: source.id,
        title: detail.title,
        author: detail.author,
        date: detail.date || meta.date,
        likes: meta.likes,
        url: entryUrl,
        images: detail.images,
        videoCover: detail.videoCover,
        videoUrl: detail.videoUrl,
        text: detail.text,
        comments: detail.comments,
      }
      if (!keepByTime(item, filter)) {
        onProgress({ message: `不满足「近 ${filter?.timeRangeDays} 天」，已跳过这篇笔记` })
        return []
      }
      return [item]
    }

    if (!keyword) {
      onProgress({ message: '这个网址没有搜索词。请在任务里给该网址填写「搜索字段」，或直接填小红书的搜索/笔记链接' })
      return []
    }

    // 已经是搜索页链接：直接打开，省去从首页再搜一遍
    const isSearchUrl = /\/search_result(\?|$)/.test(entryUrl) && !searchKeyword
    if (isSearchUrl) {
      onProgress({ message: `打开搜索结果：${entryUrl}` })
      await page.goto(entryUrl, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {})
    } else {
      onProgress({ message: '打开小红书并等待登录（可扫码）…' })
      await page.goto('https://www.xiaohongshu.com', { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {})
      const loggedIn = await waitForLogin(page, LOGIN_SELECTOR, 180000)
      if (!loggedIn) onProgress({ message: '未检测到登录态（可能未扫码），搜索结果可能不准' })

      // 优先用页面里的搜索框真实搜索（和你手动搜一样）；找不到再退回搜索链接
      onProgress({ message: `搜索「${keyword}」…` })
      const searched = await trySearch(page, keyword)
      if (!searched) {
        onProgress({ message: '未识别到站内搜索框，改用搜索链接' })
        await page.goto(`https://www.xiaohongshu.com/search_result?keyword=${encodeURIComponent(keyword)}&source=web_explore_feed`, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {})
      }
    }

    let ready = false
    for (let i = 0; i < 60; i++) {
      if ((await page.locator(CARD_SELECTOR).count()) > 0) {
        ready = true
        break
      }
      await sleep(2000)
    }
    if (!ready) {
      onProgress({ message: '未检测到搜索结果（可能需手动过验证码或卡片结构变了）' })
      return []
    }

    onProgress({ message: '翻页加载搜索结果…' })
    await humanScroll(page, rate)

    const html = await page.content()
    let cards = parseCards(html)
    onProgress({ message: `解析到 ${cards.length} 条卡片` })

    // 严格按搜索词筛标题，避免平台混入的无关推荐
    if (keyword) {
      const before = cards.length
      cards = cards.filter((c) => titleMatches(c.title, keyword))
      const removed = before - cards.length
      onProgress({ message: removed > 0 ? `按搜索词「${keyword}」筛掉 ${removed} 条无关结果，剩 ${cards.length} 条` : `标题均命中「${keyword}」` })
    }

    const candidates: ScrapedItem[] = cards.map((c) => ({ ...c, sourceId: source.id, text: '', comments: [] }))
    const selected = selectCards(candidates, filter, config.count, source.seenItemIds)
    onProgress({ message: `选定 ${selected.length} 条，开始逐条读取…` })

    const results: ScrapedItem[] = []
    for (const item of selected) {
      try {
        const card = page.locator(`${CARD_SELECTOR} a[href*="/explore/"], ${CARD_SELECTOR} a[href*="/search_result/"]`).filter({ hasText: item.title }).first()
        if ((await card.count()) === 0) continue
        await card.scrollIntoViewIfNeeded()
        await humanDelay(rate)
        await card.click()
        await humanDelay(rate)

        const detail = parseNote(await page.content())
        if (detail.blocked) {
          onProgress({ message: `跳过被拦笔记：${item.title.slice(0, 20)}` })
        } else {
          results.push({ ...item, ...detail, blocked: false })
          onProgress({ message: `读取：${detail.title.slice(0, 20)}（图 ${detail.images.length}，评论 ${detail.comments.length}）` })
        }
        await page.keyboard.press('Escape')
        await humanDelay(rate)
      } catch (e) {
        onProgress({ message: `读取失败：${String(e).slice(0, 60)}` })
      }
    }

    // 时间筛选真正生效在这里：列表卡片上没有日期，得等详情页的「编辑于 xx」回来后再筛
    if (filter?.timeRangeDays != null && filter.timeRangeDays > 0) {
      const before = results.length
      const kept = results.filter((it) => keepByTime(it, filter))
      if (kept.length !== before) onProgress({ message: `按上传时间（近 ${filter.timeRangeDays} 天）筛掉 ${before - kept.length} 条，剩 ${kept.length} 条` })
      return kept
    }

    return results
  },
}