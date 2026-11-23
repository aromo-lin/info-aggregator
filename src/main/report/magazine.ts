import type { Editorial } from '../ai/provider'
import type { ScrapedItem } from '../../shared/types'

const esc = (s: string): string =>
  (s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

export interface MagazineMeta {
  theme: string
  subtitle: string
  brand: string
  issueLabel: string
  footer: string
  editorial: Editorial
}

const CSS = `
  @page { size: A4; margin: 0; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { background: #fff; }
  body {
    font-family: Georgia, 'Times New Roman', 'Songti SC', 'Noto Serif CJK SC', 'Source Han Serif SC', 'SimSun', serif;
    color: #1a1a1a; -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  .page {
    width: 210mm; height: 297mm; position: relative;
    padding: 22mm 20mm 24mm; margin: 0 auto;
    page-break-after: always; break-after: page; overflow: hidden; background: #fff;
  }
  .page:last-child { page-break-after: auto; break-after: auto; }
  .footer {
    position: absolute; bottom: 9mm; left: 20mm; right: 20mm;
    font-size: 8px; color: #c3c3c3; letter-spacing: 1px; text-align: center;
  }

  /* 封面 */
  .cover { display: flex; flex-direction: column; padding: 0; }
  .cover-photo { height: 165mm; width: 100%; object-fit: cover; display: block; background: #f2f2f2; }
  .cover-blank { height: 165mm; background: #f7f6f3; }
  .cover-body { flex: 1; display: flex; flex-direction: column; padding: 10mm 20mm 0; }
  .cover-brand {
    font-size: 32px; font-weight: 700; letter-spacing: 10px; text-transform: uppercase;
    border-bottom: 1px solid #1a1a1a; padding-bottom: 5mm; color: #111;
  }
  .cover-theme { margin-top: 12mm; }
  .cover-kicker { font-size: 10px; letter-spacing: 5px; color: #9a7b4f; text-transform: uppercase; margin-bottom: 5mm; }
  .cover-theme h1 { font-size: 40px; font-weight: 700; line-height: 1.3; letter-spacing: 2px; }
  .cover-sub { margin-top: 5mm; font-size: 13px; color: #6b6b6b; line-height: 1.9; letter-spacing: 1px; }
  .cover-meta {
    margin-top: auto; padding: 6mm 0 4mm; font-size: 10px; color: #8a8a8a;
    letter-spacing: 2px; display: flex; justify-content: space-between;
  }

  /* 目录 */
  .overview-kicker { font-size: 10px; letter-spacing: 5px; color: #9a7b4f; margin-bottom: 4mm; }
  .overview-title { font-size: 30px; font-weight: 700; letter-spacing: 2px; margin-bottom: 4mm; }
  .overview-sub { font-size: 12px; color: #8a8a8a; margin-bottom: 12mm; line-height: 1.8; }
  .toc-item {
    display: flex; gap: 7mm; align-items: baseline;
    padding: 6.5mm 0; border-top: 1px solid #e6e2da;
  }
  .toc-no { font-size: 26px; color: #c9c2b6; font-style: italic; min-width: 12mm; }
  .toc-main { flex: 1; }
  .toc-title { font-size: 16px; font-weight: 700; line-height: 1.6; }
  .toc-sum { font-size: 11px; color: #7a7a7a; margin-top: 2.5mm; line-height: 1.8; }
  .toc-tag {
    font-size: 9px; color: #9a9a9a; letter-spacing: 1px; white-space: nowrap;
    border: 1px solid #e2ddd4; padding: 1mm 2.5mm; border-radius: 2px;
  }

  /* 正文页 */
  .art-no { font-size: 10px; letter-spacing: 4px; color: #9a7b4f; margin-bottom: 6mm; }
  .art-title { font-size: 26px; font-weight: 700; line-height: 1.45; letter-spacing: 1px; }
  .art-sum {
    margin-top: 5mm; font-size: 12.5px; font-style: italic; color: #8a8a8a;
    line-height: 1.9; padding-bottom: 6mm; border-bottom: 1px solid #e6e2da;
  }
  .art-figure { margin-top: 7mm; }
  .art-figure img { width: 100%; max-height: 120mm; object-fit: cover; display: block; background: #f4f4f4; }
  .art-caption { text-align: center; font-size: 9px; color: #a8a8a8; margin-top: 3mm; letter-spacing: 1px; line-height: 1.7; }
  blockquote {
    margin: 8mm 6mm; padding: 1mm 0 1mm 6mm;
    border-left: 3px solid #1a1a1a;
    font-size: 17px; font-style: italic; line-height: 1.9; color: #2b2b2b;
  }
  .art-body { margin-top: 7mm; font-size: 11.5px; line-height: 1.85; color: #333; }
  .art-body p { margin-bottom: 4mm; text-align: justify; }
  .art-byline { margin-top: 6mm; font-size: 10px; color: #9a9a9a; letter-spacing: 1px; }
`

function paragraphs(text: string): string {
  const cleaned = (text || '')
    .split(/\n+/)
    .map((s) => s.trim())
    .filter((s) => s && !/^#[^#\s]+$/.test(s) && s !== '/。')
  const chunks = cleaned.length > 0 ? cleaned : ['（本篇未采集到正文）']
  return chunks.map((p) => `<p>${esc(p)}</p>`).join('')
}

export function buildMagazineHtml(items: ScrapedItem[], meta: MagazineMeta): string {
  const { editorial } = meta
  const coverImg = items.find((it) => it.images.length > 0)?.images[0]

  const cover = `
  <section class="page cover">
    ${coverImg ? `<img class="cover-photo" src="${esc(coverImg)}" alt="" />` : '<div class="cover-blank"></div>'}
    <div class="cover-body">
      <div class="cover-brand">${esc(meta.brand)}</div>
      <div class="cover-theme">
        <div class="cover-kicker">The Fashion Issue</div>
        <h1>${esc(meta.theme)}</h1>
        ${meta.subtitle ? `<div class="cover-sub">${esc(meta.subtitle)}</div>` : ''}
      </div>
      <div class="cover-meta"><span>${esc(meta.issueLabel)}</span><span>${items.length} 篇精选</span></div>
    </div>
    <div class="footer">${esc(meta.footer)}</div>
  </section>`

  const tocItems = items
    .map((it, i) => {
      const ed = editorial.items[i]
      return `
    <div class="toc-item">
      <div class="toc-no">${String(i + 1).padStart(2, '0')}</div>
      <div class="toc-main">
        <div class="toc-title">${esc(it.title || '(无标题)')}</div>
        ${ed?.summary ? `<div class="toc-sum">${esc(ed.summary)}</div>` : ''}
      </div>
      <div class="toc-tag">${esc(it.author || '资讯')}</div>
    </div>`
    })
    .join('')

  const overview = `
  <section class="page">
    <div class="overview-kicker">Contents</div>
    <div class="overview-title">${items.length} 篇精选，一览时尚</div>
    <div class="overview-sub">${esc(meta.theme)}${meta.subtitle ? ' · ' + esc(meta.subtitle) : ''}</div>
    ${tocItems}
    <div class="footer">${esc(meta.footer)}</div>
  </section>`

  const articles = items
    .map((it, i) => {
      const ed = editorial.items[i]
      const imgs = it.images.slice(0, 4)
      const [first, ...rest] = imgs
      return `
  <section class="page">
    <div class="art-no">No.${String(i + 1).padStart(2, '0')} / ${esc(meta.theme)}</div>
    <h2 class="art-title">${esc(it.title || '(无标题)')}</h2>
    ${ed?.summary ? `<div class="art-sum">${esc(ed.summary)}</div>` : ''}
    ${first ? `
    <figure class="art-figure">
      <img src="${esc(first)}" alt="" />
      <figcaption class="art-caption">图 / ${esc(it.author || '来源不详')}${it.date ? ' · ' + esc(it.date) : ''}</figcaption>
    </figure>` : ''}
    ${ed?.quote ? `<blockquote>${esc(ed.quote)}</blockquote>` : ''}
    <div class="art-body">${paragraphs(it.text)}</div>
    ${rest.map((src) => `
    <figure class="art-figure">
      <img src="${esc(src)}" alt="" />
      <figcaption class="art-caption">图 / ${esc(it.author || '来源不详')}</figcaption>
    </figure>`).join('')}
    <div class="art-byline">${esc(it.author || '')}${it.date ? ' · ' + esc(it.date) : ''} · ${it.likes} 赞</div>
    <div class="footer">${esc(meta.footer)}</div>
  </section>`
    })
    .join('')

  return `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8" />
<title>${esc(meta.theme)} · ${esc(meta.brand)}</title>
<style>${CSS}</style>
</head><body>${cover}${overview}${articles}</body></html>`
}
