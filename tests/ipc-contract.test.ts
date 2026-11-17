import { describe, expect, test } from 'vitest'
import type { Api } from '../src/shared/api'

// api.ts 定义的 renderer 侧契约方法名，须与 main 侧 ipcMain.handle 注册的 channel 一致。
const apiMethodChannels: Record<keyof Api, string> = {
  version: 'version',
  listProjects: 'listProjects',
  upsertProject: 'upsertProject',
  removeProject: 'removeProject',
  listSources: 'listSources',
  upsertSource: 'upsertSource',
  removeSource: 'removeSource',
  listIdentities: 'listIdentities',
  upsertIdentity: 'upsertIdentity',
  removeIdentity: 'removeIdentity',
  runSource: 'runSource',
  buildReport: 'buildReport',
  summarize: 'summarize',
  saveKey: 'saveKey',
  loadKey: 'loadKey',
  exportReport: 'exportReport',
}

describe('api/ipc contract', () => {
  test('every api method maps to a non-empty channel', () => {
    for (const [method, channel] of Object.entries(apiMethodChannels)) {
      expect(channel, `method ${method}`).toBeTruthy()
    }
  })
})
