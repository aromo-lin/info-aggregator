import { describe, expect, test } from 'vitest'
import { mkdtempSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildReport, exportMarkdownPackage } from '../src/main/report/build'
import type { ScrapedItem } from '../src/shared/types'

const items: ScrapedItem[] = [
  { id: '1', sourceId: 's', title: '标题一', author: '甲', date: '2026-11-05', likes: 100, url: 'u1', images: ['/tmp/a.jpg'], text: '正文一', comments: [] },
  { id: '2', sourceId: 's', title: '标题二', author: '乙', date: '2026-11-06', likes: 50, url: 'u2', images: [], text: '正文二', comments: [] },
]

describe('buildReport', () => {
  test('generates html with item titles and images, no summary section when absent', () => {
    const { html } = buildReport(items, { project: '时尚资讯', generatedAt: '2026-11-17' })
    expect(html).toContain('标题一')
    expect(html).toContain('标题二')
    expect(html).toContain('<img')
    expect(html).not.toContain('AI 综述')
  })

  test('includes summary when provided', () => {
    const { html } = buildReport(items, { project: '时尚资讯', generatedAt: '2026-11-17', summary: '这是综述' })
    expect(html).toContain('这是综述')
    expect(html).toContain('AI 综述')
  })
})

describe('exportMarkdownPackage', () => {
  test('writes a markdown file and images dir', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ia-report-'))
    const { html, markdown } = buildReport(items, { project: 'p', generatedAt: '2026-11-17' })
    const out = await exportMarkdownPackage({ html, markdown }, items, dir)
    expect(existsSync(out)).toBe(true)
  })
})
