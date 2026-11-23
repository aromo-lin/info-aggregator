import { contextBridge, ipcRenderer } from 'electron'
import type { Api, ExportFormat } from '../shared/api'
import type { RunRecord, ScrapedItem } from '../shared/types'

const api: Api = {
  version: '0.1.0',
  listProjects: () => ipcRenderer.invoke('listProjects'),
  upsertProject: (p) => ipcRenderer.invoke('upsertProject', p),
  removeProject: (id) => ipcRenderer.invoke('removeProject', id),
  listSources: () => ipcRenderer.invoke('listSources'),
  upsertSource: (s) => ipcRenderer.invoke('upsertSource', s),
  removeSource: (id) => ipcRenderer.invoke('removeSource', id),
  listIdentities: () => ipcRenderer.invoke('listIdentities'),
  upsertIdentity: (i) => ipcRenderer.invoke('upsertIdentity', i),
  removeIdentity: (id) => ipcRenderer.invoke('removeIdentity', id),
  runSource: (sourceId, onProgress) => {
    const handler = (_e: unknown, m: { message: string }) => onProgress(m.message)
    ipcRenderer.on('runSource:progress', handler)
    return ipcRenderer.invoke('runSource', sourceId).finally(() => {
      ipcRenderer.removeListener('runSource:progress', handler)
    })
  },
  aiReport: (items, prompt) => ipcRenderer.invoke('aiReport', items, prompt),
  abortRun: (sourceId) => ipcRenderer.invoke('abortRun', sourceId),
  testAiConnection: (opts) => ipcRenderer.invoke('testAiConnection', opts),
  exportItems: (items: ScrapedItem[], format: ExportFormat) => ipcRenderer.invoke('exportItems', items, format),
  listRunRecords: () => ipcRenderer.invoke('listRunRecords'),
  saveRunRecord: (r: RunRecord) => ipcRenderer.invoke('saveRunRecord', r),
  removeRunRecord: (id: string) => ipcRenderer.invoke('removeRunRecord', id),
  saveKey: (provider, key) => ipcRenderer.invoke('saveKey', provider, key),
  loadKey: (provider) => ipcRenderer.invoke('loadKey', provider),
  getSetting: (key) => ipcRenderer.invoke('getSetting', key),
  saveSetting: (key, value) => ipcRenderer.invoke('saveSetting', key, value),
  getRateConfig: () => ipcRenderer.invoke('getRateConfig'),
  saveRateConfig: (cfg) => ipcRenderer.invoke('saveRateConfig', cfg),
}

contextBridge.exposeInMainWorld('api', api)

export type { ScrapedItem }
