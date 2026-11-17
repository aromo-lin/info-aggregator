import { ipcMain } from 'electron'
import { createStore } from './store/store'
import { app } from 'electron'
import { join } from 'node:path'
import { launchSession } from './browser/session'
import { xiaohongshuRecipe } from './recipes/xiaohongshu'
import type { Recipe } from './engine/recipe'
import type { RunResult } from '../shared/api'
import type { ScrapedItem } from '../shared/types'
import { cacheMedia } from './media/cache'
import { buildReport, exportMarkdownPackage } from './report/build'
import { summarize } from './ai/provider'
import { loadKey, saveKey } from './ai/keychain'

const recipes: Record<string, Recipe> = {
  xiaohongshu: xiaohongshuRecipe,
}

export function registerIpc(): void {
  const store = createStore(join(app.getPath('userData'), 'store'))

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
    const recipe = recipes[source.site]
    if (!recipe) throw new Error(`no recipe for site: ${source.site}`)

    const identity = source.identityId ? store.identities.get(source.identityId) : undefined
    const session = await launchSession(identity?.profileDir ?? join(app.getPath('userData'), 'profiles', 'default'))
    try {
      const emit = (message: string) => event.sender.send('runSource:progress', { message })
      const items = await recipe.run(session, source, (p) => emit(p.message))

      // 下载图片到本地，把 images 换成本地路径
      const mediaDir = join(app.getPath('userData'), 'media', source.id)
      const itemsWithLocal = await Promise.all(
        items.map(async (it) => {
          if (it.images.length === 0) return it
          const local = await cacheMedia(it.images, mediaDir)
          return { ...it, images: local }
        }),
      )

      // 记下已抓取的 id，供下次续抓去重
      const seen = new Set(source.seenItemIds)
      for (const it of itemsWithLocal) if (it.id) seen.add(it.id)
      store.sources.upsert({ ...source, seenItemIds: [...seen] })

      return { sourceId, items: itemsWithLocal }
    } finally {
      await session.close()
    }
  })

  ipcMain.handle('buildReport', (_e, projectName: string, items: ScrapedItem[], summary?: string) =>
    buildReport(items, { project: projectName, generatedAt: new Date().toISOString(), summary }),
  )

  ipcMain.handle('summarize', (_e, items: ScrapedItem[], opts) => summarize(items, opts))

  ipcMain.handle('saveKey', (_e, provider: string, key: string) => saveKey(provider, key))
  ipcMain.handle('loadKey', (_e, provider: string) => loadKey(provider))

  ipcMain.handle('exportReport', (_e, report, destDir: string) => exportMarkdownPackage(report, [], destDir))
}
