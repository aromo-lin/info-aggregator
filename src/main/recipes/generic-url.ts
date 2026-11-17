import { load } from 'cheerio'
import type { ScrapedItem } from '../../shared/types'

export function extractArticle(html: string, url: string): Pick<ScrapedItem, 'id' | 'title' | 'text' | 'images' | 'url'> {
  const $ = load(html)
  const title = ($('h1').first().text() || $('title').text() || $('meta[property="og:title"]').attr('content') || '').trim()
  const images = $('article img, main img, .content img').map((_, el) => $(el).attr('src') || '').get().filter(Boolean)

  // 取文本密度最高的容器
  let best = $('article, main, .content, .article, #content').first()
  if (best.length === 0) best = $('body')
  const text = best.text().replace(/\s+/g, ' ').trim()

  return { id: url.replace(/[#?].*$/, ''), title, text, images, url }
}
