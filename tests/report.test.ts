import { describe, expect, test } from 'vitest'
import { mkdtempSync, existsSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildReport, exportCsv, exportMarkdownFile, exportHtmlFile, exportTxt, exportXlsx } from '../src/main/report/build'
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

describe('exporters', () => {
  test('exportMarkdownFile writes markdown to given path', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ia-report-'))
    const out = exportMarkdownFile('# 报告\n\n内容', join(dir, 'a.md'))
    expect(existsSync(out)).toBe(true)
    expect(readFileSync(out, 'utf-8')).toContain('# 报告')
  })

  test('exportHtmlFile writes html to given path', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ia-report-'))
    const out = exportHtmlFile('<html></html>', join(dir, 'a.html'))
    expect(existsSync(out)).toBe(true)
    expect(readFileSync(out, 'utf-8')).toContain('<html>')
  })

  test('exportCsv writes csv with headers and rows', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ia-report-'))
    const out = await exportCsv(items, join(dir, 'a.csv'))
    const text = readFileSync(out, 'utf-8')
    expect(text).toContain('标题一')
    expect(text).toContain('u2')
  })

  test('exportXlsx writes an xlsx workbook', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ia-report-'))
    const out = exportXlsx(items, join(dir, 'a.xlsx'))
    expect(existsSync(out)).toBe(true)
    // xlsx 是 zip 容器，文件头为 PK
    expect(readFileSync(out).subarray(0, 2).toString()).toBe('PK')
  })

  test('exportTxt writes plain text with titles and urls', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ia-report-'))
    const out = exportTxt(items, join(dir, 'a.txt'))
    const text = readFileSync(out, 'utf-8')
    expect(text).toContain('【1】标题一')
    expect(text).toContain('链接：u1')
  })
})
