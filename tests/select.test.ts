import { describe, expect, test } from 'vitest'
import { itemFingerprint, selectItems } from '../src/main/engine/select'
import type { ScrapedItem, ScrapeConfig } from '../src/shared/types'

function item(partial: Partial<ScrapedItem>): ScrapedItem {
  return {
    id: '',
    sourceId: 's',
    title: 't',
    author: 'a',
    date: '2026-11-01',
    likes: 0,
    url: 'u',
    images: [],
    text: '',
    comments: [],
    ...partial,
  }
}

const config = (partial: Partial<ScrapeConfig>): ScrapeConfig => ({
  count: 3,
  contentTypes: ['image', 'text'],
  includeComments: false,
  sort: 'likes',
  timeRangeDays: null,
  ...partial,
})

describe('selectItems', () => {
  test('sorts by likes descending and takes top N', () => {
    const items = [
      item({ id: '1', likes: 10 }),
      item({ id: '2', likes: 100 }),
      item({ id: '3', likes: 50 }),
      item({ id: '4', likes: 5 }),
    ]
    const result = selectItems(items, config({ count: 3 }), [])
    expect(result.map((x) => x.id)).toEqual(['2', '3', '1'])
  })

  test('excludes seen ids', () => {
    const items = [item({ id: '1', likes: 10 }), item({ id: '2', likes: 100 })]
    const result = selectItems(items, config({ count: 3 }), ['2'])
    expect(result.map((x) => x.id)).toEqual(['1'])
  })

  test('filters out items older than timeRangeDays', () => {
    const items = [item({ id: 'old', date: '2026-01-01', likes: 999 }), item({ id: 'new', date: '2026-11-01', likes: 1 })]
    // 以固定“今天”基准测试：时间过滤由注入的 today 判定，这里通过函数内部推断（见实现）。
    const result = selectItems(items, config({ count: 3, timeRangeDays: 30 }), [], new Date('2026-11-15'))
    expect(result.map((x) => x.id)).toEqual(['new'])
  })

  test('returns empty when everything is seen', () => {
    const items = [item({ id: '1' }), item({ id: '2' })]
    expect(selectItems(items, config({ count: 3 }), ['1', '2'])).toEqual([])
  })

  test('treats items with no id but same fingerprint as duplicates', () => {
    const a = item({ id: '', title: '同款', author: '甲', date: '2026-11-01' })
    const b = item({ id: '', title: '同款', author: '甲', date: '2026-11-01' })
    const result = selectItems([a, b], config({ count: 3 }), [])
    expect(result).toHaveLength(1)
  })

  test('itemFingerprint is stable and differs on content', () => {
    const fp = itemFingerprint({ title: 't', author: 'a', date: '2026-11-01' })
    expect(fp).toBe(itemFingerprint({ title: 't', author: 'a', date: '2026-11-01' }))
    expect(fp).not.toBe(itemFingerprint({ title: 't', author: 'a', date: '2026-11-02' }))
  })
})
