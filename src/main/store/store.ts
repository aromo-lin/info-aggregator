import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Identity, Project, Source } from '../../shared/types'

export interface Collection<T extends { id: string }> {
  getAll(): T[]
  get(id: string): T | undefined
  upsert(entity: T): void
  remove(id: string): void
}

export interface Store {
  projects: Collection<Project>
  sources: Collection<Source>
  identities: Collection<Identity>
  settings: Collection<{ id: string; [key: string]: unknown }>
}

function makeCollection<T extends { id: string }>(dir: string, key: string): Collection<T> {
  const file = join(dir, `${key}.json`)

  const readAll = (): T[] => {
    try {
      const raw = readFileSync(file, 'utf-8')
      const parsed = JSON.parse(raw)
      return Array.isArray(parsed) ? (parsed as T[]) : []
    } catch {
      return []
    }
  }

  const writeAll = (items: T[]): void => {
    mkdirSync(dir, { recursive: true })
    const tmp = `${file}.tmp`
    writeFileSync(tmp, JSON.stringify(items, null, 2))
    renameSync(tmp, file)
  }

  return {
    getAll: readAll,
    get: (id) => readAll().find((x) => x.id === id),
    upsert: (entity) => {
      const items = readAll()
      const i = items.findIndex((x) => x.id === entity.id)
      if (i >= 0) items[i] = entity
      else items.push(entity)
      writeAll(items)
    },
    remove: (id) => writeAll(readAll().filter((x) => x.id !== id)),
  }
}

export function createStore(dir: string): Store {
  mkdirSync(dir, { recursive: true })
  return {
    projects: makeCollection<Project>(dir, 'projects'),
    sources: makeCollection<Source>(dir, 'sources'),
    identities: makeCollection<Identity>(dir, 'identities'),
    settings: makeCollection<{ id: string; [key: string]: unknown }>(dir, 'settings'),
  }
}
