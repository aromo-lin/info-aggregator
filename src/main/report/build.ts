import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { ScrapedItem } from '../../shared/types'

export interface Report {
  html: string
  markdown: string
}

const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

export function buildReport(
  items: ScrapedItem[],
  meta: { project: string; generatedAt: string; summary?: string },
): Report {
  const summaryBlock = meta.summary
    ? `<section class="summary"><h2>AI 综述</h2><p>${esc(meta.summary)}</p></section>`
    : ''

  const cards = items
    .map((it) => {
      const imgs = it.images.map((src) => `<img src="${src}" />`).join('')
      const cover = it.videoCover ? `<img src="${it.videoCover}" class="video-cover" />` : ''
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

export async function exportMarkdownPackage(report: Report, _items: ScrapedItem[], destDir: string): Promise<string> {
  mkdirSync(destDir, { recursive: true })
  const mdPath = join(destDir, 'report.md')
  writeFileSync(mdPath, report.markdown, 'utf-8')
  return mdPath
}
