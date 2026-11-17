import { load } from 'cheerio'
import type { ScrapedItem, Source } from '../../shared/types'
import type { Recipe } from '../engine/recipe'
import { selectItems } from '../engine/select'
import { waitForLogin } from '../browser/session'

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const jitter = (base: number) => base + Math.floor(Math.random() * base)

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

export function parseCards(html: string): Array<Pick<ScrapedItem, 'id' | 'title' | 'author' | 'date' | 'likes' | 'url' | 'images'>> {
  const $ = load(html)
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
    out.push({ id, title, author, date, likes: parseNum(likeTxt), url: href, images: img ? [img] : [] })
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
  const images = $('.note-detail-mask img, #detail-desc img').map((_, el) => $(el).attr('src') || '').get().filter(Boolean)
  const videoCover = $('.note-detail-mask video').attr('poster') || undefined
  const videoUrl = $('.note-detail-mask video source').attr('src') || undefined
  const comments = $('.comment-item .content, .parent-comment .content').map((_, el) => $(el).text().trim()).get().slice(0, 5)
  return { title, author, date, text, images, videoCover, videoUrl, comments, blocked: false }
}

const LOGIN_SELECTOR = '.user .avatar, .avatar-wrapper, [class*="avatar"] img, .reds-avatar'
const CARD_SELECTOR = 'section.note-item'

export const xiaohongshuRecipe: Recipe = {
  site: 'xiaohongshu',
  async run(session, source, onProgress) {
    const { page } = session
    const keyword = source.keywordOrUrl
    const { config } = source

    onProgress({ message: `打开小红书并等待登录（账号：${source.identityId ?? '未指定'}）…` })
    await page.goto('https://www.xiaohongshu.com', { waitUntil: 'commit', timeout: 30000 }).catch(() => {})
    const loggedIn = await waitForLogin(page, LOGIN_SELECTOR, 180000)
    if (!loggedIn) onProgress({ message: '未检测到登录态，仍尝试搜索' })

    onProgress({ message: `搜索「${keyword}」…` })
    await page.goto(`https://www.xiaohongshu.com/search_result?keyword=${encodeURIComponent(keyword)}&source=web_explore_feed`, { waitUntil: 'commit', timeout: 30000 }).catch(() => {})

    // 等卡片出现（期间若有验证码，用户手动过）
    let ready = false
    for (let i = 0; i < 60; i++) {
      if ((await page.locator(CARD_SELECTOR).count()) > 0) { ready = true; break }
      await sleep(2000)
    }
    if (!ready) {
      onProgress({ message: '未检测到搜索结果（可能需手动过验证码或选择器失效）' })
      return []
    }

    onProgress({ message: '翻页加载搜索结果…' })
    for (let i = 0; i < 5; i++) { await page.mouse.wheel(0, 3000); await sleep(jitter(1500)) }

    const html = await page.content()
    const cards = parseCards(html)
    onProgress({ message: `解析到 ${cards.length} 条卡片，按配置筛选…` })

    const candidates: ScrapedItem[] = cards.map((c) => ({
      ...c,
      sourceId: source.id,
      text: '',
      comments: [],
    }))
    const selected = selectItems(candidates, config, source.seenItemIds)
    onProgress({ message: `选定 ${selected.length} 条，开始逐条读取…` })

    const results: ScrapedItem[] = []
    for (const item of selected) {
      try {
        const card = page.locator(`${CARD_SELECTOR} a[href*="/explore/"], ${CARD_SELECTOR} a[href*="/search_result/"]`).filter({ hasText: item.title }).first()
        const count = await card.count()
        if (count === 0) continue
        await card.scrollIntoViewIfNeeded()
        await sleep(jitter(600))
        await card.click()
        await sleep(jitter(3000))

        const detail = parseNote(await page.content())
        if (detail.blocked) {
          onProgress({ message: `跳过被拦笔记：${item.title.slice(0, 20)}` })
        } else {
          results.push({ ...item, ...detail, blocked: false })
          onProgress({ message: `读取：${detail.title.slice(0, 20)}（图 ${detail.images.length}，评论 ${detail.comments.length}）` })
        }
        await page.keyboard.press('Escape')
        await sleep(jitter(1500))
      } catch (e) {
        onProgress({ message: `读取失败：${String(e).slice(0, 60)}` })
      }
    }

    return results
  },
}
