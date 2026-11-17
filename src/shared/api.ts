import type { Identity, Project, ScrapedItem, Source } from './types'

export interface RunResult {
  sourceId: string
  items: ScrapedItem[]
}

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
  buildReport(projectName: string, items: ScrapedItem[], summary?: string): Promise<{ html: string; markdown: string }>
  summarize(items: ScrapedItem[], opts: { model: string; apiKey: string; requirement: string }): Promise<string>
  saveKey(provider: string, key: string): Promise<void>
  loadKey(provider: string): Promise<string | undefined>
  exportReport(report: { html: string; markdown: string }, destDir: string): Promise<string>
}
