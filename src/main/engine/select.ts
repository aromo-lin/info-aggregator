import type { ScrapedItem, ScrapeConfig } from '../../shared/types'
import { parseDate } from './date'

export function itemFingerprint(item: Pick<ScrapedItem, 'title' | 'author' | 'date'>): string {
  const key = `${item.title || ''}|${item.author || ''}|${item.date || ''}`
  let h = 0
  for (let i = 0; i < key.length; i++) {
    h = (Math.imul(31, h) + key.charCodeAt(i)) | 0
  }
  return `fp_${h.toString(36)}`
}

export function selectItems(
  candidates: ScrapedItem[],
  config: ScrapeConfig,
  seenIds: string[],
  now: Date = new Date(),
): ScrapedItem[] {
  const seen = new Set(seenIds)
  const seenFp = new Set<string>()

  const deduped: ScrapedItem[] = []
  for (const c of candidates) {
    if (c.id) {
      if (seen.has(c.id)) continue
      seen.add(c.id)
    } else {
      const fp = itemFingerprint(c)
      if (seenFp.has(fp)) continue
      seenFp.add(fp)
    }
    deduped.push(c)
  }

  let filtered = deduped
  if (config.timeRangeDays != null) {
    const cutoff = new Date(now.getTime() - config.timeRangeDays * 24 * 60 * 60 * 1000)
    filtered = deduped.filter((c) => {
      const d = parseDate(c.date, now)
      return d === null || d >= cutoff
    })
  }

  const sorted = [...filtered].sort((a, b) => {
    if (config.sort === 'latest') {
      const da = parseDate(a.date, now)?.getTime() ?? 0
      const db = parseDate(b.date, now)?.getTime() ?? 0
      return db - da
    }
    return b.likes - a.likes
  })

  return sorted.slice(0, config.count)
}
