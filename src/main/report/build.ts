import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import * as XLSX from 'xlsx'
import type { ScrapedItem } from '../../shared/types'

export interface Report {
  html: string
  markdown: string
}

const esc = (s: string): string =>
  (s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

export function buildReport(
  items: ScrapedItem[],
  meta: { project: string; generatedAt: string; summary?: string },
): Report {
  const summaryBlock = meta.summary
    ? `<section class="summary"><h2>AI 综述</h2><p>${esc(meta.summary)}</p></section>`
    : ''

  const cards = items
    .map((it) => {
      const imgs = it.images.map((src) => `<img src="${esc(src)}" />`).join('')
      const cover = it.videoCover ? `<img src="${esc(it.videoCover)}" class="video-cover" />` : ''
      const media = cover || imgs
      return `<article>
  <h3>${esc(it.title || '(无标题)')}</h3>
  <p class="meta">${esc(it.author || '')} · ${esc(it.date || '')} · ${it.likes} 赞</p>
  ${media ? `<div class="media">${media}</div>` : ''}
  <p>${esc(it.text || '')}</p>
</article>`
    })
    .join('\n')

  const html = `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><title>${esc(meta.project)}</title>
<style>body{font-family:sans-serif;max-width:800px;margin:auto;padding:16px}article{border-bottom:1px solid #eee;padding:12px 0}img{max-width:100%;height:auto}.media{display:flex;flex-wrap:wrap;gap:8px}.meta{color:#666;font-size:13px}</style>
</head><body>
<h1>${esc(meta.project)}</h1><p class="meta">生成于 ${esc(meta.generatedAt)}</p>
${summaryBlock}
${cards}
</body></html>`

  const mdSummary = meta.summary ? `## AI 综述\n\n${meta.summary}\n\n` : ''
  const mdItems = items
    .map((it) => {
      const imgs = it.images.map((src) => `![图](${src})`).join('\n\n')
      return `### ${it.title || '(无标题)'}\n\n${it.author || ''} · ${it.date || ''} · ${it.likes} 赞\n\n${imgs ? imgs + '\n\n' : ''}${it.text || ''}`
    })
    .join('\n\n---\n\n')

  const markdown = `# ${meta.project}\n\n生成于 ${meta.generatedAt}\n\n${mdSummary}${mdItems}\n`

  return { html, markdown }
}

// 把 Markdown 报告写到指定文件（filePath 为完整目标路径）
export function exportMarkdownFile(markdown: string, filePath: string): string {
  mkdirSync(dirname(filePath), { recursive: true })
  writeFileSync(filePath, markdown, 'utf-8')
  return filePath
}

// 把 HTML 报告写到指定文件（filePath 为完整目标路径）
export function exportHtmlFile(html: string, filePath: string): string {
  mkdirSync(dirname(filePath), { recursive: true })
  writeFileSync(filePath, html, 'utf-8')
  return filePath
}

// 导出 CSV（带 BOM，Excel 可直接打开不乱码）。filePath 为完整目标路径。
export async function exportCsv(items: ScrapedItem[], filePath: string): Promise<string> {
  mkdirSync(dirname(filePath), { recursive: true })
  const headers = ['标题', '作者', '日期', '点赞', '链接', '正文']
  const cell = (s: string): string => `"${(s ?? '').replace(/"/g, '""')}"`
  const rows = [headers.map(cell).join(',')]
  for (const it of items) {
    rows.push([it.title, it.author, it.date, String(it.likes), it.url, it.text].map(cell).join(','))
  }
  writeFileSync(filePath, '﻿' + rows.join('\n'), 'utf-8')
  return filePath
}

// 导出 Excel（.xlsx，与 CSV 同列，另加图片列）。filePath 为完整目标路径。
export function exportXlsx(items: ScrapedItem[], filePath: string): string {
  mkdirSync(dirname(filePath), { recursive: true })
  const rows = items.map((it) => ({
    标题: it.title,
    作者: it.author,
    日期: it.date,
    点赞: it.likes,
    图片: it.images.join('\n'),
    链接: it.url,
    正文: it.text,
  }))
  const ws = XLSX.utils.json_to_sheet(rows, { header: ['标题', '作者', '日期', '点赞', '图片', '链接', '正文'] })
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, '采集结果')
  XLSX.writeFile(wb, filePath)
  return filePath
}

// 导出 TXT 纯文本。filePath 为完整目标路径。
export function exportTxt(items: ScrapedItem[], filePath: string): string {
  mkdirSync(dirname(filePath), { recursive: true })
  const lines: string[] = []
  items.forEach((it, i) => {
    lines.push(`【${i + 1}】${it.title || '(无标题)'}`)
    lines.push(`作者：${it.author || '未知'}｜日期：${it.date || '未知'}｜点赞：${it.likes}`)
    if (it.url) lines.push(`链接：${it.url}`)
    if (it.images.length) lines.push(`图片：${it.images.join('  ')}`)
    lines.push(it.text || '')
    lines.push('')
  })
  writeFileSync(filePath, lines.join('\n'), 'utf-8')
  return filePath
}
