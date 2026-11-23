import { ipcMain, dialog, shell, BrowserWindow } from 'electron'
import type { Page } from 'playwright'
import { createStore } from './store/store'
import { app } from 'electron'
import { join } from 'node:path'
import { writeFile, rm } from 'node:fs/promises'
import { resolveDataDir } from './data-dir'
import { launchSession } from './browser/session'
import { genericRecipe } from './recipes/generic-url'
import { xiaohongshuRecipe } from './recipes/xiaohongshu'
import type { Recipe } from './engine/recipe'
import type { RunResult } from '../shared/api'
import type { RateConfig, ScrapedItem, Source, UrlEntry } from '../shared/types'
import { DEFAULT_AI_REPORT_PROMPT, DEFAULT_RATE } from '../shared/types'
import { buildReport, exportCsv, exportMarkdownFile, exportHtmlFile, exportXlsx, exportTxt } from './report/build'
import { generateEditorial, testConnection } from './ai/provider'
import { buildMagazineHtml } from './report/magazine'
import { ImageLocalizer } from './report/images'
import { loadKey, saveKey } from './ai/keychain'
import type { RunRecord } from '../shared/types'

function getRateConfig(store: ReturnType<typeof createStore>): RateConfig {
  const s = store.settings.get('rate') as (RateConfig & { id: string }) | undefined
  return s ? { enabled: s.enabled, minDelayMs: s.minDelayMs, maxDelayMs: s.maxDelayMs, scrollSteps: s.scrollSteps } : DEFAULT_RATE
}

