import { contextBridge, ipcRenderer } from 'electron'
import type { Api } from '../shared/api'
import type { ScrapedItem } from '../shared/types'

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
    ipcRenderer.on('runSource:progress', (_e, m: { message: string }) => onProgress(m.message))
    return ipcRenderer.invoke('runSource', sourceId)
  },
  buildReport: (projectName, items, summary) => ipcRenderer.invoke('buildReport', projectName, items, summary),
  summarize: (items, opts) => ipcRenderer.invoke('summarize', items, opts),
  saveKey: (provider, key) => ipcRenderer.invoke('saveKey', provider, key),
  loadKey: (provider) => ipcRenderer.invoke('loadKey', provider),
  exportReport: (report, destDir) => ipcRenderer.invoke('exportReport', report, destDir),
}

contextBridge.exposeInMainWorld('api', api)

export type { ScrapedItem }
