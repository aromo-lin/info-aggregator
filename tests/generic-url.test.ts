import { describe, expect, test } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { extractArticle } from '../src/main/recipes/generic-url'

describe('extractArticle', () => {
  test('extracts title, text and images from an article page', () => {
    const html = readFileSync(resolve(__dirname, 'fixtures', 'article.html'), 'utf-8')
    const result = extractArticle(html, 'https://example.com/article?id=1')
    expect(result.title).toBe('行业趋势报告 2026')
    expect(result.text).toContain('增长明显')
    expect(result.images.length).toBeGreaterThan(0)
  })
})