// 用户可能只填 example.com 不带协议，这里补全，避免 Playwright 打不开。
function normalizeUrl(rawUrl: string): string {
  const t = (rawUrl || '').trim()
  if (!t) return ''
  if (/^https?:\/\//i.test(t)) return t
  return `https://${t}`
}

// 按网址域名自动选配方：小红书走专用搜索+卡片解析，其余走通用网页。
function siteForUrl(rawUrl: string): string {
  try {
    const host = new URL(rawUrl).hostname.toLowerCase()
    if (host === 'xiaohongshu.com' || host.endsWith('.xiaohongshu.com')) return 'xiaohongshu'
  } catch {
    /* ignore */
  }
  return 'generic'
}

const recipes: Record<string, Recipe> = {
  xiaohongshu: xiaohongshuRecipe,
  generic: genericRecipe,
}

export function registerIpc(): void {
  const store = createStore(join(resolveDataDir(), 'store'))

  // 正在采集的会话：用于「停止采集」（标记 + 关闭标签页打断挂起的等待）
  const runningPages = new Map<string, Page>()
  const aborted = new Set<string>()

  ipcMain.handle('abortRun', async (_e, sourceId: string) => {
    aborted.add(sourceId)
    await runningPages.get(sourceId)?.close().catch(() => {})
  })

  ipcMain.handle('listProjects', () => store.projects.getAll())
  ipcMain.handle('upsertProject', (_e, p) => store.projects.upsert(p))
  ipcMain.handle('removeProject', (_e, id) => store.projects.remove(id))

  ipcMain.handle('listSources', () => store.sources.getAll())
  ipcMain.handle('upsertSource', (_e, s) => store.sources.upsert(s))
  ipcMain.handle('removeSource', (_e, id) => store.sources.remove(id))

  ipcMain.handle('listIdentities', () => store.identities.getAll())
  ipcMain.handle('upsertIdentity', (_e, i) => store.identities.upsert(i))
  ipcMain.handle('removeIdentity', (_e, id) => store.identities.remove(id))

  ipcMain.handle('runSource', async (event, sourceId: string): Promise<RunResult> => {
    const source = store.sources.get(sourceId)
    if (!source) throw new Error(`source not found: ${sourceId}`)

    const identity = source.identityId ? store.identities.get(source.identityId) : undefined
    const emit = (message: string) => event.sender.send('runSource:progress', { message })
    // 接管用户真实 Chrome（带登录态）；必要时安全退出并带调试端口重启
    aborted.delete(sourceId)
    const session = await launchSession(identity?.profileDir ?? join(resolveDataDir(), 'profiles', 'default'), emit)
    runningPages.set(sourceId, session.page)
    // 启动过程中用户已点「停止」：直接关掉刚开出的标签页
    if (aborted.has(sourceId)) await session.page.close().catch(() => {})
    try {
      const rate = getRateConfig(store)

      // 多网址串行：按 urls 顺序从上往下，一个跑完再跑下一个，不并发。
      const entries: UrlEntry[] =
        source.urls && source.urls.length > 0
          ? source.urls
          : [{ id: source.id, url: source.keywordOrUrl, fields: ['title', 'content', 'image', 'url'] }]

      const collected: ScrapedItem[] = []
      let stopped = false
      for (const entry of entries) {
        if (aborted.has(sourceId)) {
          stopped = true
          break
        }
        const url = normalizeUrl(entry.url)
        if (!url) continue
        const site = siteForUrl(url)
        const recipe = recipes[site] ?? genericRecipe
        emit(`—— 开始采集：${site === 'xiaohongshu' ? '小红书 · ' : ''}${url} ——`)
        const subSource: Source = {
          ...source,
          site,
          keywordOrUrl: url,
          searchField: entry.searchField,
          filter: entry.filter,
          seenItemIds: source.settings?.dedup === false ? [] : source.seenItemIds,
        }
        let items: ScrapedItem[]
        try {
          items = await recipe.run(session, subSource, (p) => emit(p.message), rate)
        } catch (e) {
          // 停止时关掉标签页会让正在进行的 Playwright 操作抛错——按「已停止」处理，不当成失败
          if (aborted.has(sourceId)) {
            stopped = true
            break
          }
          throw e
        }
        // 按「采集内容」勾选项收敛字段（未配置时默认全保留）
        const wantImage = !entry.fields || entry.fields.includes('image')
        const wantContent = !entry.fields || entry.fields.includes('content')
        const shaped = items.map((it) => ({
          ...it,
          sourceId: source.id,
          images: wantImage ? it.images : [],
          text: wantContent ? it.text : '',
        }))
        collected.push(...shaped)
        emit(`✓ ${url} 采集到 ${shaped.length} 条`)
      }

      // 跨网址去重（按 id，缺 id 则按 url）；任务关闭「数据去重」时保留重复
      const seenKeys = new Set<string>()
      const deduped: ScrapedItem[] = []
      for (const it of collected) {
        if (source.settings?.dedup === false) {
          deduped.push(it)
          continue
        }
        const k = it.id || it.url
        if (k && seenKeys.has(k)) continue
        if (k) seenKeys.add(k)
        deduped.push(it)
      }

      // 图片保留原始 URL（应用内可直接显示）；落地到本地走后续「文件下载」设置
      const itemsToReturn = deduped

      // 记下已抓取的 id，供下次续抓去重
      if (source.settings?.dedup !== false) {
        const seen = new Set(source.seenItemIds)
        for (const it of itemsToReturn) if (it.id) seen.add(it.id)
        store.sources.upsert({ ...source, seenItemIds: [...seen] })
      }

      if (stopped) emit('已停止采集（已完成的部分会保留）')
      return { sourceId, items: itemsToReturn }
    } finally {
      runningPages.delete(sourceId)
      aborted.delete(sourceId)
      await session.close()
    }
  })

  // 统一导出入口：格式 xlsx | csv | md | html | txt，弹出保存窗口选位置，完成后定位文件
  ipcMain.handle('exportItems', async (_e, items: ScrapedItem[], format: string): Promise<string | null> => {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    const fmts: Record<string, { ext: string; name: string }> = {
      xlsx: { ext: 'xlsx', name: 'Excel 工作簿' },
      csv: { ext: 'csv', name: 'CSV 文件' },
      md: { ext: 'md', name: 'Markdown 文件' },
      html: { ext: 'html', name: 'HTML 文件' },
      txt: { ext: 'txt', name: 'TXT 文本' },
    }
    const fmt = fmts[format] ?? fmts.xlsx
    const { canceled, filePath } = await dialog.showSaveDialog({
      title: '导出文件',
      defaultPath: join(app.getPath('downloads'), `采集结果_${stamp}.${fmt.ext}`),
      filters: [{ name: fmt.name, extensions: [fmt.ext] }],
    })
    if (canceled || !filePath) return null
    let out: string
    if (format === 'md' || format === 'html') {
      const report = buildReport(items, { project: '采集报告', generatedAt: new Date().toISOString() })
      out = format === 'md' ? exportMarkdownFile(report.markdown, filePath) : exportHtmlFile(report.html, filePath)
    } else if (format === 'txt') {
      out = exportTxt(items, filePath)
    } else if (format === 'xlsx') {
      out = exportXlsx(items, filePath)
    } else {
      out = await exportCsv(items, filePath)
    }
    shell.showItemInFolder(out)
    return out
  })

  // 任务记录：每次采集结果落盘，可回看、可清除；最多保留最新 3 条
  const MAX_RUN_RECORDS = 3
  ipcMain.handle('listRunRecords', () => store.records.getAll().sort((a, b) => (a.endedAt < b.endedAt ? 1 : -1)))
  ipcMain.handle('saveRunRecord', (_e, r: RunRecord) => {
    store.records.upsert(r)
    const all = store.records.getAll().sort((a, b) => (a.endedAt < b.endedAt ? 1 : -1))
    for (const old of all.slice(MAX_RUN_RECORDS)) store.records.remove(old.id)
  })
  ipcMain.handle('removeRunRecord', (_e, id: string) => store.records.remove(id))

  // AI 报告：AI 只提炼内容（主题/摘要/金句），版式用内置杂志模板生成（封面→目录→每篇一页），再渲染成 PDF
  ipcMain.handle('aiReport', async (_e, items: ScrapedItem[], prompt: string): Promise<string | null> => {
    const apiKey = (await loadKey('default')) || ''
    if (!apiKey) throw new Error('还没有配置 AI API Key，请先到「设置」填写并保存')
    const appSettings = (store.settings.get('app') ?? {}) as Record<string, unknown>
    const model = String(appSettings.model || 'claude-sonnet-5-5')
    const baseUrl = typeof appSettings.aiBaseUrl === 'string' ? appSettings.aiBaseUrl : ''
    const editorial = await generateEditorial(items, { model, apiKey, requirement: prompt || DEFAULT_AI_REPORT_PROMPT, baseUrl })
    const stamp0 = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    // 图片先下载到本地，PDF 内嵌 file:// 引用：避免防盗链裂图、图片随 PDF 带走
    const imgDir = join(app.getPath('temp'), `ai_report_imgs_${stamp0}`)
    const localizer = new ImageLocalizer(imgDir)
    await localizer.localizeAll(items.flatMap((it) => it.images.slice(0, 4)))
    const localized = items.map((it) => ({ ...it, images: it.images.map((u) => localizer.resolve(u)) }))
    const now = new Date()
    const html = buildMagazineHtml(localized, {
      theme: editorial.theme,
      subtitle: editorial.subtitle,
      brand: 'VOGUE',
      issueLabel: `${now.getFullYear()}年${now.getMonth() + 1}月 · 第${String(now.getDate()).padStart(2, '0')}期`,
      footer: `VOGUE 时尚资讯精选 · ${now.getFullYear()}年${now.getMonth() + 1}月 | 来源：VOGUE CHINA`,
      editorial,
    })

    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    const tmpHtml = join(app.getPath('temp'), `ai_report_${stamp}.html`)
    await writeFile(tmpHtml, html, 'utf8')

    const win = new BrowserWindow({
      show: false,
      width: 900,
      height: 1200,
      webPreferences: { webSecurity: false },
    })
    try {
      await win.loadFile(tmpHtml)
      await win.webContents
        .executeJavaScript(
          `Promise.race([
             Promise.all(Array.from(document.images).map((img) => img.complete ? 0 : new Promise((r) => { img.onload = img.onerror = r }))),
             new Promise((r) => setTimeout(r, 20000)),
           ])`,
        )
        .catch(() => {})
      const pdf = await win.webContents.printToPDF({
        pageSize: 'A4',
        printBackground: true,
        preferCSSPageSize: true,
        margins: { top: 0.79, bottom: 0.79, left: 0.79, right: 0.79 },
      })
      const { canceled, filePath } = await dialog.showSaveDialog({
        title: '保存 AI 报告',
        defaultPath: join(app.getPath('downloads'), `AI报告_${stamp}.pdf`),
        filters: [{ name: 'PDF 文件', extensions: ['pdf'] }],
      })
      if (canceled || !filePath) return null
      await writeFile(filePath, pdf)
      shell.showItemInFolder(filePath)
      return filePath
    } finally {
      win.destroy()
      await rm(imgDir, { recursive: true, force: true }).catch(() => {})
      await rm(tmpHtml, { force: true }).catch(() => {})
    }
  })

  ipcMain.handle('testAiConnection', (_e, opts: { model: string; apiKey: string; baseUrl?: string }) => testConnection(opts))

  ipcMain.handle('saveKey', (_e, provider: string, key: string) => saveKey(provider, key))
  ipcMain.handle('loadKey', (_e, provider: string) => loadKey(provider))

  ipcMain.handle('getSetting', (_e, key: string) => {
    const app = store.settings.get('app')
    return app ? app[key] : undefined
  })
  ipcMain.handle('saveSetting', (_e, key: string, value: unknown) => {
    const cur = store.settings.get('app') ?? { id: 'app' }
    store.settings.upsert({ ...cur, [key]: value })
  })

  ipcMain.handle('getRateConfig', () => getRateConfig(store))
  ipcMain.handle('saveRateConfig', (_e, cfg: RateConfig) => {
    store.settings.upsert({ id: 'rate', ...cfg })
  })
}
