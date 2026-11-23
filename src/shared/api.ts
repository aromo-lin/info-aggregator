import type { Identity, Project, RateConfig, RunRecord, ScrapedItem, Source } from './types'

export interface RunResult {
  sourceId: string
  items: ScrapedItem[]
}

export type ExportFormat = 'xlsx' | 'csv' | 'md' | 'html' | 'txt'

export interface Api {
  version: string
  listProjects(): Promise<Project[]>
  upsertProject(p: Project): Promise<void>
  removeProject(id: string): Promise<void>
  listSources(): Promise<Source[]>
  upsertSource(s: Source): Promise<void>
  removeSource(id: string): Promise<void>
  listIdentities(): Promise<Identity[]>
  upsertIdentity(i: Identity): Promise<void>
  removeIdentity(id: string): Promise<void>
  runSource(sourceId: string, onProgress: (msg: string) => void): Promise<RunResult>
  abortRun(sourceId: string): Promise<void>
  aiReport(items: ScrapedItem[], prompt: string): Promise<string | null>
  testAiConnection(opts: { model: string; apiKey: string; baseUrl?: string }): Promise<{ ok: boolean; detail: string }>
  exportItems(items: ScrapedItem[], format: ExportFormat): Promise<string | null>
  listRunRecords(): Promise<RunRecord[]>
  saveRunRecord(r: RunRecord): Promise<void>
  removeRunRecord(id: string): Promise<void>
  saveKey(provider: string, key: string): Promise<void>
  loadKey(provider: string): Promise<string | undefined>
  getSetting(key: string): Promise<unknown>
  saveSetting(key: string, value: unknown): Promise<void>
  getRateConfig(): Promise<RateConfig>
  saveRateConfig(cfg: RateConfig): Promise<void>
}
